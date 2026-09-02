---
title: Writing async-like code in durable execution
description: Write straight-line Mojo. If the process dies halfway through, it resumes without redoing the work that already succeeded. Here is the whole API, and how to handle every way a step can fail.
eyebrow: Durable execution
date: 2026-09-02
sourceUrl: https://github.com/magmalake/restate.mojo
sourceLabel: restate.mojo
draft: true
---

Write ordinary straight-line code. If the process dies halfway through, it resumes without redoing the parts that already succeeded — no callbacks, no state machine, no reconciliation job. This is what that looks like in Mojo.

## Write the linear code

An order flow: reserve stock, charge a card, ship. Read it as if nothing can go wrong.

```mojo
var reservation_id = reserve(app, inv)
var charge_id      = charge(app, inv)
var shipment_id    = ship(app, inv)
```

A first failure happens and the card declines. Under the hood Restate re-delivers the invocation, the handler runs again from the top, and **reserve does not run a second time** — its result is replayed from the journal.

```plain
--- attempt 1
[attempt 1] execute  reserve  -> res-order-1-c4ea8c
[attempt 1] execute  charge   -> card declined
--- attempt 2
[attempt 2] REPLAY   reserve  -> res-order-1-c4ea8c
[attempt 2] execute  charge   -> chg-order-1-b40aa
[attempt 2] execute  ship     -> shipped
```

That reservation_id ends in a nanosecond timestamp. A second execution could not have produced the same string, so the value came from the journal rather than from running the step again.

## The whole program

The service in full. The three steps are defined below.

```mojo
from restate import App, Ctx, Invocation, Unit

def handle_process(
    app: App, inv: Invocation, worker: Int, ctx: Ctx[Unit]
) raises:
    var reservation_id = reserve(app, inv)
    var charge_id      = charge(app, inv, reservation_id)
    var shipment_id    = ship(app, inv, reservation_id, charge_id)
    app.complete(
        inv, String(reservation_id, " / ", charge_id, " / ", shipment_id)
    )

def main() raises:
    var nothing = Unit()
    _ = App.run[Unit, __functions_in_module()]("Orders", nothing)
```

`App.run` finds every `handle_*` function in the module, registers each under the name after the prefix, and serves them across a pool of worker threads — one per core by default. A request to `/Orders/order-1/process` arrives at `handle_process`.

`Unit` says this service keeps nothing in process memory. Everything it remembers lives in Restate state, keyed by the object key. Services that do share state across handlers put it in a struct; that comes later.

## Journal a step

A step becomes replayable by wrapping it. `step` either replays the recorded value or runs the closure once and journals what it returned.

```mojo
def reserve(app: App, inv: Invocation) raises -> String:
    @parameter
    def compute() raises -> String:
        return reserve_stock(inv.input_string())

    return app.step[compute](inv)
```

`inv.input_string()` is the request body. Wrap anything whose effect you do not want repeated: a charge, an email, an id from a remote service. Cheap idempotent reads do not need it.

If the closure raises, the step is closed as a failure and Restate runs it again. That matters more than the brevity: a journaled block that is opened and never closed leaves the invocation unable to replay at all.

## Pass values along

A reservation id has to reach the charge. It is a function argument — there is no context object to thread through, and nothing to persist by hand.

```mojo
def charge(
    app: App, inv: Invocation, reservation_id: String
) raises -> String:
    @parameter
    def compute() raises -> String:
        return charge_card(reservation_id)

    return app.step[compute](inv)

def ship(
    app: App, inv: Invocation, reservation_id: String, charge_id: String
) raises -> String:
    @parameter
    def compute() raises -> String:
        return dispatch(reservation_id, charge_id)

    return app.step[compute](inv)
```

```mojo
var reservation_id = reserve(app, inv)
var charge_id      = charge(app, inv, reservation_id)
var shipment_id    = ship(app, inv, reservation_id, charge_id)
```

On a retry the handler runs from the top and every completed step returns its journaled value, so `reservation_id` and `charge_id` hold what they held the first time. The locals rebuild themselves. That is the difference between this and a workflow engine where each step reads and writes a shared context.

For anything that must outlive the invocation — a status another request will ask about — use `app.set_state(inv, "reservation", reservation_id)`, which is keyed by the object key rather than by the invocation.

## Handle failure modes

"It failed" is three different things, and picking the wrong one is the most common way to misuse a durable execution engine.

| Call | Journaled | Effect |
| --- | --- | --- |
| `run_fail(terminal=False)` | no | the step runs again — a blip, a timeout, a 503 |
| `run_fail(terminal=True)` | as a failure | raised, so you can compensate and finish |
| `app.fail(inv, msg)` | ends it | the caller gets an error, nothing is retried |

A malformed order will not become well-formed by being tried again. A card network having a bad minute will. Retry the second, fail the first.

`step` takes the first of these for you — a closure that raises is retried.
The other two are explicit, for a step that is finished failing and an
invocation that is a lost cause.

## Suspension is not failure

There is a fourth state. Waiting on a durable sleep, an awakeable or a retry delay, an invocation is _suspended_ — parked, to be resumed later. It arrives as an exception like any other. Treat it as a failure and you will compensate for work that is merely waiting.

```mojo
except e:
    if is_suspended(e):
        raise e          # parked, not failed
    compensate()
```

## Bound retries

Retries are unbounded unless you say otherwise. That is right for a payment and wrong for a courtesy email nobody is waiting on.

```mojo
return app.step[compute](inv, initial_delay_ms=250, max_attempts=3)
```

Three attempts a quarter-second apart, then the block fails terminally and the handler carries on. The order still gets placed.

```plain
[attempt 5] execute  notify   -> smtp timeout
[attempt 6] execute  notify   -> smtp timeout
[attempt 7] execute  notify   -> smtp timeout
  gave up after 3 tries: Terminal error [500]: smtp timeout
```

## Share state across workers

Handlers run on several threads at once. State they share lives in a struct, and `Ctx[T]` hands each handler a typed view of it.

```mojo
@fieldwise_init
struct Stats(Copyable, Movable):
    var live: Int64

def handle_hold(
    app: App, inv: Invocation, worker: Int, ctx: Ctx[Stats]
) raises:
    counter(ctx[].live).increment()

def main() raises:
    var stats = Stats(0)
    _ = App.run[Stats, __functions_in_module()]("Orders", stats)
```

`Ctx` types the sharing; it does not synchronise it. Every worker sees the same struct concurrently, so fields more than one handler touches must be atomics.

Handlers are non-capturing, because a thread start routine takes a function pointer and one `void *` — which is why state arrives as a parameter rather than a closure capture. When Mojo can carry captures across a thread boundary, that parameter disappears and `ctx[].live` becomes `live`: a rename, not a rewrite.

## Mojo specifics

`__functions_in_module()` is how handlers are found. Both the registration list and the dispatch are derived from the same `handle_*` functions at compile time, so they cannot disagree — there is no list of handler names to keep in step, and no `if inv.handler == …` chain to extend.

Should we generate the transitional code with a macro? No — the compiler already does. The adapter bridging a typed handler to the thin one the thread pool needs is a parameterised function instantiated per handler. `comptime` shrinks the hand-written layer to nothing; what it cannot do is make a runtime closure cross a thread boundary, and that is the one piece still waiting on the language.

## Getting it

```sh
pixi global install --channel https://mojoshelf.org/channel mojoshelf
pixi shelf add restate-mojo
```

[restate.mojo](https://github.com/magmalake/restate.mojo) is Apache-2.0 and built on the official Restate Rust SDK behind a C ABI: Rust owns the HTTP/2 endpoint, the event loop and the journal; your handlers are Mojo. `examples/failures.mojo` is the program the logs above come from, and runs against a real Restate server in about ten seconds.

## The journey

The API above is the third shape. The first two are worth describing, because the mistakes were not in the happy path — durable execution hands you that — but in the failure paths, and they took a while to see.

**A run block you could open but not close.** Originally there was no way to fail a journaled step. Raising between `run_enter` and `run_exit` left the block open, and the journal kept expecting an exit that never came. Every subsequent attempt died with `protocol error: expected rst_run_exit`, so the invocation could neither complete nor terminally fail — it retried that error forever. The workaround was to do the fallible call _before_ opening the block, which works and leaves a window where a crash between a successful charge and the journal write charges the card twice. That window is exactly what a run block exists to close, so the workaround was the wrong shape.

**Byte offsets instead of a type.** Because handlers must be non-capturing, shared state travelled through an untyped pointer, and reading it looked like `AtomicCounter.at(Int(ctx) + C_LIVE * 8)` — with a constant that had to stay in sync with a layout written down nowhere. Rust developers will recognise the era: before `async fn`, you hand-wrote the state machine the compiler now generates.

**A simple API that was a trap.** The first version had a single-threaded driver — you wrote the loop, pulled invocations, handled them. Simplest thing that could work, and it made a lovely first example. It also deadlocked the moment a handler called another handler in the same process: no second thread to run the callee, and nothing in the API saying so. It passed every test that did not happen to make that call, and hung the first time someone added one.

It survived a release because the alternative meant reaching state through that raw pointer. Once `Ctx[T]` removed the cost, the loop offered nothing but the trap, and it is gone. There is a version of API design where you keep the simple thing beside the correct thing and document the difference. We tried it. The documentation was accurate and it did not help, because the failure is silent and arrives long after the choice.

**A protocol written out five times.** Journaling a step began as
`run_enter`, a branch on the `Optional`, the work, then `run_exit` — four
lines at every call site, five times in the example alone. Repetition is the
mild version of the problem: the real one is that closing the block correctly
was the caller's job on every occasion, and the failure mode for getting it
wrong was an invocation that could never replay again. `step` takes a closure
and does it, which is possible because a step never crosses a thread boundary
— unlike the handler, it is an ordinary local call and can capture.

**Swallowing a suspension.** Writing the retry example, we caught every exception around a compensating step — including suspension, which meant compensating for work that was merely parked, three times over. It is an easy mistake in any handler that compensates, which is why it has a section of its own above.

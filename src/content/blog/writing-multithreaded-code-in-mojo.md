---
title: Writing ergonomic multithreaded code in Mojo 1.0, 1.0, 1.0, …
description: First-class async is explicitly post-1.0, and the concurrency library Mojo 1.0 does ship is one its own team tells you to avoid. Here is what you can use today — a thin function, a typed context, and about twenty lines you write once.
eyebrow: Concurrency
date: 2026-09-02
sourceUrl: https://github.com/magmalake/threads.example
sourceLabel: threads.example
related:
  - multithreading-with-origins-in-mojo
draft: false
---

<!-- A correction, not a "see also": the pattern below is unsafe and this has
     to be read before the listing. Raw HTML so it is styled as a callout;
     please keep it at the top and leave the markup alone. -->
<aside class="callout callout--correction" aria-labelledby="correction-heading">
  <p class="callout__label" id="correction-heading">Correction</p>
  <p><strong>Do not build on the <code>Ctx[T]</code> pattern below — it has a
  lifetime bug.</strong> <code>Ctx[T]</code> erases the origin of the state it
  shares, so the compiler cannot see that the threads use it and destroys
  <code>totals</code> before the first thread starts. The program below printed
  <code>499500</code> by luck, not by construction.</p>
  <p>The fix is to stop erasing the origin in user code: <code>parallel_for</code>
  now takes the state as a <code>ref</code> argument, so its lifetime covers the
  call and the joins inside it. <a
  href="/blog/multithreading-with-origins-in-mojo/">Multithreading with origins
  in Mojo 1.0</a> has the corrected program, the library change behind it, and a
  harness that tests for this. Read that one first; the rest of this post is
  left as it was written.</p>
</aside>

Mojo compiles to native code and your machine has ten cores. Using them is
awkward today, for a reason the roadmap states plainly: first-class `async`,
"fully integrated with Mojo's type and memory models", is Phase 2 work that
has not started. A robust async model was explicitly [not part of
1.0](https://www.modular.com/blog/the-path-to-mojo-1-0).

What 1.0 does ship is `std.runtime.asyncrt` — "the low level concurrency
library" — and the honest summary is that you should not build on it yet.
Modular says so themselves; the next section shows what happens when you try.
Meanwhile `parallelize` is still alive, but it now lives in MAX rather than
the standard library, alongside the rest of the accelerator APIs.

That leaves the threads your OS already has, reached through FFI. Those will
not accept a closure. The Mojo way is to propose a solution as a library, so let’s see how far we can go.

We can definitely write a program that saturates every core. Here is the complete code using the threads tin.

## The whole program

```mojo
from threads import AtomicCounter, OpaquePtr, num_cpus, parallel_for


@fieldwise_init
struct Totals(Copyable, Movable):
    var sum: Int64


def counter(ref cell: Int64) -> AtomicCounter:
    return AtomicCounter.at(Int(Pointer(to=cell)))


def task(i: Int, ptr: OpaquePtr) -> None:
    var t = Ctx[Totals].of(ptr)
    _ = counter(t[].sum).fetch_add(Int64(i))


def main() raises:
    var totals = Totals(0)
    parallel_for[task](1000, Ctx[Totals].to(totals).opaque())
    print("cores:", num_cpus(), " sum:", totals.sum)
```

That prints `cores: 10  sum: 499500` — every index counted exactly once.

The listing is a repository of its own,
[threads.example](https://github.com/magmalake/threads.example): `pixi run run`
builds it against the tin from mojoshelf and prints that line, on Linux and
macOS in its CI. Comments and pull requests on the code go there.

`parallel_for` starts one thread per core, hands each of them indices from a
shared atomic counter until the 1000 tasks are gone, and joins every thread
before it returns. Your `task` runs on all ten cores; `totals` is a plain
struct on `main`'s stack that every thread updates.

`Ctx[Totals]` is the only thing above that is not from the library. It is
twenty lines, written once, and it appears in full two sections down. The
other two questions the listing raises: why `task` is a top-level function
rather than a closure, and why the counter is built from a `ref` rather than
owned.

## The runtime you have

Before the pattern, the alternative, because it is right there in the standard
library and it is reasonable to ask why not use it.

`std.runtime.asyncrt` gives you `Task`, `TaskGroup`, `create_task` and
`parallelism_level`. Small examples work. `TaskGroup` with four trivial tasks
returns the right answer.

Two things stop it being the answer today. The first is sizing:

```mojo
print(parallelism_level())   # 4, on a ten-core machine
```

Four workers on ten cores, and per Modular that is [not adjustable from
outside](https://forum.modular.com/t/configure-asyncrt-parallelism-level/2107)
— "not a value that can be set externally right now". This number is shared
infrastructure rather than a knob for your program; the Mojo compiler reads it
to decide its own thread count.

The second is that it deadlocks. Take a working `TaskGroup` program and add a
plain loop that calls the same function synchronously before the group is
built:

```mojo
for i in range(n):
    sink += digest(i, r)     # a warm-up loop, on the main thread

var tg = TaskGroup()
for i in range(n):
    tg.create_task(work(i, r, p))
tg.wait()                    # never returns
```

`wait()` never returns. Four runs out of four, with as few as **four** tasks —
so it is not load, it is shape. Delete the warm-up loop and the same binary
completes every time. `initialize_runtime()` does not help. I did not chase the
root cause, so take that as a report rather than a diagnosis.

None of which is a complaint, because Modular's own guidance says the same
thing. Josh Peterson: "I would avoid using asyncrt for this kind of async
programming now." Owen Hilyard, on the state of async generally: "it would be
generous to call it 'half baked'."

## Thin functions

A thread starts through the C ABI. `pthread_create` takes a bare function
pointer and exactly one `void*`, and that signature reaches all the way up: the
work function must be **thin** — a function with no captured state.

Mojo will tell you so, precisely:

```plain
error: invalid call to 'parallel_for': 'parallel_for' parameter 'work' has
'WorkFn' type, but value has type 'def(i: Int, ptr: Pointer[UInt8,
MutUntrackedOrigin]) capturing thin -> None'
```

That error is for the version everyone writes first:

```mojo
var total = Int64(0)

@parameter
def task(i: Int, ptr: OpaquePtr) -> None:
    total += Int64(i)          # nope
```

`capturing thin` is the detail worth internalising. `@parameter` does not mean
"non-capturing"; it means the closure is a compile-time value that _may_
capture, and that is a different type from a plain thin function. It stays a
different type even when the closure captures nothing at all — deleting the
body's reference to `total` does not make the error go away. There is no
annotation that demotes it.

Dropping `@parameter` fails earlier and more bluntly:

```plain
error: Could not infer capture convention of the captured value total
```

So the rule is simple, if unfamiliar: **work functions are top-level `def`s**.
Everything they need arrives through the one pointer argument.

## A typed context

One `void*` for all your state is workable but miserable — every task begins
by casting an untyped pointer and indexing into it by hand, and nothing checks
that the offsets agree.

The fix is about twenty lines, written once:

```mojo
@fieldwise_init
struct Ctx[T: AnyType](Copyable, Movable):
    """A typed view of the pointer each task is handed."""

    var _ptr: Pointer[Self.T, MutUntrackedOrigin]

    @staticmethod
    def to(ref state: Self.T) -> Self:
        return Self(Pointer[Self.T, MutUntrackedOrigin](
            unsafe_from_address=Int(Pointer(to=state))))

    @staticmethod
    def of(ptr: OpaquePtr) -> Self:
        return Self(Pointer[Self.T, MutUntrackedOrigin](
            unsafe_from_address=Int(ptr)))

    def __getitem__(self) -> ref [MutUntrackedOrigin] Self.T:
        return self._ptr[]

    def opaque(self) -> OpaquePtr:
        return OpaquePtr(unsafe_from_address=Int(self._ptr))
```

`Ctx[Totals].to(totals)` on the calling side, `Ctx[Totals].of(ptr)` inside the
task, and in between an ordinary struct with named fields. `t[].sum` is a
field access the compiler checks; add a field and every task sees it.

Note what `Ctx[T]` does not do. It types the sharing; it does not synchronise
it. `MutUntrackedOrigin` is the annotation saying so — you have stepped
outside what the borrow checker can prove, deliberately, because the thing you
are proving is that ten threads may hold this at once.

Be clear about how far outside. Rust would stop you here unless your type were
`Send`, and Mojo has no `Send` and no `Sync`. They are not missing from your
program; they are missing from the language, they are prerequisites in the
[structured-async proposal](https://forum.modular.com/t/structured-async-for-mojo/487),
and they are not on the roadmap. So there is no annotation you could add that
would make the compiler check this, and none of the usual instincts about the
borrow checker having your back apply.

The compiler is not merely silent, either. In one of the programs above it
optimised away a loop whose only effect was through the pointer, and warned
that the write "was never used" — it could not see that the pointer aliased
the variable. That is the same blindness, showing up as a wrong answer instead
of a data race.

Which puts the weight on review rather than on types. Keeping the state in one
struct is what makes that possible: a single place to look and ask which
fields are written concurrently, and a short enough list that the question has
an answer.

## Atomics are views

`AtomicCounter` is a _view over a cell_, not a counter that owns storage:

```mojo
def counter(ref cell: Int64) -> AtomicCounter:
    return AtomicCounter.at(Int(Pointer(to=cell)))
```

The struct owns a plain `Int64`; the view borrows its address and performs
atomic operations on it. This reads backwards until you notice it is the only
arrangement that composes — a counter that owned its storage could not live
inside your context struct, because the context is a value you copy the
address of, not an object with a lifetime the threads share.

The practical form: put `Int64` fields in the struct, take a view where you
need one, do not keep the view.

## What it costs

Let’s evaluate the synchronization costs. Swap the one-line task body for a `digest(i)` doing a few
hundred thousand rounds of arithmetic, run 400 of them on a ten-core machine,
and compare against the same loop written serially:

|  | wall clock |
| --- | --- |
| serial `for` loop | 127 ms |
| `parallel_for` | 17 ms |

About 7×, and the two runs produce the same sum. Both figures are stable to
the millisecond across runs, which is itself worth knowing: this is native
code with no runtime deciding when to schedule you.

Ten cores never give you a speedup of ten, and the missing three are worth
pricing rather than waving at. The counter is the shared thing, so measure the
counter on its own — a million `fetch_add` calls, first on one thread, then
spread across ten:

| a million atomic increments | wall clock |
| --- | --- |
| one thread, no contention | 1 ms |
| ten threads, same counter | 28 ms |

Same instruction, same total count, **28× the cost** — that is the cache line
holding the counter bouncing between cores. Correct either way: both runs end
at exactly 1,000,000.

Which sets the rule for when threads are worth it. `digest` was deliberately
sized so the arithmetic dwarfs the increment, and that is why the first table
shows a win. Give each task nothing to do but touch the shared counter and
the same code loses to a serial loop. The question is never "how many cores"
but "how much work per synchronisation" — and 28 ns is the number to beat.

## Longer-lived threads

`parallel_for` is right when the work is a known set of independent tasks.
When threads must outlive one call — a server with a socket per worker —
`WorkerPool` is the other API:

```mojo
comptime WorkerFn = def(Int, OpaquePtr, AtomicFlag) thin -> None
```

Same thin constraint, same single pointer, plus an `AtomicFlag` each worker
polls to know when to stop. `Mutex` and `CondVar` are there for the cases
where an atomic is not enough.

## Getting it

```sh
pixi global install --channel https://mojoshelf.org/channel mojoshelf
pixi shelf add threads-mojo
```

[threads.mojo](https://github.com/magmalake/threads.mojo) is Apache-2.0 and
built on pthreads through Mojo's FFI — no runtime, no scheduler, nothing
between your function and the thread. It is pinned to Mojo 1.0.0, and the
C surface it binds to is not going anywhere.

## The journey

We did not set out to write a threading library. We were porting a durable
execution client, which needs to serve a handler on every core, and
`std.algorithm.parallelize` had gone from the nightly we were tracking.

We assumed it had been withdrawn. It had not: 1.0 moved the accelerator APIs
into a separate `max` package and `parallelize` went with them, to
`max.algorithm.backend.cpu`. It is still there, and if you already depend on
MAX it is the shortest path. We wanted a threading primitive without an AI
platform underneath it, which is a preference rather than a limitation, and
worth saying plainly.

The pthread FFI wrapper took an afternoon. Everything after that was learning
what the thin-function constraint actually implies, mostly by writing code
that did not compile:

- A `@parameter` closure looked like the answer for a week. It compiles at the
  definition site and fails at the point of use, which is a slow way to find
  out.
- The first version of the context was an `Int` address and hand-written
  offsets — `Int(ctx) + C_LIVE * 8`. It worked, it was fast, and every field
  added was a chance to get an offset wrong. `Ctx[T]` came out of one such
  mistake.
- We wrote `AtomicCounter(0)` as a struct field and got a counter over freed
  stack memory. That is the bug that taught us it is a view.

The constraint that took longest to accept is that a work function cannot
close over anything. It reads as a missing feature, and one day it may be
filled in — Rust made the same journey, and everyone who wrote a `Future` by
hand before `async` recognises the shape. Until then the pattern above is what
we use everywhere, and the twenty lines of `Ctx[T]` turn out to buy back most
of the ergonomics.

Nothing here is a workaround Modular would disown. Asked about CPU threading
today, Owen Hilyard's answer was: "Nothing actually stops you from using C ffi
to lean on the platform threading primitives, but I know that's not exactly an
ideal path." That is this library, described by someone who works on the
language — the sanctioned option, with the caveat attached. Chris Lattner on
the design taking its time: "I think the combination of features we have in
Mojo will allow us to do something quite special, but I don't want to rush
it."

So treat `threads.mojo` as scaffolding with a known expiry. When `Send`,
`Sync` and first-class `async` land, the ergonomic answer will be in the
language and most of this post should stop being true. We would rather have
ten cores in the meantime.

One spelling note for anyone reading the source: `Pointer` is the current
name, `UnsafePointer` is the deprecated one, and since 0.2.2 the tin compiles
with no deprecation warnings on either 1.0.0 or nightly — `Pointer`,
`unsafe_alloc` and `ptr[unsafe_offset=i]` are the forms it uses.

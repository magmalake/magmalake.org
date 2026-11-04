---
checked: 0.4.1
---

## What it's for

restate gives Mojo durable execution through [Restate](https://restate.dev): handlers whose state, timers, calls and side effects are journaled, so a retry replays the finished steps instead of running them again. A Rust shim embeds the official Restate SDK, which owns the HTTP/2 endpoint and the journal; your handlers are plain Mojo functions served on a pool of [threads](/s/threads). It stands apart from the data path: no other tin depends on it.

## Install

A new project needs Modular's channel, pixi's build preview and the compiler before the tin:

```sh
pixi init app -c https://conda.modular.com/max -c conda-forge && cd app
sed -i.bak 's/^\[workspace\]/[workspace]\npreview = ["pixi-build"]/' pixi.toml
pixi add "mojo-compiler==1.2.0"
pixi shelf add restate-mojo      # brings threads-mojo, and builds the Rust shim
```

The first install compiles the shim (`restate-sdk` and tokio) with conda-forge's Rust, which takes a few minutes. Your program needs a Restate server to register with: `npx @restatedev/restate-server` runs one, and `npx @restatedev/restate deployments register http://localhost:9080` points it at your endpoint.

## Quick start

A virtual object with a counter and a journaled step. Run it with a Restate server; the program compiles as is.

```mojo
from restate import App, Ctx, Invocation, Unit


def handle_add(app: App, inv: Invocation, worker: Int, ctx: Ctx[Unit]) raises:
    var n = app.get_state_int(inv, "count", 0) + 1   # this key's durable state
    app.set_state_int(inv, "count", n)
    app.complete(inv, String(n))


def handle_tag(app: App, inv: Invocation, worker: Int, ctx: Ctx[Unit]) raises:
    var key = inv.key

    def make_tag() raises {imm key} -> String:
        return "tag-for-" + key                      # runs once, then replays

    var tag = app.step(inv, make_tag)
    app.sleep_ms(inv, 1000)                          # a journaled timer
    app.complete(inv, tag)


def main() raises:
    var nothing = Unit()
    # Registers `add` and `tag` on the virtual object `Counter`, listens on
    # :9080 and serves on one thread per core until `app.stop()`.
    _ = App.run[Unit, __functions_in_module()]("Counter", nothing)
```

Then `curl -X POST localhost:8080/Counter/alice/add -d '""'` answers `1`, then `2`.

## API

Everything is exported from `restate`.

**Serving.** `App.run[T: AnyType, funcs: Tuple, /](service: String, ref state: T, object: Bool = True, workflow: Bool = False, host: String = "0.0.0.0", port: Int = 9080, num_workers: Int = 0) raises -> Int` finds every `handle_*` function in the module you pass `__functions_in_module()` from, registers each under the name after the prefix, serves until `stop()` and returns how many invocations completed. A handler is `def(App, Invocation, Int, Ctx[T]) thin raises -> None`: the app, the invocation, the worker index and your shared state. `object=True` is a Virtual Object (keyed, with state), `object=False` a stateless Service, and `workflow=True` a Workflow whose `run` handler executes once per key.

**`App(service: String, handlers: List[String], object: Bool = True, workflow: Bool = False, host: String = "0.0.0.0", port: Int = 9080) raises`** with `serve[handler: HandlerFn](self, num_workers: Int = 0, ctx: OpaquePtr = opaque_ptr(0)) raises -> Int` or `serve_with[T, handler](self, ref state: T, num_workers: Int = 0) raises -> Int` is the same loop when you list the handlers and dispatch on `inv.handler` yourself.

**`Invocation`**: `handler`, `key` (empty for a Service), `id`, `input` (raw bytes) and `input_string()`.

**`App`** operations, each taking the invocation first:

- `get_state(self, inv: Invocation, key: String) raises -> Optional[String]`, `get_state_int(self, inv: Invocation, key: String, default: Int) raises -> Int`, `set_state(self, inv: Invocation, key: String, value: String) raises`, `set_state_int`, `clear_state`, and `_bytes` variants for binary values.
- `sleep_ms(self, inv: Invocation, millis: Int) raises`: a durable timer; a long one suspends the invocation.
- `step[F: def () raises -> String](self, inv: Invocation, f: F, initial_delay_ms: Int = 0, factor: Float64 = 0.0, max_delay_ms: Int = 0, max_attempts: Int = 0, max_duration_ms: Int = 0) raises -> String`: replays a journaled result or runs `f` and journals it. If `f` raises, the step is retried; the retry arguments bound that, and with none Restate retries forever.
- `run_enter(self, inv: Invocation) raises -> Optional[String]`, `run_exit(self, inv: Invocation, value: String) raises -> String` and `run_fail(self, inv: Invocation, message: String, terminal: Bool = True) raises -> Optional[String]`: the same protocol by hand, when a step must fail terminally so the handler can compensate.
- `call(self, inv: Invocation, service: String, handler: String, payload: String, key: String = "") raises -> String` and `send(self, inv: Invocation, service: String, handler: String, payload: String, key: String = "", delay_ms: Int = 0) raises`: durable request/response and one-way messages.
- `awakeable_create(inv) -> String` and `awakeable_await(inv, id) -> String`: a promise resolved from outside, through another handler's `awakeable_resolve`/`awakeable_reject` or the ingress API. `promise_await`, `promise_peek`, `promise_resolve` and `promise_reject` are a Workflow's named promises.
- `complete(self, inv: Invocation, output: String) raises` finishes an invocation; `fail(self, inv: Invocation, message: String) raises` ends it with a terminal error that isn't retried. `cancel_invocation(inv, invocation_id)` cancels another one.
- `stop(self) raises` releases every worker, from any thread, including from inside a handler; `is_stopping()` reports it.

**`Ctx[T]`**: a typed pointer to the state you passed to `run`; read it as `ctx[].field`. **`Unit`** is the state for a service that keeps none in process.

## Rules and limits

- A handler must end its invocation with `complete`, `fail` or a raise. A raise is caught: the invocation is abandoned, Restate delivers it again, and the error is printed unless it's a suspension (`is_suspended(e)`).
- Code between durable operations has to be deterministic, because a retry replays the journal and re-runs your handler. Put time, randomness and I/O inside `step`. Every `run_enter` that returns None must be closed by exactly one `run_exit` or `run_fail`, or every later attempt raises a protocol error.
- Use at least 2 workers if a handler `call`s another handler in the same process: with `num_workers=1` that deadlocks. The default, 0, means one per core. A Virtual Object already runs one invocation per key at a time; workers add concurrency across keys.
- Payloads are raw bytes: a JSON `"x"` arrives with its quotes, so parse and serialize in the handler.
- `ctx[]` is shared by every worker at once; fields that several handlers change have to be atomics.
- The shim is loaded from `$CONDA_PREFIX/lib`, so run your program with `pixi run`. Errors from the shim raise as `restate <operation> failed: <message>` or `restate terminal error in <operation>: <message>`.
- Workflow mode works but has no end-to-end test yet.

## Tests

`pixi run it` and `pixi run it-served` each start a throwaway `restate-server` through `npx`, register an example endpoint and check it over HTTP. `it` covers state, sleep, journaled steps and awakeables. `it-served` covers self-calls with 4 workers, invocations overlapping, and `stop()` from inside a handler; it also shows that the self-call still deadlocks with 1 worker. Ports can be changed with `RESTATE_IT_INGRESS`, `RESTATE_IT_ADMIN`, `RESTATE_IT_NODE` and `RESTATE_IT_ENDPOINT`. CI runs both on macOS and Linux with Mojo 1.2.0 and Node 22.

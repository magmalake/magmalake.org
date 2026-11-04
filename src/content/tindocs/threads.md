---
checked: 0.6.1
---

## What it's for

threads is how a Mojo program uses more than one core today: it wraps pthreads with spawn and join, 64-bit atomics, a mutex and condition variable, `parallel_for` over a bounded set of tasks, and pools of long-running workers. [parquet](/s/parquet) and [iceberg](/s/iceberg) fan reads out with `parallel_for`, [postgres](/s/postgres) blocks pool checkouts on its condition variable, and [restate](/s/restate), [k8s](/s/k8s), [flare_mlake](/s/flare_mlake) and [Orca](/s/orca) build on it too. It's a stopgap until the standard library has threads of its own.

## Install

A new project needs Modular's channel, pixi's build preview and the compiler before the tin:

```sh
pixi init app -c https://conda.modular.com/max -c conda-forge && cd app
sed -i.bak 's/^\[workspace\]/[workspace]\npreview = ["pixi-build"]/' pixi.toml
pixi add "mojo-compiler==1.2.0"
pixi shelf add threads-mojo    # no other tins
```

If you build from a checkout instead, pass both `-I ../threads.mojo/src` and `-I ../threads.mojo/compat`. The installed package needs neither.

## Quick start

Square 1000 numbers across every core, each task writing its own slot and adding to one shared total atomically:

```mojo
from threads import AtomicCounter, num_cpus, parallel_for


@fieldwise_init
struct Work(Copyable, Movable):
    var squares: List[Int64]    # one slot per task: no two tasks write the same one
    var total: Int64            # shared by every task: only touched atomically


def task(i: Int, mut w: Work) -> None:
    var sq = Int64(i) * Int64(i)
    w.squares[i] = sq
    _ = AtomicCounter.at(Int(Pointer(to=w.total))).fetch_add(sq)


def main() raises:
    var n = 1000
    var w = Work(List[Int64](length=n, fill=0), 0)
    parallel_for[task](n, w)             # num_workers=0: one thread per CPU
    print(num_cpus(), w.squares[999], w.total)   # ... 998001 332833500
```

## API

Everything is exported from `threads`. A task or worker body is a `thin` function: it can't capture and it can't raise.

**Bounded work:**

- `parallel_for[task: TaskFn[T]](n_tasks: Int, ref[origin] state: T, num_workers: Int = 0) raises`: runs `task(i, state)` for every `i` in `[0, n_tasks)`, where `TaskFn[T]` is `def(Int, mut T) thin -> None`. Threads pull indices off one atomic counter, and every thread is joined before it returns. `0` workers means `num_cpus()`.
- `parallel_for[work: WorkFn](n_tasks: Int, ctx: OpaquePtr, num_workers: Int = 0) raises`: the same over a raw pointer, with `WorkFn` = `def(Int, OpaquePtr) thin -> None`. You keep `ctx` alive.
- `spawn_n[start: StartFn](n: Int, ctx: OpaquePtr, stride: Int = 0) raises -> ThreadGroup`: starts `n` threads, thread `i` getting `ctx + i * stride`. `ThreadGroup` has `join_all(mut self) raises` and `pin_all(self) raises`.

**Long-running workers:**

- `TypedPool.start[task: PoolTaskFn[T]](n: Int, ref[origin] state: T) raises -> TypedPool[T, origin]`: starts `n` workers running `task(index, state, stop)` until stopped. The pool carries `state`'s origin, so the state outlives it. A form without `n` starts `num_cpus()` workers.
- `WorkerPool.start[work: WorkerFn](n: Int, ctx: OpaquePtr) raises -> WorkerPool`: the same over a raw pointer.
- On both: `request_stop(self)` sets the stop flag, `join(mut self) raises` waits, `shutdown(mut self) raises` does both, and `stop_flag`, `is_stopping`, `num_workers` and `pin_all` do what they say. `TypedPool.state(self)` gives the state back. Dropping a pool stops and joins it.

**Threads:** `ThreadHandle.spawn[start: StartFn](arg: OpaquePtr) raises -> ThreadHandle`, with `StartFn` = `def(OpaquePtr) thin -> OpaquePtr`, then `join(mut self) raises` (safe to call twice), `detach(mut self) raises` or `pin_to_cpu(self, cpu: Int) raises`. Also `num_cpus() -> Int`, `current_thread_id() -> UInt64` and `yield_now()`.

**Atomics**, views over a 64-bit cell at an address you own:

- `AtomicCounter.at(address: Int) -> AtomicCounter` (or `at(ctx: OpaquePtr, slot: Int)`, or `alloc(initial: Int64 = 0)` with `unsafe_free()`), then `fetch_add(self, delta: Int64 = 1) -> Int64`, `load(self) -> Int64` and `store(self, value: Int64)`.
- `AtomicFlag`, built the same ways, with `set(self)` (release), `is_set(self) -> Bool` (acquire) and `clear(self)`.
- Free functions on an `I64Ptr`: `atomic_fetch_add`, `atomic_load_relaxed`, `atomic_load_acquire`, `atomic_store_relaxed`, `atomic_store_release`, and the two fences.

**Locks:** `Mutex() raises`, with `lock(self)`, `unlock(self)`, `try_lock(self) -> Bool` and `with_lock[body: def(OpaquePtr) thin -> None](self, ctx: OpaquePtr)`. `ref(self) -> MutexRef` gives a copyable view a worker can hold. `CondVar() raises` has `wait(self, mutex: MutexRef)`, `signal(self)` and `broadcast(self)`.

**Raw pointers:** `OpaquePtr`, `I64Ptr`, `opaque_ptr(address: Int)` and `i64_ptr(address: Int)`.

## Rules and errors

- Every task gets `mut` access to the same state, and nothing checks what it does with it. A plain store to a shared field is a data race: use an atomic, a `Mutex`, or a slot only that task writes. [lint](/s/lint) catches the plain-store case.
- Mojo destroys a value at its last use, and an address made with `Int(Pointer(to=x))` or `opaque_ptr` isn't a use. With the opaque forms, mention the context after the join or heap-allocate it. The typed forms keep it alive for you.
- A task can't raise. Report failures through the state, for example with an `AtomicFlag` and one error cell per task.
- Pool workers stop only when they check the flag: loop on `not stop.is_set()`. A worker blocked in a syscall doesn't see the flag until the call returns.
- There is no lock guard, since it would unlock at its last use. Call `lock()` and `unlock()`, or `with_lock`.
- Failures raise `pthread_create failed, rc=<n>`, `WorkerPool.start needs at least one worker, got <n>`, or `parallel_for could not start workers: <cause>`.
- `pin_to_cpu` is real on Linux and does nothing on macOS. Each task costs one atomic increment on a shared cache line, so make tasks chunky.

## Tests

`pixi run test` (nightly) and `pixi run -e stable test` (Mojo 1.2.0) run races built to give a wrong number when a primitive is broken: 8 threads adding to one counter must reach exactly 800,000, and a typed pool's state poisons itself on destruction while workers count poisoned reads. `pixi run -e stable stress-tsan` (macOS) and `stress-asan` (Linux) rerun a stress sweep under a sanitizer and fail on any warning. CI covers stable and nightly on linux-64 and osx-arm64.

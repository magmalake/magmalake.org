---
title: Writing ergonomic multithreaded code in Mojo 1.0, 1.0, 1.0, …
description: Mojo 1.0 ships no thread pool and no way to send a closure across a thread boundary. Here is the pattern that makes threads ergonomic anyway — a thin function, a typed context, and about twenty lines you write once.
eyebrow: Concurrency
date: 2026-09-02
sourceUrl: https://github.com/magmalake/threads.mojo
sourceLabel: threads.mojo
draft: true
---

Mojo compiles to native code and your machine has ten cores. Using them is a
two-part problem: there is no thread pool in the standard library, and the
threads you can reach through FFI will not accept a closure. The Mojo way is to propose a solution as a library, so let’s see how far we can go.

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

`parallel_for` starts one thread per core, hands each of them indices from a
shared atomic counter until the 1000 tasks are gone, and joins every thread
before it returns. Your `task` runs on all ten cores; `totals` is a plain
struct on `main`'s stack that every thread updates.

`Ctx[Totals]` is the only thing above that is not from the library. It is
twenty lines, written once, and it appears in full two sections down. The
other two questions the listing raises: why `task` is a top-level function
rather than a closure, and why the counter is built from a `ref` rather than
owned.

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
are proving is that ten threads may hold this at once. Keeping the state in
one struct is what makes that reviewable: there is a single place to look and
ask which fields are written concurrently.

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

About 7×, and the two runs produce the same sum. Ten cores never give you a speedup of ten;
threads cost something to start and the atomic on the shared counter is a real
contention point. Seven is a reasonable number for work of this shape.

Both figures are stable to the millisecond across runs, which is itself worth
knowing: this is native code with no runtime deciding when to schedule you.

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
`std.algorithm.parallelize` had gone from the nightly we were tracking. There
was no thread pool left to reach for.

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

The one deviation worth flagging for anyone reading the source: `Pointer` is
now the current spelling, and `UnsafePointer` compiles with a deprecation
warning on 1.0.0. Older examples, including some of ours, still say
`UnsafePointer`.

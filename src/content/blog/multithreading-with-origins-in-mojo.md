---
title: Multithreading with origins in Mojo 1.0
description: The typed context in the previous post erased the origin of the state it shared, and the compiler destroyed that state before the threads started. Here is the one-line fix, the library change behind it, and a test harness that holds the compiler to what it catches and what it does not.
eyebrow: Concurrency
date: 2026-09-03
sourceUrl: https://github.com/magmalake/threads.example
sourceLabel: threads.example
draft: true
---

The [previous post](/blog/writing-multithreaded-code-in-mojo/) shared a struct
across ten cores through a twenty-line `Ctx[T]`. That struct was destroyed
before the first thread started. The program still printed `499500`, which is
why I did not notice, and this post is about why it printed the right number,
what the honest version looks like, and how I now keep the compiler honest
about it.

## The destruction point

Mojo destroys a value at its last visible use, not at the end of its block.
`Ctx[Totals].to(totals)` built a pointer with `MutUntrackedOrigin`, which is
the annotation for "the compiler knows nothing about how long the pointee
lives". A read through that pointer is not a use of `totals`, so as far as the
compiler could see the last use was the `to` call itself — before
`parallel_for`, before any thread existed. Only the closing
`print(totals.sum)` happened to come later and keep the value alive.

Delete that print, give `Totals` a heap cell, and the order comes out as:

```plain
Totals dropped
before parallel_for
after parallel_for: 499499
```

The tasks added their thousand indices into a cell the destructor had already
poisoned to `-1`. Nothing in the language was wrong. `MutUntrackedOrigin` is
the contract: I told the compiler I would track this myself, and then I did
not.

## A ref argument across the join

The fix is to stop erasing the origin in user code. An argument is alive for
the whole call it is passed to, so if `parallel_for` takes the state as
`ref[origin] state: T`, the compiler extends the lifetime of `totals` over the
call — and over the joins inside it — with no later use required. That is what
threads-mojo 0.3.0 adds: a typed overload whose task is
`def(Int, mut T) thin -> None`.

```mojo
from threads import AtomicCounter, num_cpus, parallel_for


@fieldwise_init
struct Totals(Copyable, Movable):
    var sum: Int64


def counter(ref cell: Int64) -> AtomicCounter:
    """`AtomicCounter` is a view over a cell; it owns no storage."""
    return AtomicCounter.at(Int(Pointer(to=cell)))


def task(i: Int, mut totals: Totals) -> None:
    _ = counter(totals.sum).fetch_add(Int64(i))


def main() raises:
    var totals = Totals(0)
    parallel_for[task](1000, totals)
    print("cores:", num_cpus(), " sum:", totals.sum)
```

`Ctx[T]` is gone. The task receives `mut Totals` instead of a `void*` it has to
reinterpret, and the erasure still happens — a pthread carries exactly one
pointer — but once, inside the library, in the worker that rebuilds the `T`
from the address. User code never spells `MutUntrackedOrigin`.

The compiler now also refuses two calls it used to accept. A `read` argument
has an immutable origin and cannot bind to a mutable `ref`:

```mojo
# expect-error: cannot be converted from 'Totals' to ref 'Totals'
from origins import Totals, task
from threads import parallel_for


def sum_of(totals: Totals) raises -> Int64:
    parallel_for[task](1000, totals)
    return totals.sum


def main() raises:
    print(sum_of(Totals(0)))
```

and `parallel_for[task](1000, Totals(0))` fails with the same message. Both
were silent with `Ctx[T]`, because a `to` taking `ref` and returning an
untracked pointer accepts anything.

## A harness for both directions

The `expect-error` comment above is not decoration. `pixi run check` in
[threads.example](https://github.com/magmalake/threads.example) builds six
deliberately wrong programs and asserts something about each. A file under
`tests/caught/` must fail to compile with the diagnostic it names. A file
under `tests/uncaught/` must compile with no warning at all, and then print
the wrong answer its `# expect:` lines predict, in order.

| caught | misuse |
| --- | --- |
| `state_immutable` | state is a `read` argument |
| `state_temporary` | state is a temporary |

| uncaught | what goes wrong |
| --- | --- |
| `untracked_ctx_drops_early` | the previous post's `Ctx[T]`; `totals` destroyed before the threads start |
| `opaque_escapes_origin` | the opaque overload on `Int(Pointer(to=totals))`; same |
| `field_deref_after_last_use` | `totals.cell[]` copies the pointer field, the struct dies between copy and deref |
| `plain_store_races` | a task writes `sum` with a load and a store |

The second table is the list a reviewer checks by hand, and it is a test in
its own right: if a newer compiler starts rejecting one of those files,
`check` fails, and the file moves to the first table. The compiler's silence
is asserted the same way its errors are.

## Three lifetime bugs and one race

The uncaught set sorts into two kinds.

The first three are lifetimes, and each has a fix today. The two `drops_early`
files are the same bug at two spellings, and `parallel_for[task](n, totals)` is
the fix for both; `Int(Pointer(to=totals))` is exactly where an origin stops,
and the typed overload exists so that line never appears in user code. The
`field_deref` case has nothing to do with threads: `totals.cell[]` copies an
untracked pointer out of the struct, that copy is the struct's last use, and
the deref reads a destroyed object. The fix is a type, not a compiler change —
`OwnedPointer[Int64]` derefs through a ref whose origin is the owner's, so
`owned.cell[]` borrows `owned` and it stays alive through the read.

The fourth is different. Every task holds `mut` access to the same `Totals`
at the same time; the atomic is what makes that honest, and nothing stops a
task writing `totals.sum = seen + i` instead. Rust rejects that shape before
threads enter it — aliased `&mut` is an exclusivity error, and the atomic
works through `&AtomicI64` because that type is `Sync`. Mojo has no `Sync`
and no interior-mutability marker, so there is nothing `parallel_for` could
demand of `T`. An origin says how long `totals` lives. It does not say whether
`totals` is safe to share, and that is the gap that stays open.

## Learnings

- A test for undefined behaviour must not itself be undefined. The destructor
  poisons the cell to `-1` and leaks it; a write into a freed block corrupts
  the heap on some runs, a write into a poisoned block is a number to assert.
- Assert the compiler's silence, not only its errors. The uncaught set is the
  review checklist, and it is the harness that tells me when the checklist
  shrinks.
- Erasure belongs in the library. There is exactly one place a pointer has to
  become `void*`; put it behind the API that needs it, and user code keeps its
  origins.
- `MutUntrackedOrigin` is the contract, not a bug. I checked whether any of
  this deserved a compiler issue and none did — every wrong answer followed a
  line where I told the compiler to stop tracking.
- The remaining gap is `Sync`-shaped. A lint can flag a plain store in a task
  body, and I am trying one; what it cannot see is provenance, and what the
  language cannot yet say is that a type is safe to share.

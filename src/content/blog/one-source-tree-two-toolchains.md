---
title: One source tree, two mojo versions
description: Mojo  1.0 and nightly will diverge over time. Here is one possible pattern on how to handle that.
eyebrow: Toolchains
date: 2026-09-08
sourceUrl: https://github.com/magmalake/threads.mojo
sourceLabel: threads.mojo
related:
  - writing-multithreaded-code-in-mojo
unlisted: false
draft: true
---

Mojo  1.0 and nightly will diverge over time. Here is what you could do about it.

## The pattern

Put the divergence in a type alias, in its own file, one file per toolchain, and
pick between them with `-I`.

```mojo
# compat/stable/threads_compat.mojo
from std.atomic import Atomic
comptime Cell = Atomic[DType.int64]
```

```mojo
# compat/nightly/threads_compat.mojo
from std.atomic import Atomic
comptime Cell = Atomic[Int64]
```

Everything else imports `Cell` and is written once:

```mojo
from threads_compat import Cell
from std.atomic import Ordering


def atomic_fetch_add(ptr: CellPtr, delta: Int64) -> Int64:
    return ptr[].fetch_add[ordering = Ordering.SEQUENTIAL](delta)
```

Then the build names a directory:

```sh
mojo build -I compat/stable  -I src …    # Mojo 1.0.0
mojo build -I compat/nightly -I src …    # nightly
```

In pixi, set it per feature so no task has to know which toolchain it is on:

```toml
[feature.stable.activation.env]
THREADS_COMPAT = "compat/stable"

[feature.nightly.activation.env]
THREADS_COMPAT = "compat/nightly"
```

## Why it collapses to one line

In the general case you may have more than one divergence. Here `std.atomic.Atomic` takes a `DType` on 1.0 and a type on nightly:

| toolchain | compiles | rejected |
| --- | --- | --- |
| Mojo 1.0.0 | `Atomic[DType.int64]` | `Atomic[Int64]` |
| nightly | `Atomic[Int64]` | `Atomic[DType.int64]` |

That looks like it should infect every call site. It does not. Once the alias
exists, `fetch_add[ordering = …]`, `load[ordering = …]` and `store[ordering = …]`
are **identical text** on both toolchains — the difference lives entirely in the
declaration.

### Two things that do not work

**A conditional alias at module scope does not parse.** This is the obvious
first attempt and it fails on both toolchains:

```mojo
comptime if NIGHTLY:
    comptime Cell = Atomic[Int64]      # does not parse
else:
    comptime Cell = Atomic[DType.int64]
```

**`-D` defines cannot select a type.** They work — `std.sys.defines.get_defined_bool`
plus `comptime if` compiles on both, and `mojo build -D MY_FLAG=true` sets it — but
a define can only branch _inside a function body_. It cannot choose what a type
alias binds to at module scope. Useful for behavioural differences; no help here.

Which leaves the include path, and the include path is enough.

## Keep the mechanism dumb

The temptation is to build an abstraction over "toolchain differences." Resist it.
What is described above is file selection and nothing more: two files, same module
name, one on the path at a time. It does not know _why_ the files differ.

That matters because the next divergence will not look like this one. This case was
one API spelled two ways. When first-class async lands, the difference will be that
a module does not exist on 1.0 at all — and a mechanism built to paper over spellings
would not survive that, while one that swaps files will.

## What it costs a consumer

Nothing, if they take the published tin: it ships precompiled, and the choice was
made when it was built.

Consumers building from **source paths** add one directory to their include list
beside the source one. That is worth stating in your changelog under its own
heading, because it is a build-time break for exactly the people who will not
read past the summary.

***

The pattern is in
[threads.mojo 0.5.0](https://github.com/magmalake/threads.mojo) — `compat/`
alongside `src/`, and `src/threads/atomic.mojo` written once against `Cell`.
Both toolchains run the same 44 tests.

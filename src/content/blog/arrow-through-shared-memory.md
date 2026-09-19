---
title: Arrow through shared memory, between two processes
description: What each way of handing Arrow data across a process boundary costs, and how to pick one.
eyebrow: Interop
date: 2026-09-19
sourceUrl: https://github.com/magmalake/memory-region.mojo
sourceLabel: memory-region.mojo
related:
  - arrow-flight-as-an-interop-seam
unlisted: false
draft: false
---

Arrow's C Data Interface hands a consumer **pointers**, so it stops at the
process boundary: a pointer means nothing in another address space. A mapping
does not. Arrow's buffers are already in their final layout, so a consumer that
maps them can point at them where they lie — no decode, no copy.

## Which one to use

One column of a 79,478,796-row Iceberg table, read by Daft. Apple M4, warm
cache, p50 of five reads.

| where your consumer is | use | |
|---|---|---|
| the same process | the C Data Interface | 89 ms |
| another process, same machine | a shared mapping | 112 ms |
| another machine | Arrow Flight | 149 ms on loopback |

Crossing a process costs about 1.3× staying in one. Flight costs about 1.7×,
and buys a crash boundary, a retry boundary and a network you can point
somewhere else.

A mapping is only worth it when both ends are on one machine **and** the
producer writes Arrow buffers into it. Writing Arrow IPC into a mapping — the
obvious shortcut, since the file format is the memory format — measures 228 ms
here, slower than streaming the same bytes over Flight.

## What the handover itself costs

The same column, already Arrow, with no Parquet in the path:

| | |
|---|---|
| mapped, read where it lies | 25 ms |
| read into the heap | 56 ms |

The gap is one copy of 636 MB. That is the whole prize, and it is the
consumer's half — nearly free. The producer's half is not: it has to get the
rows into the mapping, and a mapping's create, size, map, unmap and unlink
cycle costs 4.01 ms per 8 MB batch against 3.05 ms for the copy inside it. Use
one mapping per unit of work, not one per batch.

## How

Two tins. [`memory-region.mojo`](https://github.com/magmalake/memory-region.mojo)
is a region — heap or mapping — and a bump allocator over it whose `claim`
returns an **offset**, never an address, because the mapping lands somewhere
different in every process that maps it.
[`arrow-mlake.mojo`](https://github.com/magmalake/arrow-mlake.mojo)'s
`export_shared_into` writes a batch's buffers into one and describes where each
landed.

`iceberg.mojo` ships both ends of a working example:

```sh
printf '%s\n' "$tickets" \
  | ib-shm-publish <table-dir> <split-bytes> <columns> <dir> \
  | ib-shm-consume
```

`ib-shm-publish` scans a split, writes its buffers into one mapping and prints
a manifest of offsets per batch as each lands. `ib-shm-consume` maps and folds
them. Either end can be something else: a Python consumer is about twenty lines
of `pa.foreign_buffer` and `Array.from_buffers`, which is what
[`pyarrow-flight.example`](https://github.com/magmalake/pyarrow-flight.example)
does to feed Daft — `pixi run transports` reproduces every number above.

## What to know before you choose

**The consumer keeps the mapping.** Its arrays point into your bytes, so the
producer cannot reuse or truncate that file until the consumer is done with
every array built on it. There is no signal for that. Give each unit of work
its own mapping and let the consumer unlink it.

**Nested columns are not supported yet** — primitive, `utf8` and `binary`
only. A manifest that describes a tree is a bigger thing than the one here.

**The producer still copies once.** Its decode wrote the buffers, and
publishing moves them into the mapping. Removing that too means the decode
allocating inside the mapping, which is worth about 4 ms of a 28 ms producer —
less than using one mapping per split rather than per batch already bought.

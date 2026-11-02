---
title: Distributed Mojo tasks against Ray and Rust
description: The same Iceberg scan, split one task per data file over three nodes, in dista, Ray and plain Rust. dista is fastest and its image is among the smallest; Python wins on a single machine.
eyebrow: Distributed
date: 2026-10-31
sourceUrl: https://github.com/magmalake/dista.mojo
sourceLabel: dista.mojo
related:
  - arrow-through-shared-memory
  - parquet-mojo-against-pyarrow
unlisted: false
draft: true
---

[dista](https://github.com/magmalake/dista.mojo) is a small distributed task
runtime for Mojo, in the spirit of Ray: mark a function as a task, call it,
and the work runs across a cluster. Every node runs the same compiled binary,
and columnar data moves between tasks as Arrow.

Its second phase ended with a gate: a distributed scan of an Iceberg table on
three nodes has to return what one machine returns. It passed. This post
compares that run with the same program written for Ray, and again in plain
Rust.

The short version, on the same three-node cluster:

| | distributed, 8 queries | compressed image |
|---|---:|---:|
| dista | **1.6 s** | 65 MB with Iceberg, 29 MB without |
| Rust (iceberg-rust) | 2.1 s | 35 MB |
| Ray (PyIceberg) | 4.7 s | 206 MB (921 MB for Ray's official image) |

In one process, though, the fastest of the three is PyIceberg. The details
follow.

## The experiment

The data is taxibench's table: 79.5 million NYC yellow-taxi trips from 2023
and 2024, written by PyIceberg as an Iceberg v2 table partitioned by month.
That's 24 Parquet data files, 1.3 GB, compressed with zstd. The workload is
taxibench's eight queries: counts, sums, a ratio, two group-bys over pickup
zones, one wide read of every column of a month, and one highly selective
filter.

Each implementation does the same thing for each query:

1. The driver plans the scan, which yields the data files that survive
   partition pruning.
2. It sends one task per file. The task reopens the table, re-plans, reads
   only its own file, and folds it into a partial result (a count, some sums,
   266 zone totals) on the worker that read it.
3. The driver adds the partials together.
4. The driver then runs the same scan itself, in one process, and the two
   answers must agree.

A ninth run sends whole Arrow batches back instead of partials, so that 87 MB
of columnar data crosses nodes.

The three versions:

- **dista**, with iceberg.mojo reading the table: [deploy/taxi.mojo](https://github.com/magmalake/dista.mojo/blob/main/deploy/taxi.mojo).
- **Ray 2.59** with PyIceberg and pyarrow, using taxibench's own Python folds: [bench/ray/taxi_ray.py](https://github.com/magmalake/dista.mojo/blob/main/bench/ray/taxi_ray.py).
- **Rust** with iceberg-rust 0.10.1 and arrow 58: one binary that runs as driver or worker, over plain tokio TCP: [bench/rust](https://github.com/magmalake/dista.mojo/tree/main/bench/rust).

All three agree. Counts are identical, and sums differ in the tenth
significant digit, because the terms are added in different orders.

## The cluster

The cluster is [kind](https://kind.sigs.k8s.io): Kubernetes running in Docker
on one machine, with each node a container. It runs one control plane and
three worker nodes, with one worker pod on each. dista and Ray also run a
head that executes no tasks; the Rust version has no head at all, because
its driver talks to the workers directly. Each node holds its own copy of the
table, standing in for a shared filesystem. All pods use the same Kubernetes
manifests you'd apply to a real cluster.

The catch is that every node is a container in one VM (colima, on an
Apple-silicon Mac with 8 CPUs). These numbers measure parallelism and
per-task overhead, not a network.

## Distributed

Each worker runs one task at a time in every configuration. The "1 thread"
runs also hold each task to a single thread, which is how dista runs today.

| query | dista | Rust, 1 thread | Rust, default | Ray, 1 thread | Ray, default |
|---|---:|---:|---:|---:|---:|
| q1 count, full scan | 135 | 325 | 318 | 1,631 | 1,719 |
| q2 one quarter | 20 | 48 | 54 | 91 | 91 |
| q3 cash fares | 173 | 237 | 236 | 453 | 444 |
| q4 tip ratio | 285 | 367 | 374 | 563 | 611 |
| q5 zone counts | 312 | 366 | 362 | 582 | 673 |
| q6 zone revenue | 176 | 220 | 220 | 432 | 479 |
| q7 one month, all columns | 217 | 241 | 265 | 455 | 468 |
| q8 selective | 302 | 340 | 352 | 543 | 633 |
| **total (ms)** | **1,620** | **2,144** | **2,181** | **4,749** | **5,117** |
| total without q1 | 1,485 | 1,819 | 1,863 | 3,118 | 3,399 |

Two things explain most of the gaps.

**The reader.** dista is about 1.3× ahead of Rust, and the same ratio shows
up with no distribution at all (below). iceberg.mojo scans this table faster
than iceberg-rust does, and the distribution layers add little to either.

**Ray's start-up and per-task Python.** Ray starts a worker process the first
time a task needs one, and that process then imports pyarrow and PyIceberg.
That's most of q1's 1.6 s. Without q1, Ray takes about 2.1× as long as dista.
The rest is per-task work in Python: reopening the table and re-planning the
scan costs more in PyIceberg than it does in Mojo or Rust.

## One process

The same eight scans, run in the driver without any distribution:

| | iceberg.mojo | iceberg-rust, 1 thread | iceberg-rust, default | PyIceberg, 1 thread | PyIceberg, default |
|---|---:|---:|---:|---:|---:|
| **total (ms)** | 3,858 | 4,883 | 5,123 | 5,886 | **2,931** |

Here PyIceberg with pyarrow's default threads wins, because pyarrow decodes
Parquet columns in parallel. iceberg.mojo's scan runs on one thread by
default, and iceberg-rust's defaults don't speed up a single process on this
table. Held to one thread, PyIceberg is the slowest of the three. A
multi-threaded scan is the obvious next step for iceberg.mojo; it isn't one
dista needs, because dista gets its parallelism from running many tasks at
once.

## Image size

| image | on disk | compressed |
|---|---:|---:|
| dista alone | 140 MB | 29 MB |
| the Rust program | 159 MB | 35 MB |
| dista with iceberg, parquet, codecs and SQL shims | 266 MB | 65 MB |
| Ray with PyIceberg and pyarrow, trimmed | 840 MB | 206 MB |
| `rayproject/ray:2.59.0-py312-cpu` | | 921 MB |

The dista and Rust images are `debian:bookworm-slim`, about 28 MB compressed,
plus the program. The Rust program is one 17 MB binary. The dista taxi image
is a 3 MB binary plus 87 MB of shared libraries. The largest of those, ICU,
libstdc++ and OpenSSL, arrive with libpq and libcurl, which iceberg.mojo's
catalogs and object store load; a scan-only build could drop most of that.

The Ray image is built as leanly as taxibench builds its PyIceberg image:
`python:3.12-slim` and a venv, with tests, headers and bytecode removed. Ray itself is 200 MB of it and
pyarrow 140 MB. Ray's official image is four and a half times larger again.

## What this doesn't show

- **A network.** All three nodes share one VM. On separate machines, moving
  Arrow between nodes costs real bandwidth, and dista's shared-memory path
  helps only within a node.
- **Variance.** These are single runs, on a machine that was otherwise idle.
  The differences between the 1-thread and default runs are a few percent,
  too small for one run to tell apart.
- **Everything Ray does.** Ray brings fault tolerance, autoscaling, a
  dashboard and a large ecosystem; dista has a few hundred lines of scheduling
  and none of those yet. The comparison is of what this workload uses.
- **Equal machinery.** The Rust version has no head, and its driver keeps one
  task in flight per worker. dista sends each worker up to two at a time.

## Reproducing it

Everything is in [dista.mojo](https://github.com/magmalake/dista.mojo):
`tests/kind_taxi.sh`, `bench/ray/run_kind.sh` and `bench/rust/run_kind.sh`
each build their image, create the kind cluster if needed, copy the table to
each node, and run. The table itself comes from taxibench's
`scripts/load.sh`. The full per-query tables are in
[bench/README.md](https://github.com/magmalake/dista.mojo/blob/main/bench/README.md).

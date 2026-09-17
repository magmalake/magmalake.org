---
title: Arrow Flight to integrate your Mojo code in your legacy pipelines
description: Flight allows you to distribute processing between servers.
eyebrow: Interop
date: 2026-09-16
sourceUrl: https://github.com/magmalake/flight.mojo
sourceLabel: flight.mojo
related:
  - parquet-mojo-against-pyarrow
unlisted: false
draft: false
---

It is not sufficient to have a fast reader and write your custom processing
module in Mojo if you have to rewrite a pipeline to try it on your own data.

Arrow Flight closes that gap. A stock `pyarrow.flight` client can now read an
Iceberg table served from Mojo without caring what the server is written in.

## What is Flight

Flight is first a **gRPC service** with a fixed method set — `GetFlightInfo`
asks what a dataset looks like and where to fetch it; `DoGet` fetches one
piece.

The next layer is an **Arrow IPC stream** as the payload: the
flatbuffer-encoded schema and record batches that Arrow already uses on disk
and in memory. The Flight server sends the bytes the client's Arrow library
wants, so a client materialises a table by pointing at buffers, not by decoding
a row format into objects.

That difference has big performance benefits. A JDBC or REST endpoint hands
back rows that have to be parsed, boxed, and rebuilt into columns. Flight hands
over the columns.

From the client, that is four calls and no Mojo:

```python
import pyarrow.flight as fl

client = fl.connect("grpc://127.0.0.1:8815")
info = client.get_flight_info(fl.FlightDescriptor.for_path("taxi"))
table = client.do_get(info.endpoints[0].ticket).read_all()
```

`info` carries the Arrow schema before any data moves, so a client can plan or
refuse. The ticket is opaque bytes whose meaning is the server's business and
never the client's.

## When to use Flight

**You have access to the data in Mojo and can compress it further with custom
code.** Let's say you have data in Iceberg tables and need to process it on the
GPU or with SIMD first. Write the core in Mojo and expose the resulting columns
over Flight.

**The result is somewhat large and columnar.** Flight's advantage grows with the number
of rows crossing the boundary, because it removes per-row work rather than
per-request work.

**The work is distributable.** The next section describes how Iceberg already
helps.

## When not to use Flight

**Small results.** A handful of rows does not justify a gRPC round trip and a
flatbuffer schema. Ordinary HTTP and JSON are fine, and simpler.

**Anything transactional.** Flight moves result sets. It is not a database
protocol and has no opinion about writes, transactions or sessions.

**When you control both ends and share a process.** If the consumer is in the
same process, the Arrow
[**C Data Interface**](https://arrow.apache.org/docs/format/CDataInterface.html)
hands over pointers with no serialisation at all. Arrow's own
[Python and Java walkthrough](https://arrow.apache.org/docs/python/integration/python_java.html)
is the shape of it: one side exports an array with `_export_to_c()`, the other
reads and mutates it in place, and nothing is encoded on the way. Flight is for
crossing a process or a network — reaching for it in-process is strictly
worse.

## Iceberg already decides how to parallelize

Iceberg can optimally distribute your code to the data, because its metadata
is a tree of immutable files.

`plan_files()` walks table metadata to snapshot to manifest list to manifests
to data files, and returns a list of tasks. Each carries its own data file, its
own delete files, and its own residual predicate — the part of your `WHERE` the
planner could not satisfy from partitions and statistics. The tasks are
disjoint _by construction_: for a given snapshot a data file appears in exactly
one manifest entry, so splitting by task splits the rows. No locks, no
coordination, no shuffle. A worker reading task _k_ cannot collide with a
worker reading task _j_.

Pruning happens before the division rather than instead of it. Partition
pruning drops whole manifests, per-file statistics drop files, and what
survives becomes the residual on each task. The planner shrinks the work, then
divides what is left.

So Flight's `GetFlightInfo` returns one
endpoint per task, and a ticket names the task. The union of the endpoints is
the table.

That last sentence is a contract, and a client can hold it to account:

```python
with ThreadPoolExecutor(max_workers=len(info.endpoints)) as pool:
    parts = list(pool.map(fetch, info.endpoints))
table = pa.concat_tables(parts)
assert table.num_rows == info.total_records
```

Worth asserting in your own code, because the failure is not an error. A client
that fans out over a split it has misunderstood quietly returns a wrong answer.

### Snapshot isolation is what makes that safe

A scan pinned to a snapshot sees exactly that snapshot, whatever commits land
meanwhile. Readers never block writers and writers never disturb readers, which
is what lets workers plan and read at different moments and still agree.

### What Iceberg gives you on the write side

Writers produce data files and manifests with no coordination at all, and then
a single atomic compare-and-swap on the catalog moves the table pointer. If
someone committed first, re-validate and retry. Appends never conflict, which
is why streaming ingestion scales; overwrites and deletes can, and that is
where the retry logic earns its keep.

Unlimited write parallelism with one serialization point is a strong property,
and it is worth knowing that it is Iceberg's, not the query engine's.

## What this is not

Three layers make a distributed reader. Iceberg supplies the first and hardest:
pruning, disjoint tasks, snapshot isolation. Flight supplies the second —
advertising the split and moving Arrow bytes; the `Location` field on an
endpoint, empty here and meaning "ask me", is the only thing between one
process and many. The third is a scheduler, and that is most of what Ray and
Daft actually are.

So this gets you a distributed _reader_ without a scheduler: a coordinator
plans, hands out tickets with locations, and any Arrow client fans out. What it
does not get you is **shuffle**. Joins and high-cardinality group-by need data
to move between workers, and neither Iceberg nor Flight has an opinion about
that. It is also the part where distributed engines are actually hard — spill,
backpressure, skew — so the absence is worth being explicit about rather than
discovering later.

## Running it

[`pyarrow-flight.example`](https://github.com/magmalake/pyarrow-flight.example)
is the client side of all of the above: reading a table, fanning out across
endpoints, handing the result to polars, duckdb and pandas, the error cases
pyarrow spells differently from gRPC, and a Daft `DataSource` built on the same
two calls.

```sh
pixi run check
```

That runs every example against a Python reference server, which keeps two
things apart that are easy to confuse: client code that is wrong, and a server
that is. No Mojo toolchain needed to find out which.

Pointing the same examples at the real thing is
[`flight.mojo`](https://github.com/magmalake/flight.mojo)'s `serve` task, or
`serve-iceberg` for a table PyIceberg wrote, planned and split by the Mojo
stack — that second one is what makes the fan-out above more than one endpoint.

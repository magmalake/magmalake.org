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

**You have access to the data in Mojo and can compress it further with custom**
**code.** Let's say you have data in Iceberg tables and need to process it on the
GPU or with SIMD first. Write the core in Mojo and expose the resulting columns
over Flight.

**The result is somewhat large and columnar.** Flight's advantage grows with the number
of rows crossing the boundary, because it removes per-row work rather than
per-request work.

**The work is distributable.**  One of the next sections describes how Iceberg already
helps.

## When not to use Flight

**Small results.** A handful of rows does not justify a gRPC round trip and a
flatbuffer schema. Ordinary HTTP and JSON are fine, and simpler.

**Anything transactional.** Flight moves result sets. It is not a database
protocol and has no opinion about writes, transactions or sessions.

**When you control both ends and share a process.** If the consumer is in the
same process, the Arrow
[**C Data Interface**](https://arrow.apache.org/docs/format/CDataInterface.html)
hands over pointers with no serialisation at all. Mojo exports an array:

```mojo
var e = export_c(batch.arena, batch.roots[col])
var raw = e.into_raw()  # ArrowArray*, ArrowSchema* — the caller owns both now
```

and the consumer imports it where it stands:

```python
pa.Array._import_from_c(array_addr, schema_addr)
```

Nothing is encoded between those two lines.
[`carrow_scan.mojo`](https://github.com/magmalake/iceberg.mojo/blob/main/tools/carrow_scan.mojo)
is a working example: a shared library that scans an Iceberg table and hands a
column over, structs, lists and maps included, which
[`consume_c_data.py`](https://github.com/magmalake/iceberg.mojo/blob/main/tools/consume_c_data.py)
imports into pyarrow and checks against PyIceberg's own read. Flight is for
crossing a process or a network — not for in-process.

## Iceberg already decides how to parallelize

Iceberg can optimally distribute your code to the data, because its metadata
is a tree of immutable files.

`plan_files()` walks table metadata to snapshot to manifest list to manifests
to data files, and returns a list of tasks. Each carries its own data file, its
own delete files, and its own residual predicate — the part of your `WHERE` the
planner could not satisfy from partitions and statistics. The tasks are
disjoint _by construction_: for a given snapshot a data file appears in exactly
one manifest entry, so splitting by task splits the rows. No need for locks, no
coordination, no shuffle. A worker reading task _k_ cannot collide with a
worker reading task _j_.

Pruning happens before the division rather than instead of it. Partition
pruning drops whole manifests, per-file statistics drop files, and what
survives becomes the residual on each task. The planner shrinks the work, then
divides what is left.

In the end Flight's `GetFlightInfo` returns one
endpoint per task, and a ticket names the task. The union of the endpoints is
the table.

That last sentence is a contract, here is how a client can use it for fun and profit:

```python
with ThreadPoolExecutor(max_workers=len(info.endpoints)) as pool:
    parts = list(pool.map(fetch, info.endpoints))
table = pa.concat_tables(parts)
assert table.num_rows == info.total_records
```

Worth asserting in your own code, because the failure is not an error. 

### Snapshot isolation is what makes this safe

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

The way out is to borrow one rather than write one. An engine that already has
a shuffle can take the endpoints as its task list and keep its own scheduler:
[`daft_flight/`](https://github.com/magmalake/pyarrow-flight.example/tree/main/daft_flight)
is that handoff, and it is small — `GetFlightInfo` becomes Daft's task list,
`DoGet` becomes a task's batches, and joins and group-bys are Daft's problem
from there. Ray Data and Spark take the same shape. One caveat worth knowing
before you reach for it: a ticket is opaque, so there is no field in which to
send a predicate. Only the limit pushes down, and filters run after the read.

## What the boundary costs

I had been asserting that in-process beats Flight without a number beside it,
so I measured one. The same column of the same 79.5M-row Iceberg table, read
by the same engine — Daft, through the connectors in
[`pyarrow-flight.example`](https://github.com/magmalake/pyarrow-flight.example)
— with nothing changing but how the rows cross the boundary. Apple M4, warm
cache, p50 of five full reads after a discarded warm-up.

| how the rows arrive | time | vs in-process |
|---|---:|---:|
| in this process, over the C Data Interface | 91 ms | 1.0× |
| Arrow Flight, TCP on loopback | 148 ms | 1.6× |
| Arrow Flight, `flight.mojo`'s own server | 800 ms | 8.8× |
| Arrow Flight, Unix domain socket | 582 ms | 6.6× |

The loopback and Unix-socket rows are **pyarrow's** Flight server reading the
same Parquet files, and that is deliberate. Timing a client against my own server would add
the protocol and my encoder together and print the sum under the heading
"Flight", which is not a fact about Flight.

**Crossing a process costs 1.7× here, not an order of magnitude.** A stream of
Arrow record batches over gRPC is about as cheap as moving that many bytes
between two processes can be, and the earlier advice — use the C Data
Interface when you share a process, Flight when you do not — is a smaller
difference in practice than "serialisation versus a function call" suggests.
1.7× is a price worth paying for a retry boundary, a crash boundary, or a
credential that should not leave a service.

**A Unix socket is worse, which is the opposite of what I expected.** Taking
the loopback stack out of the path is the obvious same-machine optimisation
and it makes this transfer nearly four times slower on macOS. Measured twice,
either side of the TCP run, on the same server process. Whatever gRPC does
with a Unix socket, it is not what it does with a loopback connection for a
bulk transfer. Worth knowing before reaching for it.

### My own Flight server was 80× off, and none of it was gRPC

`flight.mojo` served that column in **12.1 seconds** — 636 MB at about
53 MB/s — while pyarrow's server moved the same bytes over the same protocol
in 149 ms. Four things, in order of how much they cost, and none of them the
network.

The first was measurement. `FLIGHT_TIMING=1` splits a `DoGet` into reading and
encoding, and it said the handler produced 28 MiB in **16 ms** while the client
waited 1236 ms for it. That number is the whole investigation: whatever was
wrong lived on the other side of the handler, so there was no point optimising
the reader.

**Copies, byte by byte, in four places.** The server loaded each value out of
Arrow layout into a typed list, wrote each value back out as eight appends,
copied the body into the stream framing a byte at a time, and then the
protobuf writer copied it again into the message. Four scalar passes over data
that was in the right layout to begin with — a fixed-width Arrow buffer *is* an
Arrow IPC buffer, both native-endian on every platform this runs on, so what
looked like encoding was a `memcpy` written as a shift per byte. I had fixed
the identical bug in the C Data Interface export days earlier, where it cost
412 ms of a 585 ms scan. **12.1 s → 6.0 s.**

**gzip.** Every gRPC client advertises `grpc-accept-encoding: gzip`, and flare
took that as an instruction rather than as permission. A profile of the server
under load was 715 samples of `deflate` out of about a thousand: 28 MiB
compressed at roughly 25 MB/s, per endpoint, in the path of a format whose
entire argument is that the consumer casts the buffers where they land.
gRPC's own implementations default to identity for this reason — accepting an
encoding is not asking for it. **6.0 s → 3.1 s**, and one endpoint from
1236 ms to 385 ms.

**A full table scan to learn the schema.** `fields()` derived the Arrow schema
by scanning, and it is called on every `GetFlightInfo` *and* every `DoGet`. So
serving one endpoint read the whole table once for its own 28 MiB of rows and
again to remember what the columns were called. The snapshot is pinned when
the source is built, so the schema is resolved there too, from a one-row scan.
**3.1 s → 800 ms**, and one endpoint from 385 ms to 152 ms.

Fifteen times, and not one of those changes touched the protocol, the wire
format, or the reader. The gates that made it safe are pyarrow reading what
the server writes — an IPC round trip, a Flight round trip, an Iceberg table
and a two-worker cluster — which is the right way to rewrite an encoder:
someone else's implementation decides whether the bytes are still correct.

What is left is 5.4× rather than 80×, and I know where it is not. At 152 ms
per endpoint the server spends 16 ms and is otherwise idle, so it is not the
reader and not the encoder; 28 MiB is 1792 DATA frames at the default 16 KiB
maximum frame size, plus a flow-control round trip each time the window runs
out. That is the next thing to measure.

### Below Flight, on one machine

If both processes are on one machine, can the copy go away entirely? Not
through the C Data Interface: it hands over **pointers**, and a pointer is
meaningless in another address space. What can cross is a mapping. Arrow's IPC
*file* layout is the in-memory layout with every buffer 8-byte aligned, so a
consumer can map a file and point at the buffers where they lie:

| the handover alone, nothing decoded | time |
|---|---:|
| Arrow IPC, memory-mapped | 28 ms |
| Arrow IPC, read into the heap | 64 ms |

That pair is a different measurement from the table above — there is no
Parquet in it, only a column that is already Arrow — and the gap between the
two lines is one copy of 636 MB. **That copy is the whole of what shared
memory saves**, and it is worth roughly what the numbers say: a little over
half the cost of a handover once decoding is out of the picture.

Getting it end to end takes one change in the producer rather than a new
protocol. The buffers have to be *allocated* in the shared mapping in the
first place — in this stack that means `arrow-mlake`'s `ArrayArena` backed by
a mapped segment instead of the heap — after which handing them over is
publishing a file descriptor and a set of offsets. Flight can still be the
control plane: a ticket is opaque bytes, so a server that knows the client is
on the same host can put a segment name in it and let the client map it,
which is the same seam doing the same job with a cheaper `DoGet`. (Arrow's
own shared-memory object store, Plasma, is not the answer here — it was
removed from Arrow and lives on inside Ray.)

What it costs is what the in-process path always costs, in a more awkward
form: no crash boundary, no retry boundary, and now an ownership question
about who unmaps the segment and when. Flight's 1.7× buys those back, which
is why the table above is the more useful one for most people.

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

Every number above comes from one command in the same repository:

```sh
pixi run transports
```

It brings up a pyarrow Flight server over the taxi table's Parquet files and
`flight.mojo`'s Iceberg server, reads the same column through each of them and
through the in-process source, tears the servers down, and asserts that every
leg returned the same 79,478,796 rows — a transport that is fast because it
lost rows is not fast. Legs whose pieces are missing are skipped with a note,
so the in-process number is available without a Flight server and the Flight
numbers without a Mojo toolchain. It needs the taxi table, which
[`taxibench.example`](https://github.com/magmalake/taxibench.example) builds
with `pixi run load`.

Pointing the same examples at the real thing is
[`flight.mojo`](https://github.com/magmalake/flight.mojo)'s `serve` task, or
`serve-iceberg` for a table PyIceberg wrote, planned and split by the Mojo
stack — that second one is what makes the fan-out above more than one endpoint.

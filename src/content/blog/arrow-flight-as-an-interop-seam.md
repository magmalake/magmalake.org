---
title: Arrow Flight as an interop seam
description: Iceberg already decides where a scan divides. Flight is how you hand that decision to somebody else's client — including one running on another machine. When it pays, when it does not, and what snapshot isolation has to do with it.
eyebrow: Interop
date: 2026-09-10
sourceUrl: https://github.com/magmalake/flight.mojo
sourceLabel: flight.mojo
related:
  - parquet-mojo-against-pyarrow
draft: true
---

A fast reader in a new language is unreachable. Nobody is going to rewrite a
pipeline to try it, and a benchmark nobody can run against their own data is a
claim rather than a result. The gap is not performance, it is that no existing
tool can call the thing.

Arrow Flight closes that gap. A stock `pyarrow.flight` client now reads an
Iceberg table served from Mojo, and nothing on the Python side knows or cares
what the server is written in.

## What Flight actually is

Two pieces, and it is worth separating them because only one is interesting.

A **gRPC service** with a fixed method set — `GetFlightInfo` asks what a
dataset looks like and where to fetch it, `DoGet` fetches one piece. That part
is unremarkable plumbing.

An **Arrow IPC stream** as the payload: the flatbuffer-encoded schema and
record batches that Arrow already uses on disk and in memory. This is the part
that pays. The bytes a Flight server sends are the bytes the client's Arrow
library already wants, so a client materialises a table by pointing at
buffers, not by decoding a row format into objects.

That difference is the whole argument. A JDBC or REST endpoint hands back rows
that have to be parsed, boxed, and rebuilt into columns. Flight hands over the
columns.

## When it pays

**Your data is somewhere the ecosystem's readers are slow or absent.** This is
the honest case for a Mojo stack: the reader exists and is fast, but no Python
tool can reach it. Flight makes it reachable without asking anyone to adopt a
new language.

**The result is large and columnar.** Flight's advantage grows with the number
of rows crossing the boundary, because it removes per-row work rather than
per-request work.

**The work divides, and you want the division visible.** This is the case
worth dwelling on, and the next section is about why Iceberg makes it easy.

## When it does not

**Small results.** A handful of rows does not repay a gRPC round trip and a
flatbuffer schema. Ordinary HTTP and JSON are fine, and simpler.

**Anything transactional.** Flight moves result sets. It is not a database
protocol and has no opinion about writes, transactions or sessions.

**When you control both ends and share a process.** If the consumer is in the
same process, the Arrow **C Data Interface** hands over pointers with no
serialisation at all. Flight is for crossing a process or a network — reaching
for it in-process is strictly worse.

That last distinction caught us out and is worth stating plainly: the C Data
Interface and IPC solve different problems. The first shares memory between
libraries in one process. The second is a byte format for sending data
somewhere else. Having one does not give you the other.

## Iceberg already decided where the work divides

The hard part of distributing a read is not moving bytes, it is agreeing on who
reads what. Iceberg answers that before Flight enters the picture, because its
metadata is a tree of immutable files.

`plan_files()` walks table metadata to snapshot to manifest list to manifests
to data files, and returns a list of tasks. Each carries its own data file, its
own delete files, and its own residual predicate — the part of your `WHERE` the
planner could not satisfy from partitions and statistics. The tasks are
disjoint *by construction*: for a given snapshot a data file appears in exactly
one manifest entry, so splitting by task splits the rows. No locks, no
coordination, no shuffle. A worker reading task *k* cannot collide with a
worker reading task *j*.

Pruning happens before the division rather than instead of it. Partition
pruning drops whole manifests, per-file statistics drop files, and what
survives becomes the residual on each task. The planner shrinks the work, then
divides what is left.

So Flight's endpoints are not a split we invented. `GetFlightInfo` returns one
endpoint per task, and a ticket names the task. The union of the endpoints is
the table.

### Snapshot isolation is what makes that safe

A scan pinned to a snapshot sees exactly that snapshot, whatever commits land
meanwhile. Readers never block writers and writers never disturb readers, which
is what lets workers plan and read at different moments and still agree.

That guarantee has to be *asked for*, and we initially did not. The server
built a fresh scan for every call, so `GetFlightInfo` and a later `DoGet` could
plan against different snapshots. Data files are immutable, so the failure was
never corruption — it was a client fetching endpoints in parallel while a
commit landed, and assembling a table that never existed at any single point in
time. Worse than an error, because it looks reasonable.

The fix is the standard shape: the coordinator pins a snapshot once, and the
ticket carries it. A worker plans at the ticket's snapshot, not at whatever is
current. That is what makes the union of endpoints the table across *time* as
well as across workers.

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

So this gets you a distributed *reader* without a scheduler: a coordinator
plans, hands out tickets with locations, and any Arrow client fans out. What it
does not get you is **shuffle**. Joins and high-cardinality group-by need data
to move between workers, and neither Iceberg nor Flight has an opinion about
that. It is also the part where distributed engines are actually hard — spill,
backpressure, skew — so the absence is worth being explicit about rather than
discovering later.

One gap on the read side is worth naming too: task granularity is currently one
data file. Iceberg's task carries `start` and `length` so a large file can be
split at row-group boundaries into several tasks, which is what stops one big
file becoming a straggler. The fields are there; the policy is not implemented
yet.

## What it cost

The gRPC half was mostly assembly. The Arrow IPC half was not, because nothing
in the Mojo ecosystem writes it — that meant a FlatBuffers writer.

Writing FlatBuffers is far smaller than reading them. A reader must honour
whatever layout a producer chose; a writer chooses the layout, so the encoder
only has to be self-consistent and spec-legal. Scoped to the types actually
needed — `int64`, `float64`, `bool`, `utf8`, `timestamp` — it is a few hundred
lines rather than a library.

Two details cost more time than they should have, and both are the kind that
fail quietly:

**`FlightInfo.schema` is an encapsulated IPC message**, not a bare flatbuffer:
the continuation marker and length prefix are part of it. Send a bare one and
the client reports "Invalid flatbuffers message", because it reads the first
four bytes as a length.

**A validity bitmap that is dropped or misaligned produces plausible numbers**,
not an error. Nulls are the assertion worth writing in a test, precisely
because their absence is invisible.

## Trust the other implementation, not your own

Every gate here is pyarrow reading what we wrote. That is deliberate. A writer
checked only against a reader you also wrote proves the two agree and nothing
about whether either matches Arrow.

The Iceberg gate goes one step further: the table is written by **PyIceberg**,
then planned and served by the Mojo stack, then read by pyarrow. Our code is
in the middle of a chain whose ends are both somebody else's.

It also asserts the property that makes the split worth having — that the
union of every endpoint is the whole table, with nothing repeated and nothing
lost. Two data files, three rows and four, seven distinct ids. One endpoint
would pass every value check while proving nothing about the partition.

## Why bother before you are distributed

None of the above requires more than one machine to be worth it. Flight is what
makes a fast reader in a new language something an existing tool can point at,
which is the difference between a benchmark and a thing people can use. That
the same `GetFlightInfo` response also describes work spread across machines —
once the endpoints carry locations — is a property you get for having taken the
planner's word for where the seams are.

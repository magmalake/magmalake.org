---
title: Arrow Flight as an interop seam
description: A fast reader in a new language is unreachable until something can call it. Flight is the seam that makes it callable — here is when it pays, when it does not, and what it cost to implement.
eyebrow: Interop
date: 2026-09-10
sourceUrl: https://github.com/magmalake/flight.mojo
sourceLabel: flight.mojo
related:
  - parquet-mojo-against-pyarrow
draft: false
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

**You want the split to be visible.** `GetFlightInfo` returns *endpoints*, and
a client may fetch them independently and in parallel. If your planner already
knows where the work divides — as Iceberg's does, having pruned partitions and
attached delete files per data file — the endpoints are that plan, handed out.
One endpoint per data file, and the union is the table.

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

## Where this goes

The endpoints carry no `Location`, which Flight defines as "fetch from the
server you asked". That is correct for one process and it is also the only
thing standing between this and a distributed reader: fill in locations and
the same `GetFlightInfo` response describes work spread across machines, with
no change to the client.

Flight is worth having before any of that, though. It is what makes a fast
reader in a new language something you can point an existing tool at — which
is the difference between a benchmark and a thing people can use.

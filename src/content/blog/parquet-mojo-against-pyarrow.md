---
title: The parquet.mojo performance bar
description: Flat columnar reads are ahead of pyarrow on one core and on four, writes are at parity, and nested data loses before threading comes into it.
eyebrow: Performance
date: 2026-09-05
sourceUrl: https://github.com/magmalake/parquet.mojo
sourceLabel: parquet.mojo
related:
  - how-far-parquet-mojo-is-validated
unlisted: false
draft: true
---

parquet.mojo is ready to use. Flat columnar reads are alightly faster than pyarrow on
one core and faster again on four; writes are at parity; nested and mixed data
is the one shape that loses, by about a fifth. Every limit is named below
rather than waiting to be found.

Take  mojo if you are reading columnar data from Mojo and want to stay in Mojo.
Take pyarrow if you need Parquet encryption,  or the Arrow types that only an `ARROW:schema`
block can restore. See the repository for more details.

The rest of this post is the evidence, in decreasing order of how much it
matters: what the limits are, why the GPU is not the answer, what changed in
the numbers, and finally the measurements themselves.

Every number here is one machine's. The claim is not that these hold on your
hardware — it is that each one is reproducible, says which thread count and
which reference API it used, and comes from a run that checked the machine was
idle.

## GPU considerations

Mojo compiles to Metal, and Apple Silicon has unified memory, so the obvious
question is whether the decode belongs on the GPU. The measurements below are machine dependent, on a M4 the computations used by Parquet reading do not make sense on the GPU. If you are optimizing a data pipeline enf-to-end, across boundaries component boundaries, the conclusion may be different.

The dictionary gather is the friendliest possible candidate — pure data
parallelism, no nesting, and 43.7% of a flat read before it was fused. On an
M4 it costs **337 µs of fixed overhead plus 1.80 ns per value**, against the
CPU's 0 and 0.51. The marginal cost is _higher_, so the two curves diverge:
there is no page size at which the GPU wins. A real 13-page string chunk takes
397 µs on the CPU and 12.4 ms on the GPU.

Unified memory does not rescue it either. A host-visible buffer handed straight
to a kernel reads as zeros and swallows writes silently, so the working path
still stages through device buffers and synchronises per page.

One `comptime` branch does let the element bodies be shared between the two
targets, and both instantiations are checked against the same oracle — but
around 40 lines share and 300 do not, because allocation, bounds checking and
the offset prefix sum all fork. The harder stages are worse, not better:
Dremel assembly is the same scan shape measured here at 21 ns per value, and
RLE level decoding is serial by construction.

The CPU path is the product. GPU support is a reason to write Mojo, not a
reason to wait.

## The numbers that moved

Several figures published on this site were wrong, in our favour, until this
re-measurement. The corrections are worth stating plainly, because they are the
reason to trust the numbers above.

**The pyarrow comparison flattered us.** The published single-core number was
1.9× faster than pyarrow. The honest figure at the time was **1.7×**. Two things were wrong
with the old comparison. `pq.read_table` is pyarrow's _dataset scanner_, not
parquet-cpp's read path; `ParquetFile.read()` is the right single-thread
comparator, and it is faster. And `pa.set_cpu_count(1)` matters even with
`use_threads=False`: on one fixture the same file reads 2.25 ms one way and
0.83 ms the other, and on the 1M-row file above the two legs are 2.9× apart.
Every row now names the leg it is quoted against. A comparison that does not
name the leg is not a comparison.

**The multi-core throughput was overstated.** 660M rows/s was published for
four cores. Taken from a built binary, timed per benchmark on a machine that
reported itself idle, it is **426M rows/s at four workers** — the 2.35 ms in
the table.

**The write figure moved the other way.** It was published as 46.6 ms against
pyarrow's 31.6 ms. It is 31.7 against 31.7.

## The measurement rules

Every row above comes from a run that satisfied all of these.

- **p50 headline, p90 beside it, never the mean alone.** One first-call sample
  of 125 ms moved a pyarrow benchmark's mean by 30% while its p50 did not
  budge.
- **Built, then run — never `mojo run`.** JIT-executing a suite inflated one of
  these benchmarks by 1.9×.
- **Never a JIT number against a compiled one.** That single mistake produced
  two confident, wrong diagnoses before anyone checked how the two binaries had
  been built.
- **The run says whether the machine held still.** Contention is large and
  measurable: the same benchmark runs 31 ms idle, 51 ms against 8 competing
  threads, and 89 ms against 16. A fixed reference kernel is timed either side
  of every benchmark, the first benchmark is re-timed at the end, and the load
  average is read. Every figure here comes from a run that said `steady`.
- **Per benchmark, not one pass over a suite.** Neighbouring benchmarks warm
  caches and allocators for each other, and worker ladders contend with each
  other if run together.

The full table, including the Iceberg, Avro, codec and object-storage rows and
the two repos whose benchmarks are not on that harness yet, is on
[the performance page](/performance).

## The skill

The rules above are five of thirty-five. The rest — fast-path gates that
cannot be satisfied, decoding into the destination representation, the shape of
a parallel decomposition, the tests that catch an optimisation which silently
never fires — are packaged as an agent skill, `writing-performant-data-code`,
written for anyone building a columnar reader rather than for readers of this
site:

```sh
npx skills add magmalake/.github --skill writing-performant-data-code --yes
```

It installs for Claude Code, Codex, Cursor and GitHub Copilot, among others;
`--agent` takes them space-separated.

## The measurements

| operation | parquet.mojo | pyarrow |  |
| --- | --- | --- | --- |
| Flat read, 1M rows, 1 core | **3.77 ms** — 265M rows/s | 8.0 ms, one thread | **2.1× ahead** |
| Flat read, 1M rows, 4 workers | **1.96 ms** — 510M rows/s | 2.57 ms, threaded over all 10 CPUs | **1.3× ahead**, on four threads to its ten |
| Nested and mixed read, 100k rows, 1 core | 2.63 ms | 2.24 ms, one thread | **1.17× behind** |
| Nested and mixed read, 100k rows, 8 workers | 0.78 ms | 0.66 ms, threaded | **1.18× behind** |
| Write, 1M rows | 32.8 ms | 31.7 ms | **parity**, inside the run-to-run spread |
| Footer, 1,000 columns × 50 row groups | 56.6 ms read / 2.6 ms write | — | — |

The flat file is 1M rows of int64, double and two dictionary columns,
uncompressed, in four row groups. The mixed one is 100k rows of int64, double,
string, bool and a `list<int32>`, snappy-compressed, about 1% nulls. Both are
in the repo, and every row above is reproducible from it.

## Flat columnar reads

The win holds at every thread count measured: 3.77 ms against pyarrow's 8.0 ms
on one thread, and 1.96 ms on four workers against 2.57 ms from pyarrow using
all ten CPUs it can see.

`ParquetReader.num_workers` is the whole interface to that. Reading a Parquet
file across cores does not require a scan engine above it, a thread pool the
caller manages, or a batch loop.

## Worker scaling, and where it bends

The same file at 1, 2, 4, 8 and 10 workers: \*\*3.77 / 2.42 / 1.96 / 1.90 /
1.90 ms\*\*.

It bends at four, which is how many performance cores this M4 has. Past four
the p50 buys about 3% and the p90 gets worse — 2.07 ms at four workers, 2.50 ms
at eight. Four is the setting to use on this machine, and the shape of that
curve, rather than the core count, is what to look for on another one.

## Nested and mixed data

parquet.mojo loses here, and it loses on a single core, before threading comes
into it at all: 2.63 ms against pyarrow's 2.24 ms one-thread leg. Adding
workers does not close it, because pyarrow gets the same benefit from its own
pool.

The cost was located rather than suspected, and then removed. A ranked list of
what the reference implementations do that we did not — parquet-cpp at the tag
pyarrow 25.0.1 actually runs, and arrow-rs at HEAD, each item cited to a file
and a function and costed against a stage profile — is
[parquet.mojo#18](https://github.com/magmalake/parquet.mojo/issues/18). Its
three implementable items are done: an uncompressed page is handed back rather
than copied, the dictionary gather is fused with its bounds check, and the
nested path samples its row index, decodes validity as a bitmap and spaces
nulls by runs. That took this file from 3.29 ms to 2.63, and the gap from
1.4× to 1.17×.

Two of the three estimates in that issue were wrong, both in the direction of
caution: the fused gather was worth more than predicted, the sampled row index
about half. The remaining item asks for a change to a public trait that is not
worth it yet.

Anyone choosing parquet.mojo for list, struct and map columns today should
expect to be somewhat behind pyarrow, and should read that issue rather than
this paragraph for how far.

## Writes

A write of 1M rows takes 31.7 ms, against pyarrow's 31.7 ms on the same data.
That is parity inside the run-to-run spread, not a win.

A plain-int64 column write does not build a dictionary it will not use. That
speculative build was **67% of the write**; without it the output is
byte-identical and the column goes out 3.3× faster.

The dictionary heuristic that remains is capped in absolute terms rather than
as a fraction of the row group. A dictionary allowed to reach half a row group
makes fixed-width chunks 30% _larger_ than plain encoding, so the cap is a
guarantee about the size of what you get, not only about how fast you get it.

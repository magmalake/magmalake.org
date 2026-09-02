---
title: How far I trust parquet.mojo, and why
description: Our native Parquet reader now reads 66 of the 69 files in Apache's own corpus.
eyebrow: Correctness
date: 2026-09-02
sourceUrl: https://github.com/magmalake/parquet.mojo
sourceLabel: parquet.mojo
draft: true
---

Here is the current state of parquet.mojo's validation, what
each layer of it is actually worth, and the three files it still cannot read.

The scoreboard first:

| check | state |
| --- | --- |
| Unit and parity tests | 52, plus 5 more for the FFI codecs — on nightly and stable, Linux and macOS |
| pyarrow value parity | 24 fixtures, **more than 20,000 value assertions**, at four batch sizes |
| Second writer | 9 real Iceberg data files, six written by parquet-rs 58 |
| Arrow C Data Interface | 53 columns across 10 fixtures imported by pyarrow |
| Write path | every fixture written back out and read by pyarrow |
| apache/parquet-testing | **66 of 69** `data/` files read; **7 of 8** `bad_data/` files rejected |

That last row is the one that looks like the headline. It is not, and I want
to explain why before I lean on it.

## The oracles we use

pyarrow is the primary oracle, and it is used more aggressively than "we compared
the output." `tools/oracle_pyarrow.py` reads each fixture and dumps **every**
**value of every column** to JSON beside it: nulls as `null`, floats as their
exact IEEE-754 bits, decimals as their unscaled 128-bit integer, binary as hex,
timestamps as the integer they store, lists as arrays, structs as objects, maps
as arrays of pairs. The Mojo suite reproduces each of those from its own decode,
value by value _and_ as a CRC32 over a canonical serialisation of the whole
column — then does it again at batch sizes 1, 3, 64 and 997, because a bug that
only appears when a value straddles a batch boundary is a real bug.

One oracle is not enough, though, because one oracle is one implementation's
opinion. Three more sit behind it:

- **A second writer.** Nine real Iceberg data files, six of them written by
  parquet-rs 58 rather than pyarrow. They bring things pyarrow never emits: a
  root schema element named `arrow_schema`, top-level `required` columns,
  Iceberg field ids on every column, and a position-delete file using the
  reserved ids 2147483546 and 2147483545.
- **The interface, not just the values.** `pixi run verify-c` builds the reader
  into a shared library, and a Python script dlopens it and hands the two
  structs straight to `pyarrow.Array._import_from_c`. 53 columns across 10
  fixtures import and compare equal — then get dropped, so pyarrow calls our
  `release` callback. That is a stronger claim than "the numbers match": it says
  the memory layout is Arrow's, not merely Arrow-shaped.
- **The write path, in reverse.** Every fixture goes out through our writer and
  back in through pyarrow.

And then hostile input, which is validation of a different kind: an empty file,
a 7-byte file, bad leading and trailing magic, all 23 truncations of a real
file, a flipped byte inside a checksummed page, eleven single-byte corruptions
of a page header, a dictionary index out of range, a level above the column
maximum. Each must raise. None may crash or read out of bounds.

## What the corpus adds

Fixtures are files I chose. The corpus at apache/parquet-testing is files other people chose,
including several nobody would write on purpose.
`pixi run -e codecs conformance <checkout>` runs the whole thing and prints a
line per file.

It is also the only part of this suite that tests _rejection_. `bad_data/`
holds eight files every implementation should refuse, and we refuse seven.

## The three files that do not read

**Two are deliberately corrupt** — `datapage_v1-corrupt-checksum.parquet` and
`rle-dict-uncompressed-corrupt-checksum.parquet`. Refusing them is the correct
answer, and they are counted as unreadable only because the runner's job is to
make a _new_ failure stand out instead of blending into a known-bad list.

**The third is `large_string_map.brotli.parquet`, and it is not what it looks**
**like.** Until this week it was listed as "BROTLI codec not implemented", which
was true and which was also hiding the real problem. Brotli now works — I bound
libbrotli rather than implementing RFC 7932, whose static dictionary alone is
122 KB of data that is _part of the format_ — and the file decodes its Brotli
pages perfectly. All 2,147,483,648 bytes of them. Then the offsets wrap.

Arrow's `binary`/`string` layout addresses value bytes with 32-bit offsets, and
that column chunk holds exactly 2 GiB. Reading it needs 64-bit offsets
(`large_binary`) or the column split across several record batches, and
parquet.mojo does neither yet. Worse, the wrap used to surface far from its
cause: an out-of-bounds slice during assembly, which trips a bounds assert and
takes the process down rather than raising — running the corpus killed the
runner mid-directory. The four places that grow a variable-length buffer now
check, so it is a reported failure with a message that says what is actually
wrong.

One file also goes the other way: we **accept** `ARROW-GH-43605.parquet`, which
Arrow rejects. Its dictionary indices use an RLE bit width of 0. The obvious
check — the width must be wide enough to address the whole dictionary — is
wrong, and I know it is wrong because I wrote it, and it rejected
`alltypes_tiny_pages.parquet`, a perfectly valid file. A page may legitimately
use width 0 when its own indices happen to be all zero, and nothing in the
format distinguishes that from the corrupt case. So we are more permissive than
Arrow here, deliberately, and it is in the report rather than hidden in a pass.

## When the oracle is the one that is wrong

Holding implementations against each other cuts both ways. One disagreement
turned out to be pyarrow's: the Parquet writer undercounts nulls for a
fixed-width leaf under `list<struct>` when some lists are null or empty. The
`BYTE_ARRAY` leaf sitting beside it in the same struct is correct, so two
leaves of one file disagree about the same level records. The wrong numbers are
in the file, not in pyarrow's reader — DuckDB agrees with us. That is
[apache/arrow#51097](https://github.com/apache/arrow/issues/51097), reduced to
a standalone repro with no magmalake code in it before it was filed.

## Summary

Every codec the Parquet spec defines now reads, and every encoding including
ALP. That is coverage, not proof. There is no fuzzing here, no property-based
generation of adversarial pages, and no encrypted files at all — Parquet
modular encryption is unimplemented and a `PARE` footer raises. Nested
predicates inside list and map elements do not prune. And a column chunk with
more than 2 GiB of string data raises rather than reads.

What I will claim is narrower and, I think, more useful: for the files in the
corpus and the fixtures, this reader agrees with pyarrow value for value, and
where it disagrees I can tell you which one of us is wrong and why.

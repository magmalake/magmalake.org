---
title: "DuckDB and Mojo: a sound example"
description: Five audio features as ordinary SQL expressions, computed in Mojo on the bytes of the DuckDB vector. What it guarantees, what it costs to carry, and where the speed actually comes from.
eyebrow: Interop
date: 2026-09-11
sourceUrl: https://github.com/magmalake/duckdb.extension
sourceLabel: duckdb.extension
related:
  - parquet-mojo-against-pyarrow
  - how-far-parquet-mojo-is-validated
draft: true
---

The `mlake` DuckDB extension already read Iceberg tables through the Mojo
stack. It now also computes: five audio features over a `BLOB` column, and a
table function over a directory of recordings. The kernel is Mojo, compiled
into the extension, running on the bytes of the DuckDB vector where they
already are.

Use this shape when the per-row work is real, the data is already in the
database, and you want the result to compose with the rest of the query. Use a
Python UDF when the kernel is one numpy call away and you are not short of
time. The measurements below say where the line falls.

## The query

Acoustic sensors at four construction sites, two seconds of sound an hour. A
relational table says where each sensor is and when each clip was taken. Noise
permits run 07:00 to 19:00.

```sql
WITH measured AS (
    SELECT s.site, r.recorded_at, mlake_rms_db(r.clip) AS loudness_db
    FROM recordings r JOIN sensors s USING (sensor_id)
),
baseline AS (
    SELECT *, median(loudness_db) OVER (PARTITION BY site) AS site_median
    FROM measured
)
SELECT site, recorded_at, round(loudness_db, 1)
FROM baseline
WHERE hour(recorded_at) NOT BETWEEN 7 AND 18
  AND loudness_db - site_median > 12;
```

The site and the hour are relational. The loudness is a pass over 32,000
samples in Mojo. Comparing against the site's own baseline is a window function
over the column that pass produced — available only because the feature is an
_expression_ rather than a number computed elsewhere and loaded back in. It
works in a `WHERE`, in a `GROUP BY`, inside a window, anywhere a column does.

## The functions

`mlake_rms_db`, `mlake_peak_db`, `mlake_centroid_hz`, `mlake_zcr` and
`mlake_duration_s` each take a WAV `BLOB` and return a `DOUBLE`. For samples
still in files rather than in a column:

```sql
SELECT * FROM mlake_audio_features('recordings/*.wav');
-- path, sample_rate, channels, frames, duration_s,
-- rms_db, peak_db, centroid_hz, zcr, error
```

A clip that will not decode is a NULL from the scalar functions and a row with
an `error` from the table function. Neither fails the query: one bad file in
two thousand costs a row, and the table function names which row and why.

## Correctness

Every feature is defined tightly enough to be reimplemented against, and is.
The repository carries an independent numpy implementation — `np.fft.rfft` over
Python's `wave` module, sharing no code with the Mojo — and diffs the two over
every clip in the dataset:

```
  ok  duration_s   max |mojo - numpy| = 0.000e+00
  ok  rms_db       max |mojo - numpy| = 0.000e+00
  ok  peak_db      max |mojo - numpy| = 0.000e+00
  ok  centroid_hz  max |mojo - numpy| = 2.274e-12
  ok  zcr          max |mojo - numpy| = 0.000e+00
```

Exact on four of the five. The centroid is a ratio of two sums over 513 bins,
and two correct implementations may add them in either order.

## Throughput

1152 clips, 74 MB of 16-bit PCM, M4, DuckDB 1.4.1. The same query and the same
answer, four ways of getting the column — the extension, a DuckDB Python UDF
handed whole pyarrow arrays, one handed a blob at a time, and fetching every
blob into Python to loop there.

`rms_db`, one pass over the samples:

| | 1 thread | 10 threads |
|---|---|---|
| mojo | 67.6 ms | **13.8 ms** |
| py-arrow | 90.7 ms | 45.5 ms |
| py-native | 129.8 ms | 148.8 ms |
| fetch+numpy | 93.8 ms | 51.7 ms |

`centroid_hz`, sixty-odd Fourier transforms per clip:

| | 1 thread | 10 threads |
|---|---|---|
| mojo | 271.7 ms | **57.3 ms** |
| py-arrow | 276.7 ms | 110.1 ms |
| py-native | 318.6 ms | 195.5 ms |
| fetch+numpy | 279.8 ms | 235.2 ms |

Two different results, and the difference between them is the useful part.

**On one thread, the Fourier transform is a tie.** numpy's is pocketfft and it
is excellent; parity is the honest ceiling for a hand-written transform, and
parity is what this gets. The single-threaded gain is on `rms_db`, at 1.4×, and
that gain is not arithmetic — it is 1152 blobs not becoming Python objects.

**With threads it is not close.** DuckDB evaluates a scalar function from every
worker, and there is no interpreter state to serialise on: 4.9× across ten
cores, against 2.5× for the best Python UDF. That ratio is the GIL, and
vectorising harder inside the UDF does not move it.

So the claim is not that Mojo beats numpy at FFTs. It is that a kernel compiled
into the database parallelises with the query, does not cross a language
boundary once per row, and is written in something other than C++.

## What it costs to carry

| | Mojo | Python |
|---|---|---|
| decode + four features | 331 lines | 64 lines |
| leaning on | nothing | numpy, 24 MB |
| shipped as | a 2.1 MB shared library | an interpreter and its site-packages |

Five times the source, because the Mojo does the work instead of delegating it:
chunk-walking the RIFF container that Python's `wave` module handles, and a
radix-2 transform where numpy calls `rfft`. That is the trade — more code you
own, and nothing to install beside the database.

## Limits

16-bit PCM WAVE only. Anything else is refused by name rather than guessed at,
so a file this cannot read says what it is.

Globs match one path component: `clips/*.wav`, not `clips/**/*.wav`. A union of
two calls says the same thing out loud.

The audio table function has neither projection nor filter pushdown, so it
decodes every clip the pattern matches and lets DuckDB discard the rest. The
scalar functions have no such problem — a `WHERE` that eliminates a row before
the expression runs eliminates the decode with it.

## Running it

`examples/soundlake` in the repository is the whole thing: a generated dataset,
eight queries in order, the numpy cross-check, and the benchmark above.

```sh
pixi run build
cd examples/soundlake && ./run.sh bench
```

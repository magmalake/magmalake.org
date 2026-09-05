export interface Row {
  op: string;
  /** Extra qualifier shown under the operation. */
  note?: string;
  result: string;
  /** Highlight the result as a headline number. */
  lead?: boolean;
  reference?: string;
}

export interface Group {
  id: string;
  title: string;
  blurb: string;
  rows: Row[];
}

/**
 * Apple M4 — 10 cores, four of them performance — macOS, stable Mojo 1.0.0.
 * Re-measured on 5 September 2026, with nothing else building on the machine.
 *
 * Every row says how many cores it used. "Single core" is no longer a property
 * of the stack: `ParquetReader.num_workers` and `ScanOptions.num_workers` both
 * exist now, so the thread count is something each row has to carry.
 *
 * Most rows come from bench.mojo, and the benchmark binary is **built and then
 * run** — never `mojo run`, which JIT-executes the suite and inflated one of
 * these benchmarks by 1.9×. The harness calibrates an iteration count, times
 * each iteration separately wherever one iteration costs more than 100× the
 * clock's tick, and reports **p50 and p90 over real iterations** — not a mean,
 * which a single outlier can move by 30%, and not a best-of-N. It also times a
 * fixed reference kernel either side of every benchmark, re-times the first
 * benchmark at the end, and reads the load average, then prints a verdict on
 * whether the machine held still. Every figure below comes from a run that
 * said `steady`, and numbers are taken per benchmark or per small group rather
 * than from one pass over a whole suite.
 *
 * Two repos are exceptions and their rows say so: iceberg.mojo's bench takes a
 * best-of-three warm rather than percentiles, and objectstore.mojo's is a
 * single timed pass — those figures are the median of three runs of it.
 *
 * pyarrow figures come from `parquet.mojo/tools/bench_pyarrow.py`, which
 * reports two labelled legs: **one thread** (`set_cpu_count(1)`,
 * `set_io_thread_count(1)`, `use_threads=False`) and **threaded** (pyarrow's
 * own CPU count, `use_threads=True`). Every row names the leg it is against,
 * because on the same file the two are 2.9× apart.
 */
export const perfGroups: Group[] = [
  {
    id: "table",
    title: "Table and file formats",
    blurb:
      "Flat columnar Parquet is where the native stack pays off. Nested and mixed data is where it does not, and an Iceberg scan is still behind pyarrow at matched thread counts — both are in the table.",
    rows: [
      {
        op: "Parquet read, 1M rows — 1 core",
        note: "int64, double and two dictionary columns, uncompressed, four row groups",
        result: "4.7 ms p50 / 4.8 p90 — 211M rows/s",
        lead: true,
        reference: "pyarrow, one thread: 7.9 ms — we are 1.7× faster",
      },
      {
        op: "Parquet read, 1M rows — 4 workers",
        note: "the same file, ParquetReader.num_workers = 4",
        result: "2.35 ms p50 / 2.4 p90 — 426M rows/s",
        lead: true,
        reference:
          "pyarrow, threaded across all 10 CPUs: 2.7 ms — we are 1.15× faster while using four threads to its ten",
      },
      {
        op: "Parquet read, worker scaling",
        note: "the same file at 1 / 2 / 4 / 8 / 10 workers",
        result: "4.7 / 3.3 / 2.35 / 2.17 / 2.14 ms",
        reference:
          "it bends at four, which is how many performance cores this M4 has. Past four the p50 buys about 8% and the p90 gets worse — 2.4 ms at four workers, 2.9 ms at eight.",
      },
      {
        op: "Parquet read, 100k rows, nested and mixed",
        note: "int64, double, string, bool and a list<int32>, snappy — 1 core / 4 workers",
        result: "3.3 ms / 1.15 ms",
        reference:
          "pyarrow 2.3 ms one thread, 0.70 ms threaded — 1.4× and 1.6× faster than us. This one is lost on a single core, before threading comes into it at all.",
      },
      {
        op: "Parquet write, 1M rows",
        result: "31.7 ms",
        reference: "pyarrow 31.7 ms — parity, inside the run-to-run spread",
      },
      {
        op: "Parquet footer",
        note: "1,000 columns × 50 row groups = 50,000 column chunks",
        result: "56.6 ms read / 2.6 ms write",
      },
      {
        op: "Iceberg scan, 1M rows — 1 core / 4 workers",
        note: "zstd, six columns; best-of-three warm, not the percentile harness",
        result: "36.3 ms / 11.3 ms",
        reference:
          "pyarrow on the same four data files: 27.3 ms one thread, 8.8 ms threaded — about 1.3× ahead of us at either thread count. PyIceberg 0.11.1 does the whole scan in 8.0 ms on pyarrow's pool.",
      },
      {
        op: "Iceberg scan, nested columns, 200k rows",
        note: "a struct and a list column, 1 core",
        result: "10.1 ms",
        reference:
          "PyIceberg 4.0 ms on pyarrow's thread pool — 2.5× faster. Nested reconstruction is the slowest path we have: on the mixed Parquet file above, Dremel assembly into Arrow buffers is 30% of the read and decompression another 25%.",
      },
      {
        op: "Iceberg scan, 2M rows over eight files",
        note: "1 / 2 / 4 / 8 workers, to_batches",
        result: "71.2 / 38.1 / 21.8 / 16.5 ms — 4.3× at eight",
        reference:
          "eight files give the workers more to divide than the four-file table above; PyIceberg reads the same table in 15 ms",
      },
      {
        op: "Iceberg append, 1M rows",
        note: "data files, manifests and commit",
        result: "192 ms",
        reference: "PyIceberg 165 ms, writing three times the Parquet bytes",
      },
      {
        op: "Iceberg scan planning, 500 manifests",
        result: "21.2 ms for 2,000 file tasks",
        reference:
          "31.5 µs fixed per manifest, 11.6 µs of that the file read itself",
      },
      {
        op: "Avro decode, manifest-shaped records",
        note: "the schema-compiled cursor, 1 core",
        result: "18.1M records/s — 25.9M with field selection",
        lead: true,
        reference: "fastavro 1.12.2 on the same file: 1.70M — 10.7× faster",
      },
      { op: "Avro inflate", result: "1.0 GB/s" },
    ],
  },
  {
    id: "primitives",
    title: "Primitives",
    blurb:
      "Codecs, hashes and threads — the layer everything above is only as fast as. Single core except where a row counts workers.",
    rows: [
      {
        op: "SHA-256",
        note: "pure Mojo with ARMv8 crypto intrinsics; a single timed pass, median of three",
        result: "2.70 GB/s — 590 MB/s scalar fallback",
        lead: true,
        reference: "OpenSSL 3.17 GB/s on the same 64 MiB, in the same process",
      },
      {
        op: "zstd / lz4 / brotli decompress",
        note: "FFI — these measure libzstd, liblz4 and libbrotli, not Mojo",
        result: "11.1–32.9 / 13.5–20.2 / 2.4 GB/s",
        reference:
          "the zstd and lz4 ranges span compression levels and compressible versus random input",
      },
      {
        op: "snappy decompress",
        note: "pure Mojo, 64 MiB",
        result: "3.15 GB/s compressible, 31.8 GB/s incompressible",
        reference:
          "the incompressible path is essentially a memcpy and swings like one — 17.5 GB/s at p90",
      },
      {
        op: "CRC-32 / murmur3 / XXH64",
        note: "pure Mojo, scalar",
        result: "1.42 / 1.61 / 1.34 GB/s",
      },
      {
        op: "Roaring bitmap, 10M random values",
        note: "add / serialize / deserialize",
        result: "1.30 s / 22.2 ms / 60.3 ms",
        reference:
          "the add figure was published as 5–11 s until the RNG was moved out of the timed loop",
      },
      {
        op: "threads: spawn and join",
        note: "500 sequential pthread round trips",
        result: "≈11 µs warm",
        reference:
          "15–20 µs for the first threads a process spawns, so a pool pays that once rather than per task",
      },
      {
        op: "threads: parallel_for over 100M Int64",
        note: "1 / 2 / 4 / 8 / 10 workers",
        result: "2.3× at four workers, 3.5× at ten",
        reference:
          "a parallel memcpy on the same machine reaches 3.9× at two workers and never improves — that is the memory-bandwidth ceiling",
      },
    ],
  },
  {
    id: "io",
    title: "Object storage",
    blurb:
      "Measured against MinIO on the same machine, so the network is not the story. This repo's bench is a single timed pass rather than the percentile harness; these are the median of three runs.",
    rows: [
      {
        op: "S3 multipart upload, 16 MB",
        note: "8 MB parts, each signed with SigV4",
        result: "396 MB/s",
        lead: true,
        reference:
          "the same object comes back down at 2.3 GB/s — the upload is what pays for hashing and part framing",
      },
      {
        op: "HTTP range read, pooled connection",
        note: "200 × 64 KiB, one request each",
        result: "0.147 ms local / 0.495 ms signed S3",
      },
      {
        op: "The same 200 ranges, coalesced",
        note: "adjacent spans asked for at once — the shape a Parquet scan actually has",
        result: "0.022 ms local / 0.029 ms signed S3, per range",
        reference: "6.7× and 17× cheaper per range than asking one at a time",
      },
    ],
  },
];

export interface Pass {
  found: string;
  fix: string;
}

/** The four optimisation passes, each of which found its bottleneck by profiling. */
export const passes: Pass[] = [
  {
    found: "A dlopen on every single decompress call",
    fix: "About 450 µs per call, spent opening a library that was already open.",
  },
  {
    found: "SHA-256 running 45× off what the hardware can do",
    fix: "The scalar implementation was correct and slow; the CPU had crypto instructions sitting idle.",
  },
  {
    found: "Avro boxing roughly 60 allocations per record",
    fix: "And JSON schema parsing turning out to be 72% of the cost of reading a manifest.",
  },
  {
    found: "500 byte-identical manifest schemas, each parsed from scratch",
    fix: "Caching the parsed schema and the plan is what puts scan planning at 21 ms; it was three times that before.",
  },
];

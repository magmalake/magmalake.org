export interface Row {
  op: string;
  /** Extra qualifier shown under the operation. */
  note?: string;
  result: string;
  /** Highlight the result as a headline number. */
  lead?: boolean;
  reference?: string;
  /** The tins (by name, lower case) whose pages show this row. */
  tins?: string[];
  /** One of the few rows on /performance itself. */
  highlight?: boolean;
}

export interface Group {
  id: string;
  title: string;
  blurb: string;
  rows: Row[];
  /** Tins whose pages show the whole group, because its rows only make
   * sense side by side. */
  tins?: string[];
}

/**
 * Apple M4 — 10 cores, four of them performance — macOS, stable Mojo 1.0.0.
 * Re-measured on 5 September 2026, with nothing else building on the machine.
 * The toolchain moved to 1.1.0 on 20 September 2026 and to 1.2.0 on 24
 * October 2026; these numbers were not re-taken for either, so the line above
 * is the toolchain they were measured on rather than the one the tins build
 * with today.
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
 * The Iceberg rows were re-measured on 15 September 2026, median of three
 * runs, and every one of them got faster. Nothing about the reader changed:
 * `pixi.lock` had pinned `zstd-mojo` at that repo's first commit, which
 * predates its process-wide `OwnedDLHandle` and so dlopened the shim on every
 * decompressed page. The figures published before that date were measuring the
 * loader as much as the scan — about 1.2× on this bench table, and far more on
 * a real one, because the cost is per page and this table has few of them.
 * Parquet's rows are unaffected: that bench file is uncompressed.
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
        tins: ["parquet"],
        highlight: true,
        op: "Parquet read, 1M rows — 1 core",
        note: "int64, double and two dictionary columns, uncompressed, four row groups",
        result: "3.77 ms p50 / 3.83 p90 — 265M rows/s",
        lead: true,
        reference: "pyarrow, one thread: 8.0 ms — we are 2.1× faster",
      },
      {
        tins: ["parquet"],
        highlight: true,
        op: "Parquet read, 1M rows — 4 workers",
        note: "the same file, ParquetReader.num_workers = 4",
        result: "1.96 ms p50 / 2.07 p90 — 510M rows/s",
        lead: true,
        reference:
          "pyarrow, threaded across all 10 CPUs: 2.57 ms — we are 1.3× faster while using four threads to its ten",
      },
      {
        tins: ["parquet"],
        op: "Parquet read, worker scaling",
        note: "the same file at 1 / 2 / 4 / 8 / 10 workers",
        result: "3.77 / 2.42 / 1.96 / 1.90 / 1.90 ms",
        reference:
          "it bends at four, which is how many performance cores this M4 has. Past four the p50 buys about 3% and the p90 gets worse — 2.07 ms at four workers, 2.50 ms at eight.",
      },
      {
        tins: ["parquet"],
        highlight: true,
        op: "Parquet read, 100k rows, nested and mixed",
        note: "int64, double, string, bool and a list<int32>, snappy — 1 core / 4 workers",
        result: "2.63 ms / 0.98 ms — 0.78 ms at eight workers",
        reference:
          "pyarrow 2.24 ms one thread, 0.66 ms threaded — 1.17× and 1.18× faster than us. Still the file we lose, but by a fifth rather than by half.",
      },
      {
        tins: ["parquet"],
        op: "Parquet write, 1M rows",
        result: "32.8 ms",
        reference: "pyarrow 31.7 ms — parity, inside the run-to-run spread",
      },
      {
        tins: ["parquet"],
        op: "Parquet footer",
        note: "1,000 columns × 50 row groups = 50,000 column chunks",
        result: "56.6 ms read / 2.6 ms write",
      },
      {
        tins: ["iceberg"],
        highlight: true,
        op: "Iceberg scan, 1M rows — 1 core / 4 workers",
        note: "zstd, six columns; best-of-three warm, not the percentile harness",
        result: "30.3 ms / 9.9 ms",
        reference:
          "pyarrow on the same four data files: 27.3 ms one thread, 8.8 ms threaded — about 1.1× ahead of us at either thread count. PyIceberg 0.11.1 does the whole scan in 8.0 ms on pyarrow's pool.",
      },
      {
        tins: ["iceberg"],
        op: "Iceberg scan, nested columns, 200k rows",
        note: "a struct and a list column, 1 core",
        result: "8.7 ms",
        reference:
          "PyIceberg 5 ms on pyarrow's thread pool in the same runs — about 1.7× faster. Nested reconstruction is the slowest path we have: on the mixed Parquet file in parquet's table, Dremel assembly into Arrow buffers is 30% of the read and decompression another 25%.",
      },
      {
        tins: ["iceberg"],
        op: "Iceberg scan, 2M rows over eight files",
        note: "1 / 2 / 4 / 8 workers, to_batches",
        result: "60.2 / 32.1 / 19.3 / 14.9 ms — 4.0× at eight",
        reference:
          "eight files give the workers more to divide than the four-file table above; PyIceberg reads the same table in 15 ms",
      },
      {
        tins: ["iceberg"],
        op: "Iceberg append, 1M rows",
        note: "data files, manifests and commit",
        result: "191 ms",
        reference: "PyIceberg 156 ms, writing three times the Parquet bytes",
      },
      {
        tins: ["iceberg"],
        op: "Iceberg scan planning, 500 manifests",
        result: "19.5 ms for 2,000 file tasks",
        reference:
          "28.9 µs fixed per manifest, 10.2 µs of that the file read itself",
      },
      {
        tins: ["avro"],
        highlight: true,
        op: "Avro decode, manifest-shaped records",
        note: "the schema-compiled cursor, 1 core",
        result: "18.1M records/s — 25.9M with field selection",
        lead: true,
        reference: "fastavro 1.12.2 on the same file: 1.70M — 10.7× faster",
      },
      { tins: ["avro"], op: "Avro inflate", result: "1.0 GB/s" },
    ],
  },
  {
    id: "primitives",
    title: "Primitives",
    blurb:
      "Codecs, hashes and threads — the layer everything above is only as fast as. Single core except where a row counts workers.",
    rows: [
      {
        tins: ["objectstore"],
        highlight: true,
        op: "SHA-256",
        note: "pure Mojo with ARMv8 crypto intrinsics; a single timed pass, median of three",
        result: "2.70 GB/s — 590 MB/s scalar fallback",
        lead: true,
        reference: "OpenSSL 3.17 GB/s on the same 64 MiB, in the same process",
      },
      {
        tins: ["zstd"],
        op: "zstd decompress",
        note: "FFI — this measures libzstd, not Mojo",
        result: "11.1–32.9 GB/s",
        reference:
          "the range spans compression levels and compressible versus random input",
      },
      {
        tins: ["lz4"],
        op: "lz4 decompress",
        note: "FFI — this measures liblz4, not Mojo",
        result: "13.5–20.2 GB/s",
        reference:
          "the range spans compression levels and compressible versus random input",
      },
      {
        tins: ["brotli"],
        op: "brotli decompress",
        note: "FFI — this measures libbrotli, not Mojo",
        result: "2.4 GB/s",
      },
      {
        tins: ["snappy"],
        op: "snappy decompress",
        note: "pure Mojo, 64 MiB",
        result: "3.15 GB/s compressible, 31.8 GB/s incompressible",
        reference:
          "the incompressible path is essentially a memcpy and swings like one — 17.5 GB/s at p90",
      },
      {
        tins: ["hashes"],
        op: "CRC-32 / murmur3 / XXH64",
        note: "pure Mojo, scalar",
        result: "1.42 / 1.61 / 1.34 GB/s",
      },
      {
        tins: ["roaring"],
        op: "Roaring bitmap, 10M random values",
        note: "add / serialize / deserialize",
        result: "1.30 s / 22.2 ms / 60.3 ms",
        reference:
          "the add figure was published as 5–11 s until the RNG was moved out of the timed loop",
      },
      {
        tins: ["threads"],
        op: "threads: spawn and join",
        note: "500 sequential pthread round trips",
        result: "≈11 µs warm",
        reference:
          "15–20 µs for the first threads a process spawns, so a pool pays that once rather than per task",
      },
      {
        tins: ["threads"],
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
        tins: ["objectstore"],
        op: "S3 multipart upload, 16 MB",
        note: "8 MB parts, each signed with SigV4",
        result: "396 MB/s",
        lead: true,
        reference:
          "the same object comes back down at 2.3 GB/s — the upload is what pays for hashing and part framing",
      },
      {
        tins: ["objectstore"],
        op: "HTTP range read, pooled connection",
        note: "200 × 64 KiB, one request each",
        result: "0.147 ms local / 0.495 ms signed S3",
      },
      {
        tins: ["objectstore"],
        highlight: true,
        op: "The same 200 ranges, coalesced",
        note: "adjacent spans asked for at once — the shape a Parquet scan actually has",
        result: "0.022 ms local / 0.029 ms signed S3, per range",
        reference: "6.7× and 17× cheaper per range than asking one at a time",
      },
    ],
  },
  {
    id: "boundary",
    tins: ["memory-region"],
    title: "Crossing the boundary",
    blurb:
      "One column of a 79,478,796-row table, read by the same engine — Daft — with nothing changing but how the rows arrive. Every row but one is pyarrow doing the reading, so the ratios are the boundary rather than two readers; the exception says so. Measured 19 September 2026 with pyarrow-flight.example's `pixi run transports`, p50 of five full reads after a discarded warm-up, every leg asserting the same row count.",
    rows: [
      {
        op: "In this process, no boundary at all",
        note: "the control: pyarrow reading the files and handing Daft the batches, which is exactly what the Flight server does minus the wire",
        result: "62 ms",
        lead: true,
      },
      {
        op: "In this process, Arrow C Data Interface",
        note: "iceberg.mojo scanning an Iceberg table into Daft's buffers, nothing encoded or sent",
        result: "89 ms",
        reference:
          "a different reader, so this is not a boundary cost — there is no boundary. It is what our Iceberg scan costs against pyarrow reading the Parquet files directly.",
      },
      {
        op: "Arrow Flight, TCP on loopback",
        note: "pyarrow's own Flight server over the same Parquet files",
        result: "149 ms — 2.4× the in-process read",
        lead: true,
        reference:
          "crossing a process costs 2.4×, not an order of magnitude: a fair price for a crash boundary, a retry boundary, or a credential that should not leave a service",
      },
      {
        op: "Arrow Flight, flight.mojo's own server",
        note: "the same protocol, our implementation",
        result: "377 ms — 2.5× pyarrow's server",
        reference:
          "12.1 s before four fixes: byte-at-a-time copies in four places, gzip applied to an Arrow payload the client merely said it would accept, a full table scan on every call to learn the schema, and a quadratic in HTTP/2 flow control that copied about 6 GB to send 28 MB",
      },
      {
        op: "Shared memory, between two processes",
        note: "the same Flight plan, but DoGet answers with the name of a mapping and the client maps it — pyarrow on both sides",
        result: "228 ms — 1.5× the loopback stream",
        reference:
          "the consumer's half is nearly free; the producer has to materialise a whole split before the consumer may touch it, and both sides fault every page, where a stream overlaps the two and writes into kernel buffers that are already resident",
      },
      {
        op: "Shared memory, our own producer",
        note: "iceberg.mojo writing Arrow buffers into one mapping per split, publishing each batch as it lands, read by a pool of processes",
        result: "115 ms — faster than the same column over Flight",
        lead: true,
        reference:
          "not comparable to the rows above: a decoder 1.4× slower than pyarrow's and a process pool rather than one threaded server, so two things move at once. It was 288 ms when each batch got a mapping of its own — a mapping's create/size/map/unmap/unlink cycle is 4.01 ms per 8 MB batch against 3.05 ms for the copy inside it, so the lifecycle was the larger half all along.",
      },
      {
        op: "Arrow Flight, Unix domain socket",
        note: "pyarrow's server again, gRPC over a socket instead of loopback",
        result: "573 ms",
        reference:
          "the obvious same-machine optimisation, measured twice either side of the TCP run, and four times worse than loopback on macOS",
      },
      {
        op: "The handover alone, no Parquet in it",
        note: "one column already in Arrow: an IPC file memory-mapped, then read into the heap",
        result: "24 ms mapped / 54 ms copied",
        reference:
          "the gap is one copy of 636 MB, and that copy is the whole of what a shared mapping saves — the C Data Interface cannot do it across processes because it hands over pointers",
      },
    ],
  },
];

export interface Pass {
  found: string;
  fix: string;
  /** The tin the fix landed in. */
  tin: string;
}

/** The four optimisation passes, each of which found its bottleneck by profiling. */
export const passes: Pass[] = [
  {
    tin: "zstd",
    found: "A dlopen on every single decompress call",
    fix: "About 450 µs per call, spent opening a library that was already open.",
  },
  {
    tin: "objectstore",
    found: "SHA-256 running 45× off what the hardware can do",
    fix: "The scalar implementation was correct and slow; the CPU had crypto instructions sitting idle.",
  },
  {
    tin: "avro",
    found: "Avro boxing roughly 60 allocations per record",
    fix: "And JSON schema parsing turning out to be 72% of the cost of reading a manifest.",
  },
  {
    tin: "iceberg",
    found: "500 byte-identical manifest schemas, each parsed from scratch",
    fix: "Caching the parsed schema and the plan is what puts scan planning at 21 ms; it was three times that before.",
  },
];

/** Where and when the hand-measured rows were taken, for each tin page. */
export const MEASURED_ON =
  "Apple M4 — ten cores, four of them performance — macOS, stable Mojo 1.0.0, with nothing else building on the machine. Measured on 5 September 2026; the Iceberg rows on 15 September, the boundary rows on 19 September.";

/** The rows a tin's page shows, grouped as on the old single table. */
export const perfFor = (tin: string): Group[] =>
  perfGroups
    // A group shown in part loses its blurb, which speaks for the whole group.
    .map((g) =>
      g.tins?.includes(tin) ? g : { ...g, blurb: "", rows: g.rows.filter((r) => r.tins?.includes(tin)) },
    )
    .filter((g) => g.rows.length > 0);

export const passesFor = (tin: string): Pass[] => passes.filter((p) => p.tin === tin);

/** The few rows /performance keeps, in its order. */
export const highlights: Group = {
  id: "highlights",
  title: "Highlights",
  blurb:
    "The strongest numbers and the clearest losses. Every row links to the tin it belongs to, where the rest of its table is.",
  rows: [
    ...perfGroups.flatMap((g) => g.rows.filter((r) => r.highlight)),
  ],
};

/** /performance: its lede. */
export const perfIntro = [
  "Most of the rows on this site were measured on one machine, an Apple M4 with ten cores, four of them performance, with nothing else building on it. Same files, and every row reproducible from its own repository. The few below say the most, in both directions: magmalake beats pyarrow on flat columnar Parquet reads, on one core and on four; it loses on nested and mixed data; and an Iceberg scan is still behind pyarrow at matched thread counts. Each tin's page has the rest of its table.",
];

/** /performance: how the numbers were taken. May hold markup. */
export const perfMethod = [
  "Almost every number is a <em>p50 over real iterations</em>, with the p90 beside it where the spread is the point — not a mean, which one slow sample can move by 30%, and not a best-of-N. The two repos whose benchmarks are not on that harness yet, iceberg and objectstore, say so in their own rows. Each benchmark is <em>compiled and then run</em>: JIT-executing a suite with <code>mojo run</code> inflated one of these figures by 1.9×, and comparing a JIT number against a compiled one produced two confident wrong diagnoses before that was found. Rows are taken per benchmark rather than from one pass over a whole suite, and the harness times a reference kernel either side of every benchmark and reads the load average, so a run taken on a busy machine says so instead of quietly reporting inflated numbers. Where a row measures a C library rather than Mojo, it says so.",
  "<strong>&ldquo;Single core&rdquo; is no longer a property of this stack.</strong> <code>ParquetReader.num_workers</code> and <code>ScanOptions.num_workers</code> both exist now, so every row carries its own thread count — and so does every pyarrow reference, which is quoted either as <em>one thread</em> (<code>set_cpu_count(1)</code>, <code>set_io_thread_count(1)</code>, <code>use_threads=False</code>) or as <em>threaded</em>, pyarrow's own default. On the 1M-row file those two legs are 2.9× apart, so a comparison that does not name the leg is not a comparison.",
  "They were measured on stable Mojo 1.0.0. The toolchain has since moved to 1.1.0 and 1.2.0, and these numbers were not re-taken for either.",
];

/** /performance: the CI benchmark histories. May hold markup. */
export const perfHistory = {
  before:
    "<strong>The tables are hand-measured; these are not.</strong> Those numbers were taken in one sitting on the M4, which is why they carry a date rather than a build number. Every merge also runs the same benchmarks on a GitHub runner and appends to a history each repository publishes itself:",
  after:
    "Expect those to be slower and noisier than the tables — a shared runner is not a workstation. They are worth reading as <em>trends</em>, not as absolute figures: each history is keyed by machine, so a run on a laptop and a run on CI stay separate series and are never averaged, and a benchmark is only flagged as regressed when it falls further than its own recent variance.",
};

/** /performance: reproducing a row. May hold markup. */
export const perfReproduce = {
  before:
    'Every tin carries its own benchmarks and runs them through the same harness, <a href="https://github.com/magmalake/bench.mojo" rel="noopener">bench.mojo</a>. Clone the repo a row belongs to and run:',
  commands: `git clone https://github.com/magmalake/parquet.mojo
cd parquet.mojo

pixi run -e bench bench                    # the table, with spread
pixi run -e bench bench -- --json          # every repetition, machine-readable
pixi run -e bench bench -- --list          # what this repo measures
pixi run -e bench bench -- --only bench_read_wide`,
  after: [
    "The <code>bench</code> environment is stable Mojo 1.2.0: a precompiled Mojo package is stamped with the compiler version that built it, and every tin builds with 1.2.0. The libraries themselves test on stable and nightly.",
    "One caveat on reproducing the numbers exactly: the worker ladders contend with each other if you run them together, so take them one at a time: <code>--only bench_read_wide_w4</code>.",
    "A few benchmarks need a fixture that is generated rather than committed — parquet wants <code>python tools/bench_pyarrow.py --make</code> first, iceberg builds a warehouse, objectstore needs MinIO. Each repo's README says which, and the bench stops with instructions rather than measuring the wrong thing. Expect your absolute numbers to differ from an M4; the ratios are what travel.",
  ],
};

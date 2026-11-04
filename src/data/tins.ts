export type Tier =
  | "execution"
  | "table"
  | "format"
  | "storage"
  | "primitive"
  | "utility"
  | "oracle"
  | "republished";

/** shelf: published on mojoshelf. source: built from its repository. planned:
 * designed, not built yet. */
export type Status = "shelf" | "source" | "planned";

export interface Tin {
  /** Short display name, as it appears in the stack diagram. */
  name: string;
  /** The mojoshelf registry name — `shelf add <pkg>`. */
  pkg: string;
  repo: string;
  /** Its own section of this site, with pages of its own (Orca, Dista).
   * Every other tin gets a generated page at /s/<name>. */
  site?: string;
  version: string;
  tier: Tier;
  /** Unset means "shelf". */
  status?: Status;
  /** A few words for its box in the stack diagram. */
  short: string;
  /** One sentence: what it is. */
  what: string;
  /** The correctness oracle — what gates it in CI. */
  oracle: string;
  /** Short capability bullets. */
  bullets: string[];
  /** Published benchmark history, for the tins that run one in CI. */
  benchmarks?: string;
  /** The README, when it isn't at the root of `repo`. */
  readme?: string;
  /** More on the correctness evidence, beyond the one-line oracle. */
  evidence?: string[];
  /** What it doesn't do yet. */
  notYet?: string[];
  /** A note under the not-yet list. May hold links (HTML). */
  notYetNote?: string;
  /** Short write-ups beside its performance numbers. The body may hold links (HTML). */
  perfNotes?: { title: string; body: string[] }[];
}

export const TIER_LABEL: Record<Tier, string> = {
  execution: "Execution",
  table: "Tables & catalogs",
  format: "File formats",
  storage: "Storage & databases",
  primitive: "Primitives",
  utility: "Utilities",
  oracle: "Cross-implementation oracle",
  republished: "Republished from upstream",
};

/** Top to bottom, as the stack is drawn. */
export const TIERS: Tier[] = [
  "execution",
  "table",
  "format",
  "storage",
  "primitive",
  "utility",
];

/** Beside the stack: not a layer of it. */
export const BESIDE: Tier[] = ["oracle", "republished"];

export const STATUS_LABEL: Record<Status, string> = {
  shelf: "on mojoshelf",
  source: "from source",
  planned: "planned",
};

export const statusOf = (t: Tin): Status => t.status ?? "shelf";

/** The URL segment of a tin's page: /s/<slug>. */
export const slugOf = (t: Tin): string => t.name.toLowerCase();

/** Where a tin's name links on this site. */
export const pageOf = (t: Tin): string => t.site ?? `/s/${slugOf(t)}`;

export const readmeOf = (t: Tin): string => t.readme ?? `${t.repo}#readme`;

export const installOf = (t: Tin): string => `pixi shelf add ${t.pkg}`;

export const tins: Tin[] = [
  {
    name: "Orca",
    pkg: "orca-mojo",
    repo: "https://github.com/magmalake/orca.mojo",
    site: "/s/orca",
    version: "0.3.2",
    tier: "execution",
    short: "pipelines as DAGs · cron schedules · backfills",
    what:
      "Orchestration for data pipelines written in Mojo: DAGs declared in Mojo and checked by the compiler, partitions by month or day, cron schedules in a time zone, and a scheduler that starts runs, backfills ranges and retries what failed. Steps run on Dista over Iceberg tables, with runs recorded in Postgres.",
    oracle: "taxibench's table: 2023–2024 NYC taxi trips to the same 79,478,796 rows and column sums",
    bullets: [
      "Edges type-checked at compile time; one binary per pipeline",
      "A killed run resumes where it stopped; a retried commit is recognised, not repeated",
      "Every month since 2011, 1.44 billion rows, backfilled four runs at a time",
      "A web UI next; lineage and Kubernetes after",
    ],
  },
  {
    name: "Dista",
    pkg: "dista-mojo",
    repo: "https://github.com/magmalake/dista.mojo",
    site: "/s/dista",
    version: "0.2.1",
    tier: "execution",
    short: "distributed tasks · actors · results that stay on workers",
    what:
      "Distributed tasks for Mojo: declare a function as a task, call it, and the work runs across a cluster, with large results staying on the worker that computed them. One binary for every role, on a laptop or on Kubernetes.",
    oracle: "Ray and Rust on the same queries: answers identical on 3, 6 and 12 nodes",
    bullets: [
      "Tasks on other tasks' results, gathers, Arrow batches between tasks",
      "A head that restarts: workers rejoin, drivers resume",
      "Actors: state on a worker of its own, calls in order",
      "1.4 billion taxi rows in S3: 3.8 s a pass on 12 nodes, against 6.7 s for Rust and 15.4 s for Ray",
    ],
  },
  {
    name: "iceberg",
    short: "metadata · scan planning · read · write · REST, SQL and filesystem catalogs",
    pkg: "iceberg-mojo",
    repo: "https://github.com/magmalake/iceberg.mojo",
    version: "0.8.6",
    tier: "table",
    what:
      "Native Apache Iceberg. Read a table's metadata.json, pick a snapshot, decode its manifests, plan a scan and read the rows — then create, append, delete, overwrite and expire. No JVM, no Python, no Rust in the path.",
    oracle: "PyIceberg 0.11.1 and DuckDB 1.5.5 — cell-exact, both directions",
    bullets: [
      "Format v1–v3 reads: position and equality deletes, v3 deletion vectors, schema evolution, nested types",
      "Writes: create, fast-append, delete (copy-on-write and merge-on-read), overwrite, dynamic partition overwrite, expire_snapshots",
      "Schema evolution as a write: add optional columns, rename, make optional, widen types and union_by_name, committed through every catalog",
      "REST, filesystem and SQL catalogs — the SQL one on SQLite or PostgreSQL, PyIceberg's schema; local, HTTP, S3, GCS and Azure IO",
    ],
    evidence: [
      "Row-sets cell-exact against PyIceberg 0.11.1 and DuckDB 1.5.5 across 48 of 48 filter cases, in both directions, including deletes, deletion vectors and schema evolution.",
      "Tables magmalake writes are read back cell-exact by both — and PyIceberg can append to a table magmalake created.",
    ],
    notYet: [
      "Compaction — rewrite_manifests",
      "Encryption",
      "Predicates inside list and map elements",
    ],
    notYetNote:
      'The spec\'s v4 drafts — relative paths and <code>content_stats</code> — are tracked but not implemented. What is proposed but unbuilt lives in <a href="https://github.com/magmalake/.github/issues" rel="noopener">the issue tracker</a>. The last spec there, <a href="https://github.com/magmalake/.github/issues/1" rel="noopener">a PostgreSQL tin</a>, shipped as postgres.mojo and put the SQL catalog on a server.',
    perfNotes: [
      {
        title: "A whole query, end to end",
        body: [
          'The rows above measure one tin at a time. <a href="https://github.com/magmalake/taxibench.example" rel="noopener">taxibench.example</a> measures the stack the way a caller uses it: eight analytical queries over <strong>79,478,796 NYC taxi trips</strong> as an Iceberg table, answered by iceberg.mojo and by PyIceberg, with every answer diffed between the two before any timing is quoted.',
          "It is also where the last few releases came from. Profiling it found four gaps — no intra-file parallelism, no metadata-only <code>count()</code>, a residual evaluated per row, and a scan that read whole files to decode four columns of nineteen — and closing them took the suite from <strong>0.70x to 1.34x</strong> the speed of PyIceberg single-threaded, and to <strong>1.68x</strong> across ten threads.",
          "The same repository also asks what a table format is worth by answering the same eight questions from PostgreSQL, and packages both stacks as container images — 521 MB for the Python one against 126 MB, or 57 MB without object storage.",
        ],
      },
    ],
  },
  {
    name: "parquet",
    short: "read · write · every encoding · Arrow out",
    pkg: "parquet-mojo",
    repo: "https://github.com/magmalake/parquet.mojo",
    benchmarks: "https://magmalake.github.io/parquet.mojo/benchmarks/",
    version: "0.11.7",
    tier: "format",
    what:
      "The first native Apache Parquet reader and writer in Mojo. It decodes the footer, the page headers, the levels and the values itself, and hands the result back in Arrow memory layout, exportable over the Arrow C Data Interface. That interface is the boundary, not a full Arrow library: there are no compute kernels, no IPC and no Flight.",
    oracle: "pyarrow, value-exact on 33 fixtures; pyarrow reads back every file it writes",
    bullets: [
      "Every physical and logical type, every encoding, v1 and v2 pages",
      "UNCOMPRESSED, SNAPPY and GZIP with no FFI; ZSTD, BROTLI and LZ4 with parquet-full",
      "Nested lists, maps and structs reconstructed from definition and repetition levels",
      "Row-group, page-index and bloom-filter pruning; field-id projection for Iceberg",
      "Arrow C Data Interface export, verified by pyarrow importing the arrays",
    ],
    evidence: [
      "Value-exact against pyarrow on 33 fixtures — every value of every column — and pyarrow reads back every file magmalake writes.",
      "The Arrow export imports through pyarrow.Array._import_from_c.",
    ],
    notYet: ["More than 2 GiB of string data in one Parquet column chunk"],
  },
  {
    name: "parquet-full",
    short: "parquet · plus ZSTD, BROTLI and LZ4",
    pkg: "parquet-full-mojo",
    repo: "https://github.com/magmalake/parquet.mojo",
    version: "0.1.8",
    tier: "format",
    what:
      "Every Parquet codec the spec defines: parquet-mojo, plus ZSTD, BROTLI and LZ4 through libzstd, libbrotli and liblz4. It lives in the full/ directory of the parquet repository and depends on parquet-mojo, so adding it gives you both, and the import is unchanged.",
    oracle: "A write and read round trip through each of the three codecs, and the ZSTD-compressed Iceberg fixtures",
    bullets: [
      "Take it unless you control the files you read: ZSTD is what most Parquet in the wild uses, Iceberg included",
      "A reader without it that meets one of these codecs raises an error naming it",
      "A consumer that never needs ZSTD never builds the three C libraries",
    ],
  },
  {
    name: "avro",
    short: "object container files, both ways",
    pkg: "avro-mojo",
    repo: "https://github.com/magmalake/avro.mojo",
    benchmarks: "https://magmalake.github.io/avro.mojo/benchmarks/",
    version: "0.4.4",
    tier: "format",
    what:
      "Pure-Mojo Apache Avro: schema parsing, the binary encoding, Object Container Files both ways, and schema resolution. No FFI: its one dependency is deflate-mojo, for the deflate codec.",
    oracle: "fastavro, both directions, across all four codecs",
    bullets: [
      "Object Container Files, read and write, null / deflate / snappy / zstandard",
      "A schema-compiled RecordCursor with no per-record allocation",
      "Iceberg field-ids and OCF metadata survive parsing intact",
    ],
  },
  {
    name: "objectstore",
    short: "local · HTTP · S3 · GCS · Azure · concurrent reads",
    pkg: "objectstore-mojo",
    repo: "https://github.com/magmalake/objectstore.mojo",
    version: "0.4.1",
    tier: "storage",
    what:
      "Storage and HTTP for Iceberg tables: a FileIO abstraction over local files, HTTP(S) range reads and S3, with the pooled HTTP transport the rest of the stack was missing.",
    oracle: "AWS SigV4 suite 37/37, and S3 verified end-to-end against MinIO in CI",
    bullets: [
      "S3 with SigV4, vended credentials, presigned URLs and multipart upload",
      "Pooled libcurl transport, so range reads reuse a connection",
      "Pure-Mojo SHA-256 and HMAC on hardware crypto paths",
      "GCS, Azure and plain HTTP range reads alongside local files",
    ],
    evidence: [
      "37 of 37 cases of the official AWS SigV4 test suite, every stage.",
      "S3 is verified end-to-end against MinIO in CI, not only on a developer's machine.",
    ],
  },
  {
    name: "sqlite",
    short: "embedded SQL · the catalog store",
    pkg: "sqlite-mojo",
    repo: "https://github.com/magmalake/sqlite.mojo",
    version: "0.3.5",
    tier: "storage",
    what:
      "An embedded SQL database: connections, prepared statements, typed columns and RAII transactions over libsqlite3. A fork of ehsanmok/sqlite, made dependency-free so it installs from the registry with no external git repos.",
    oracle: "round-tripped against the sqlite3 shell in both directions",
    bullets: [
      "INTEGER, REAL and TEXT columns, with NULL distinct from empty; BLOB columns aren't exposed",
      "Prepared statements with positional parameters, explicit transactions",
      "libsqlite3 opened once per process, not per connection",
      "Backs the SQL catalog iceberg.mojo uses for PyIceberg parity",
    ],
  },
  {
    name: "postgres",
    short: "libpq · params · COPY",
    pkg: "postgres-mojo",
    repo: "https://github.com/magmalake/postgres.mojo",
    version: "0.3.3",
    tier: "storage",
    what:
      "A PostgreSQL client over libpq: parameterized statements, typed text-format results, transactions with savepoints and COPY, every error carrying its SQLSTATE — and, in a module of its own, a connection pool for a threaded service. A fork of dvirarad/mojo-postgres, rewritten for the 1.x toolchain.",
    oracle: "psycopg 3 and psql — cell-exact, both directions",
    bullets: [
      "Every §5 type, with NULL distinct from empty and numeric kept as text",
      "PQexecParams and prepared statements — no values escaped into SQL",
      "COPY in and out at 5 M rows/s; handles co-own the connection",
      "A bounded ConnectionPool behind with pool.lease(): acquire timeouts, is_alive-checked checkout, lifetime and idle recycling, ROLLBACK on return",
      "A connection whose statement or transaction outlives its lease is closed, never handed to a second thread",
      "Tested against a throwaway cluster on every CI leg — no Docker",
    ],
  },
  {
    name: "arrow-mlake",
    short: "Arrow layout · C Data Interface · IPC",
    pkg: "arrow-mlake-mojo",
    repo: "https://github.com/magmalake/arrow-mlake.mojo",
    version: "0.2.1",
    tier: "format",
    what:
      "The Apache Arrow memory layout, the C Data Interface and IPC streams in pure Mojo, with no dependencies and no FFI. A stopgap until marrow, the community Arrow for Mojo, builds on Mojo 1.x.",
    oracle: "pyarrow imports what it exports over C, and reads and writes its IPC streams both ways",
    bullets: [
      "ArrayData and ArrayArena: flat, nested and extension types",
      "Export and import over the C Data Interface, release callbacks and all",
      "IPC stream writer and reader, with a bounds-checked FlatBuffers reader",
      "What parquet hands its batches back in",
    ],
  },
  {
    name: "roaring",
    short: "32/64-bit · deletion vectors",
    pkg: "roaring-mojo",
    repo: "https://github.com/magmalake/roaring.mojo",
    benchmarks: "https://magmalake.github.io/roaring.mojo/benchmarks/",
    version: "0.1.3",
    tier: "format",
    what:
      "Pure-Mojo Roaring bitmaps, 32- and 64-bit, implementing the portable RoaringFormatSpec serialization plus Iceberg's deletion-vector v1 blob framing.",
    oracle: "pyroaring, byte-exact in both directions",
    bullets: [
      "Bitmap32 and Bitmap64 with array, bitset and run containers",
      "Portable serialization including the 64-bit extension",
      "Iceberg deletion-vector blob framing with its own CRC-32",
      "No dependencies",
    ],
    evidence: [
      "Byte-exact against pyroaring in both directions, with pyroaring-produced payloads baked into the tests as constants so the oracle cannot drift.",
    ],
  },
  {
    name: "thrift",
    short: "compact + binary protocol",
    pkg: "thrift-mojo",
    repo: "https://github.com/magmalake/thrift.mojo",
    benchmarks: "https://magmalake.github.io/thrift.mojo/benchmarks/",
    version: "0.1.3",
    tier: "primitive",
    what:
      "Apache Thrift serialization in pure Mojo — compact and binary protocols — plus every struct, union and enum of the Parquet metadata schema, generated ahead of time.",
    oracle: "Apache Thrift itself — 13 generated wire vectors, byte-identical",
    bullets: [
      "TCompactProtocol and TBinaryProtocol behind one trait",
      "All of parquet.thrift, pre-generated",
      "Footer, page-header and page-index decode helpers",
      "No RPC, no runtime IDL, no dependencies",
    ],
    evidence: [
      "Byte-identical to Apache Thrift on generated wire vectors, in both the compact and the binary protocol.",
    ],
  },
  {
    name: "zstd",
    short: "libzstd",
    pkg: "zstd-mojo",
    repo: "https://github.com/magmalake/zstd.mojo",
    benchmarks: "https://magmalake.github.io/zstd.mojo/benchmarks/",
    version: "0.1.5",
    tier: "primitive",
    what:
      "A Mojo binding to libzstd — one-shot and streaming, both directions — through a small C shim loaded at runtime, so consumers need no link flags.",
    oracle: "Python zstandard, against independently produced frames baked in as constants",
    bullets: [
      "One-shot and streaming compress and decompress",
      "Frame introspection: is_zstd_frame, frame_content_size",
      "The shim is dlopen'd once, not per call",
    ],
  },
  {
    name: "lz4",
    short: "liblz4",
    pkg: "lz4-mojo",
    repo: "https://github.com/magmalake/lz4.mojo",
    benchmarks: "https://magmalake.github.io/lz4.mojo/benchmarks/",
    version: "0.1.4",
    tier: "primitive",
    what:
      "A Mojo binding to liblz4 covering the block format, the frame format and the legacy Hadoop framing that older Parquet files still use.",
    oracle: "CPython's lz4 package, on known vectors and round trips",
    bullets: [
      "LZ4_RAW blocks for Parquet pages",
      "LZ4F frames for Iceberg Puffin blobs",
      "Hadoop framing for legacy Parquet LZ4",
    ],
  },
  {
    name: "brotli",
    short: "libbrotli",
    pkg: "brotli-mojo",
    repo: "https://github.com/magmalake/brotli.mojo",
    benchmarks: "https://magmalake.github.io/brotli.mojo/benchmarks/",
    version: "0.1.4",
    tier: "primitive",
    what:
      "A Mojo binding to libbrotli, the last of the seven Parquet page codecs. Bound rather than written: RFC 7932 needs two prefix-code forms, context maps, block-type switching, a distance cache and a 122 KB static dictionary with 121 word transforms that are part of the format itself.",
    oracle: "CPython's brotli package, on streams it produced and this one had never seen",
    bullets: [
      "One-shot compress and decompress, quality 0–11",
      "A Brotli stream records no uncompressed size, so sized and unsized decoding are separate calls",
      "The shim is dlopen'd once, not per call",
    ],
  },
  {
    name: "snappy",
    short: "pure Mojo",
    pkg: "snappy-mojo",
    repo: "https://github.com/magmalake/snappy.mojo",
    benchmarks: "https://magmalake.github.io/snappy.mojo/benchmarks/",
    version: "0.1.4",
    tier: "primitive",
    what:
      "Snappy in pure Mojo — the raw block format and the CRC-32C-checksummed framing format. No FFI, no C dependency.",
    oracle: "Spec edge cases and round trips, and a block python-snappy produced, decoded",
    bullets: [
      "Raw block format and sNaPpY framing",
      "CRC-32C verified per chunk",
      "Pure Mojo — nothing to build, nothing to link",
    ],
  },
  {
    name: "deflate",
    short: "DEFLATE · gzip · pure Mojo",
    pkg: "deflate-mojo",
    repo: "https://github.com/magmalake/deflate.mojo",
    version: "0.1.3",
    tier: "primitive",
    what:
      "DEFLATE (RFC 1951) and gzip (RFC 1952) in pure Mojo, the compression inside Avro's deflate codec and Parquet's GZIP codec. No FFI, no libz.",
    oracle: "zlib: inflates what zlib wrote, one fixture per block type",
    bullets: [
      "inflate for stored, fixed- and dynamic-Huffman blocks",
      "deflate with a hash-chain LZ77 matcher, fixed-Huffman blocks",
      "inflate_at for back-to-back streams, as gzip members are",
      "gunzip for a whole .gz file: every member, header flags, each member's CRC-32 and size checked; gzip to write one",
    ],
  },
  {
    name: "hashes",
    short: "CRC-32 · murmur3 · XXH64",
    pkg: "hashes-mojo",
    repo: "https://github.com/magmalake/hashes.mojo",
    benchmarks: "https://magmalake.github.io/hashes.mojo/benchmarks/",
    version: "0.1.3",
    tier: "primitive",
    what:
      "The three hashes Iceberg and Parquet actually need — CRC-32, MurmurHash3 x86-32 and XXH64 — in pure Mojo, with no dependencies and no FFI.",
    oracle: "zlib, mmh3 and xxhash, plus the Iceberg spec's Appendix B vectors",
    bullets: [
      "CRC-32 for page CRCs and deletion-vector checksums",
      "MurmurHash3 for the Iceberg bucket[N] transform",
      "XXH64 for Parquet bloom filters",
      "Identical results on every platform",
    ],
  },
  {
    name: "memory-region",
    short: "bytes addressed by offset · shared mappings",
    pkg: "memory-region-mojo",
    repo: "https://github.com/magmalake/memory-region.mojo",
    version: "0.1.1",
    tier: "primitive",
    what:
      "A region of bytes, on the heap or in a shared mapping, carved by a bump allocator that returns offsets rather than pointers, so whatever is built in it reads the same in any process that maps it.",
    oracle: "A write-here, read-there round trip between two mappings in one process",
    bullets: [
      "Heap and file-backed shared regions behind one bump allocator",
      "The consumer's mapping is read-only, with checked, origin-tracked views",
      "How Arrow batches cross processes without a copy",
    ],
  },
  {
    name: "restate",
    short: "durable execution",
    pkg: "restate-mojo",
    repo: "https://github.com/magmalake/restate.mojo",
    version: "0.4.1",
    tier: "execution",
    what:
      "Durable execution in Mojo, via Restate. A Rust shim embeds the official Restate SDK — Rust owns the HTTP/2 endpoint, the event loop and the journal — while your handlers are Mojo, driven by a synchronous loop where every durable operation crosses one C-ABI call.",
    oracle:
      "Two end-to-end suites against a real restate-server booted per run, on macOS and Linux",
    bullets: [
      "State, sleep, run and awakeables from handle_* functions App.run finds by name",
      "app.serve(num_workers) runs that loop on N threads via threads-mojo's WorkerPool",
      "Self-calls need two or more workers: one worker has no second thread to run the callee",
      "Payloads are raw bytes — parse and serialize in your handler",
    ],
  },
  {
    name: "threads",
    short: "pthreads · atomics · parallel_for",
    pkg: "threads-mojo",
    repo: "https://github.com/magmalake/threads.mojo",
    version: "0.6.1",
    tier: "primitive",
    what:
      "Minimal OS threads for Mojo: spawn and join pthreads, share state through atomics and a mutex, and fan a loop out over cores with parallel_for. A stopgap, distilled from flare, until the language ships its own.",
    oracle: "Contended-count and memory-visibility proofs designed to give a wrong number, not a flake",
    bullets: [
      "parallel_for over cores — Mojo currently ships no other way to use a second one",
      "Atomics that bridge the stable/nightly std.atomic split",
      "Mutex, spawn, join and thread pinning",
      "Typed parallel_for and TypedPool: shared state held alive by origin, the void* erasure inside the library",
    ],
    perfNotes: [
      {
        title: "Threads, for now, come from a tin",
        body: [
          "Mojo's standard library currently has no threading. <code>parallelize</code> was removed and there is no thread pool reachable from user code, so every number on this site that mentions more than one core goes through threads.mojo, which wraps pthreads directly via <code>external_call</code>.",
          'It is inspired by and distilled from <a href="https://github.com/ehsanmok/flare" rel="noopener">flare</a> — Ehsan M. Kermani\'s project, MIT-licensed — which worked out how to get real OS threads out of Mojo in the first place. threads.mojo keeps the parts a data stack needs and drops the rest.',
          "It is explicitly a stopgap. When the language ships its own threading, this tin should stop existing.",
        ],
      },
    ],
  },
  {
    name: "xml",
    pkg: "xml-mojo",
    repo: "https://github.com/magmalake/xml.mojo",
    version: "0.1.0",
    tier: "utility",
    status: "source",
    short: "pull parser · path queries",
    what:
      "A small pure-Mojo XML parser for API responses (EC2, S3, Azure Blob): a pull parser, and a flat read-only tree that answers path queries. No dependencies, no FFI.",
    oracle: "Its own test suite on stable and nightly Mojo",
    bullets: [
      "Entities, numeric references, CDATA; malformed input is an error with its byte offset",
      "Paths match local names, with * and fan-out over every match",
    ],
  },
  {
    name: "lint",
    short: "mojolint · origin and threading mistakes",
    pkg: "lint-mojo",
    repo: "https://github.com/magmalake/lint.mojo",
    version: "0.1.4",
    tier: "utility",
    what:
      "mojolint, a linter for the origin and threading mistakes the Mojo compiler accepts, asking mojo-lsp-server, the compiler's own frontend, for resolved types and uses. A proof of concept.",
    oracle: "threads.example's uncaught programs flagged, and the correct ones beside them silent",
    bullets: [
      "Text mode needs nothing; --lsp uses the project's own mojo-lsp-server",
      "Run in CI by the magmalake tins",
    ],
  },
  {
    name: "k8s",
    pkg: "k8s-mojo",
    repo: "https://github.com/magmalake/k8s.mojo",
    version: "0.1.2",
    tier: "utility",
    short: "the Kubernetes API from Mojo",
    what:
      "A small Kubernetes client for Mojo: pods, jobs and services created, listed, watched and deleted, and pods' logs, in a pod with its service account or from a kubeconfig. It is what Orca uses to start a Dista cluster per run.",
    oracle: "Every call against a live kind cluster in CI",
    bullets: [
      "Manifests go in as JSON text; objects come back as json values, read with JSON pointers",
      "A kubeconfig's server, CA, client certificate and key, or a token",
      "An answer that isn't 2xx raises with the API's own message",
      "exec and auth-provider users (cloud CLIs) aren't supported: pass a token",
    ],
  },
  {
    name: "iceberg-rs",
    short: "iceberg-rust behind a C ABI",
    pkg: "iceberg-rs-mojo",
    repo: "https://github.com/magmalake/iceberg-rs.mojo",
    version: "0.1.3",
    tier: "oracle",
    what:
      "Apache Iceberg over a thin Rust cdylib wrapping iceberg-rust behind a C ABI. Superseded — no longer required for any operation — and kept only as a third independent implementation to check the native one against.",
    oracle: "PyIceberg reading through the same sqlite catalog file the binding wrote",
    bullets: [
      "56 extern \"C\" functions over one shared tokio runtime",
      "SQL/JDBC catalog against real object storage",
      "Kept as a cross-implementation oracle, not a dependency",
    ],
  },
  {
    name: "json_mlake",
    short: "simdjson-backed JSON · ehsanmok/json",
    pkg: "json_mlake",
    repo: "https://github.com/magmalake/json_mlake",
    version: "0.4.3",
    tier: "republished",
    what:
      "A packaged build of json by Ehsan M. Kermani — simdjson-backed JSON parsing for Mojo, CPU and GPU — republished only because json is not on a conda channel. The code is upstream's; it is imported as json. Stars and issues belong upstream, at github.com/ehsanmok/json.",
    oracle: "CI builds the package and consumes it from a clean project, on Linux and macOS",
    bullets: [
      "Tracks upstream v0.4.2, with one source delta: the simdjson wrapper is found without CONDA_PREFIX",
      "What k8s reads Kubernetes objects with, and what flare depends on",
      "Archived the day json is on a channel pixi can resolve",
    ],
  },
  {
    name: "flare_mlake",
    short: "TCP · TLS · HTTP/1–3 · gRPC · ehsanmok/flare",
    pkg: "flare_mlake",
    repo: "https://github.com/magmalake/flare_mlake",
    version: "0.13.2",
    tier: "republished",
    what:
      "A packaged build of flare by Ehsan M. Kermani — TCP, UDP, TLS, HTTP/1.1, HTTP/2, HTTP/3, QUIC, WebSocket and gRPC for Mojo — republished only because flare is not on a conda channel. Essentially all of the code is upstream's; it is imported as flare. Stars and issues belong upstream, at github.com/ehsanmok/flare.",
    oracle: "Upstream's gRPC, HTTP, TLS, net and crypto tests, run on the packaged build",
    bullets: [
      "Seven small source deltas, each worth sending upstream and each listed in its README",
      "HTTPS and client certificates for k8s",
      "Archived the day flare is on a channel pixi can resolve",
    ],
  },
  {
    name: "mozz_mlake",
    short: "fuzzing and property tests · ehsanmok/mozz",
    pkg: "mozz_mlake",
    repo: "https://github.com/magmalake/mozz_mlake",
    version: "0.2.2",
    tier: "republished",
    what:
      "A packaged build of mozz by Ehsan M. Kermani — pure-Mojo fuzzing and property-based testing, with shrinking — republished only because mozz is not on a conda channel. The code is upstream's; it is imported as mozz. Stars and issues belong upstream, at github.com/ehsanmok/mozz.",
    oracle: "CI builds the package and consumes it from a clean project, on Linux and macOS",
    bullets: [
      "No source changes: only the build-backend pin and the package name",
      "What flare_mlake's fuzz environment needs",
      "Archived the day mozz is on a channel pixi can resolve",
    ],
  },
];

export const tinsByTier = (tier: Tier) => tins.filter((t) => t.tier === tier);

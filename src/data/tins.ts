export type Tier = "table" | "format" | "primitive" | "oracle";

export interface Tin {
  /** Short display name, as it appears in the stack diagram. */
  name: string;
  /** The mojoshelf registry name — `shelf add <pkg>`. */
  pkg: string;
  repo: string;
  version: string;
  tier: Tier;
  /** One sentence: what it is. */
  what: string;
  /** The correctness oracle — what gates it in CI. */
  oracle: string;
  /** Short capability bullets. */
  bullets: string[];
  /** Published benchmark history, for the tins that run one in CI. */
  benchmarks?: string;
}

export const TIER_LABEL: Record<Tier, string> = {
  table: "Table format",
  format: "File formats & storage",
  primitive: "Primitives",
  oracle: "Cross-implementation oracle",
};

export const tins: Tin[] = [
  {
    name: "iceberg",
    pkg: "iceberg-mojo",
    repo: "https://github.com/magmalake/iceberg.mojo",
    version: "0.6.0",
    tier: "table",
    what:
      "Native Apache Iceberg. Read a table's metadata.json, pick a snapshot, decode its manifests, plan a scan and read the rows — then create, append, delete, overwrite and expire. No JVM, no Python, no Rust in the path.",
    oracle: "PyIceberg 0.11.1 and DuckDB 1.5.5 — cell-exact, both directions",
    bullets: [
      "Format v1–v3 reads: position and equality deletes, v3 deletion vectors, schema evolution, nested types",
      "Writes: create, fast-append, delete (copy-on-write and merge-on-read), overwrite, dynamic partition overwrite, expire_snapshots",
      "REST, filesystem and SQL catalogs — the SQL one on SQLite or PostgreSQL, PyIceberg's schema; local, HTTP, S3, GCS and Azure IO",
      "Scans 1M rows in 36 ms on one core, 11 ms across four workers",
    ],
  },
  {
    name: "parquet",
    pkg: "parquet-mojo",
    repo: "https://github.com/magmalake/parquet.mojo",
    benchmarks: "https://magmalake.github.io/parquet.mojo/benchmarks/",
    version: "0.4.0",
    tier: "format",
    what:
      "The first native Apache Parquet reader and writer in Mojo. It decodes the footer, the page headers, the levels and the values itself, and hands the result back in Arrow memory layout, exportable over the Arrow C Data Interface. That interface is the boundary, not a full Arrow library: there are no compute kernels, no IPC and no Flight.",
    oracle: "pyarrow, value-exact on 33 fixtures; pyarrow reads back every file it writes",
    bullets: [
      "Every physical and logical type, every encoding, every codec, v1 and v2 pages",
      "Nested lists, maps and structs reconstructed from definition and repetition levels",
      "Row-group, page-index and bloom-filter pruning; field-id projection for Iceberg",
      "Arrow C Data Interface export, verified by pyarrow importing the arrays",
      "Reads 1M rows in 4.7 ms on one core — 211M rows/s, 1.7× single-threaded pyarrow — and 2.35 ms on four, past threaded pyarrow",
    ],
  },
  {
    name: "avro",
    pkg: "avro-mojo",
    repo: "https://github.com/magmalake/avro.mojo",
    benchmarks: "https://magmalake.github.io/avro.mojo/benchmarks/",
    version: "0.3.1",
    tier: "format",
    what:
      "Pure-Mojo Apache Avro: schema parsing, the binary encoding, Object Container Files both ways, and schema resolution. The core has no dependencies at all — not even FFI.",
    oracle: "fastavro, both directions, across all four codecs",
    bullets: [
      "Object Container Files, read and write, null / deflate / snappy / zstandard",
      "A schema-compiled RecordCursor with no per-record allocation",
      "Iceberg field-ids and OCF metadata survive parsing intact",
      "Decodes manifest-shaped records at 18.1M/s — 10.7× fastavro",
    ],
  },
  {
    name: "objectstore",
    pkg: "objectstore-mojo",
    repo: "https://github.com/magmalake/objectstore.mojo",
    version: "0.3.0",
    tier: "format",
    what:
      "Storage and HTTP for Iceberg tables: a FileIO abstraction over local files, HTTP(S) range reads and S3, with the pooled HTTP transport the rest of the stack was missing.",
    oracle: "AWS SigV4 suite 37/37, and S3 verified end-to-end against MinIO in CI",
    bullets: [
      "S3 with SigV4, vended credentials, presigned URLs and multipart upload",
      "Pooled libcurl transport — 0.15 ms per range read on a reused connection",
      "Pure-Mojo SHA-256 and HMAC on hardware crypto paths, 2.7 GB/s",
      "GCS, Azure and plain HTTP range reads alongside local files",
    ],
  },
  {
    name: "sqlite",
    pkg: "sqlite-mojo",
    repo: "https://github.com/magmalake/sqlite.mojo",
    version: "0.3.1",
    tier: "format",
    what:
      "An embedded SQL database: connections, prepared statements, typed columns and RAII transactions over libsqlite3. A fork of ehsanmok/sqlite, made dependency-free so it installs from the registry with no external git repos.",
    oracle: "round-tripped against the sqlite3 shell in both directions",
    bullets: [
      "Every column type, with NULL distinct from empty",
      "Prepared statements, named parameters, explicit transactions",
      "libsqlite3 opened once per process, not per connection",
      "Backs the SQL catalog iceberg.mojo uses for PyIceberg parity",
    ],
  },
  {
    name: "postgres",
    pkg: "postgres-mojo",
    repo: "https://github.com/magmalake/postgres.mojo",
    version: "0.2.0",
    tier: "format",
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
    name: "roaring",
    pkg: "roaring-mojo",
    repo: "https://github.com/magmalake/roaring.mojo",
    benchmarks: "https://magmalake.github.io/roaring.mojo/benchmarks/",
    version: "0.1.0",
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
  },
  {
    name: "thrift",
    pkg: "thrift-mojo",
    repo: "https://github.com/magmalake/thrift.mojo",
    benchmarks: "https://magmalake.github.io/thrift.mojo/benchmarks/",
    version: "0.1.0",
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
  },
  {
    name: "zstd",
    pkg: "zstd-mojo",
    repo: "https://github.com/magmalake/zstd.mojo",
    benchmarks: "https://magmalake.github.io/zstd.mojo/benchmarks/",
    version: "0.1.1",
    tier: "primitive",
    what:
      "A Mojo binding to libzstd — one-shot and streaming, both directions — through a small C shim loaded at runtime, so consumers need no link flags.",
    oracle: "Python zstandard, against independently produced frames baked in as constants",
    bullets: [
      "One-shot and streaming compress and decompress",
      "Frame introspection: is_zstd_frame, frame_content_size",
      "The shim is dlopen'd once, not per call",
      "10–14 GB/s decompress",
    ],
  },
  {
    name: "lz4",
    pkg: "lz4-mojo",
    repo: "https://github.com/magmalake/lz4.mojo",
    benchmarks: "https://magmalake.github.io/lz4.mojo/benchmarks/",
    version: "0.1.1",
    tier: "primitive",
    what:
      "A Mojo binding to liblz4 covering the block format, the frame format and the legacy Hadoop framing that older Parquet files still use.",
    oracle: "CPython's lz4 package, on known vectors and round trips",
    bullets: [
      "LZ4_RAW blocks for Parquet pages",
      "LZ4F frames for Iceberg Puffin blobs",
      "Hadoop framing for legacy Parquet LZ4",
      "8–19 GB/s",
    ],
  },
  {
    name: "brotli",
    pkg: "brotli-mojo",
    repo: "https://github.com/magmalake/brotli.mojo",
    benchmarks: "https://magmalake.github.io/brotli.mojo/benchmarks/",
    version: "0.1.0",
    tier: "primitive",
    what:
      "A Mojo binding to libbrotli, the last of the seven Parquet page codecs. Bound rather than written: RFC 7932 needs two prefix-code forms, context maps, block-type switching, a distance cache and a 122 KB static dictionary with 121 word transforms that are part of the format itself.",
    oracle: "CPython's brotli package, on streams it produced and this one had never seen",
    bullets: [
      "One-shot compress and decompress, quality 0–11",
      "A Brotli stream records no uncompressed size, so sized and unsized decoding are separate calls",
      "The shim is dlopen'd once, not per call",
      "2.5 GB/s decompress",
    ],
  },
  {
    name: "snappy",
    pkg: "snappy-mojo",
    repo: "https://github.com/magmalake/snappy.mojo",
    benchmarks: "https://magmalake.github.io/snappy.mojo/benchmarks/",
    version: "0.1.1",
    tier: "primitive",
    what:
      "Snappy in pure Mojo — the raw block format and the CRC-32C-checksummed framing format. No FFI, no C dependency.",
    oracle: "python-snappy, byte-exact",
    bullets: [
      "Raw block format and sNaPpY framing",
      "CRC-32C verified per chunk",
      "Pure Mojo — nothing to build, nothing to link",
      "Up to 20 GB/s incompressible, ~3 GB/s compressible",
    ],
  },
  {
    name: "hashes",
    pkg: "hashes-mojo",
    repo: "https://github.com/magmalake/hashes.mojo",
    benchmarks: "https://magmalake.github.io/hashes.mojo/benchmarks/",
    version: "0.1.0",
    tier: "primitive",
    what:
      "The three hashes Iceberg and Parquet actually need — CRC-32, MurmurHash3 x86-32 and XXH64 — in pure Mojo, with no dependencies and no FFI.",
    oracle: "zlib, mmh3 and xxhash, plus the Iceberg spec's Appendix B vectors",
    bullets: [
      "CRC-32 for page CRCs and deletion-vector checksums",
      "MurmurHash3 for the Iceberg bucket[N] transform",
      "XXH64 for Parquet bloom filters",
      "1.2–1.5 GB/s, identical results on every platform",
    ],
  },
  {
    name: "restate",
    pkg: "restate-mojo",
    repo: "https://github.com/magmalake/restate.mojo",
    version: "0.3.2",
    tier: "primitive",
    what:
      "Durable execution in Mojo, via Restate. A Rust shim embeds the official Restate SDK — Rust owns the HTTP/2 endpoint, the event loop and the journal — while your handlers are Mojo, driven by a synchronous loop where every durable operation crosses one C-ABI call.",
    oracle:
      "Two end-to-end suites against a real restate-server booted per run, on macOS and Linux",
    bullets: [
      "State, sleep, run and awakeables from a plain next() loop",
      "app.serve(num_workers) runs that loop on N threads via threads-mojo's WorkerPool",
      "Self-calls need two or more workers: one worker has no second thread to run the callee",
      "Payloads are raw bytes — parse and serialize in your handler",
    ],
  },
  {
    name: "threads",
    pkg: "threads-mojo",
    repo: "https://github.com/magmalake/threads.mojo",
    version: "0.4.0",
    tier: "primitive",
    what:
      "Minimal OS threads for Mojo: spawn and join pthreads, share state through atomics and a mutex, and fan a loop out over cores with parallel_for. A stopgap, distilled from flare, until the language ships its own.",
    oracle: "Contended-count and memory-visibility proofs designed to give a wrong number, not a flake",
    bullets: [
      "parallel_for over cores — Mojo currently ships no other way to use a second one",
      "Atomics that bridge the stable/nightly std.atomic split",
      "Mutex, spawn, join and thread pinning",
      "Spawn and join in 14 µs; parallel_for scales ~4×",
      "Typed parallel_for and TypedPool: shared state held alive by origin, the void* erasure inside the library",
    ],
  },
  {
    name: "iceberg-rs",
    pkg: "iceberg-rs-mojo",
    repo: "https://github.com/magmalake/iceberg-rs.mojo",
    version: "0.1.0",
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
];

export const tinsByTier = (tier: Tier) => tins.filter((t) => t.tier === tier);

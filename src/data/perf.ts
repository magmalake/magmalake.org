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
 * Apple M4, single core unless the row says otherwise. Every number is
 * reproducible from the owning repo with `pixi run bench`.
 */
export const perfGroups: Group[] = [
  {
    id: "table",
    title: "Table and file formats",
    blurb:
      "Parquet decode is where the native stack pays off; writes and thread-pooled scans are where it does not, yet.",
    rows: [
      {
        op: "Parquet read, 1M rows",
        note: "int64 / double / dictionary",
        result: "4.3 ms — 232M rows/s",
        lead: true,
        reference: "pyarrow 8.2 ms — 1.9× faster",
      },
      {
        op: "Parquet read, 4 cores",
        note: "threads.parallel_for over row groups",
        result: "660M rows/s",
        lead: true,
        reference: "memory-bandwidth bound",
      },
      {
        op: "Parquet write, 1M rows",
        result: "42 ms",
        reference: "pyarrow 31 ms — slower",
      },
      {
        op: "Parquet footer",
        note: "1,000 columns × 50 row groups",
        result: "78 ms read / 8 ms write",
      },
      {
        op: "Iceberg scan, 1M rows",
        note: "zstd-compressed",
        result: "35.8 ms — 12.1 ms on 4 workers",
        reference:
          "pyarrow single-thread 26.8 ms on the same files; PyIceberg 7.9 ms using its thread pool",
      },
      {
        op: "Iceberg append, 1M rows",
        note: "data files, manifests and commit",
        result: "233 ms",
        reference: "PyIceberg ~150 ms",
      },
      {
        op: "Iceberg scan planning, 500 manifests",
        note: "31.9 µs fixed cost per manifest, 11.5 µs of it the file-read floor",
        result: "21.4 ms",
        reference: "62.3 ms before the schema and plan cache",
      },
      {
        op: "Avro decode, manifest-shaped records",
        result: "19.2M records/s — 27.5M with field selection",
        lead: true,
        reference: "fastavro 1.74M — 11–13× faster",
      },
      { op: "Avro inflate", result: "860 MB/s" },
    ],
  },
  {
    id: "primitives",
    title: "Primitives",
    blurb:
      "Codecs, hashes and threads — the layer everything above is only as fast as.",
    rows: [
      {
        op: "SHA-256",
        note: "pure Mojo with ARMv8 crypto / SHA-NI intrinsics",
        result: "2.7 GB/s — 610 MB/s scalar fallback",
        lead: true,
        reference: "OpenSSL 3.2 GB/s",
      },
      {
        op: "zstd / lz4 decompress",
        note: "FFI",
        result: "10–14 GB/s / 8–19 GB/s",
      },
      {
        op: "snappy decompress",
        note: "pure Mojo",
        result: "up to 20 GB/s incompressible, ~3 GB/s compressible",
      },
      {
        op: "CRC-32 / murmur3 / XXH64",
        note: "pure Mojo",
        result: "1.2–1.5 GB/s",
      },
      {
        op: "threads: spawn and join",
        result: "14 µs — parallel_for scales ~4×",
        reference: "memory-bandwidth ceiling",
      },
    ],
  },
  {
    id: "io",
    title: "Object storage",
    blurb: "Measured against MinIO on the same machine, so the network is not the story.",
    rows: [
      {
        op: "S3 multipart upload, 16 MB",
        result: "409 MB/s",
        lead: true,
        reference: "53 MB/s when payload hashing was still scalar",
      },
      {
        op: "HTTP range read, pooled connection",
        result: "0.15 ms local / 0.52 ms signed S3",
        reference: "19× / 11× faster than a fresh connection per request",
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
    fix: "Caching the parsed schema and the plan cut scan planning from 62.3 ms to 21.4 ms.",
  },
];

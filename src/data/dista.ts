// dista: the distributed-tasks runtime for Mojo. Every number on the
// /s/dista pages comes from here, and every one of them from a results folder
// in dista.mojo's bench/cloud/results/ (named in `source`), so updating a run
// is an edit to this file.

export const DISTA_REPO = "https://github.com/magmalake/dista.mojo";
export const RESULTS = `${DISTA_REPO}/tree/main/bench/cloud/results`;

export const setup = {
  date: "1 November 2026",
  machine: "AWS c7g.4xlarge (16 Graviton3 vCPUs, 32 GiB), us-east-2, k3s",
  slots: 16,
  table:
    "NYC yellow taxi trips 2011–2024 as an Iceberg table in S3: 1,438,321,685 rows in 416 Parquet files (19.5 GB), written by 168 appends",
  queries: "the eight taxibench queries: scans, filters, sums and group-bys by zone",
};

export type Row = { label: string; values: (number | null)[]; note?: string };
export type Table = {
  id: string;
  title: string;
  columns: string[];
  unit: string;
  rows: Row[];
  source: string;
  caption: string;
};

/** The headline: 3 nodes, distributed, after the read path. */
export const headline = {
  dista: 12.0,
  rust: 28.7,
  ray: 38.6,
  before: 56.7,
};

export const distributed: Table = {
  id: "distributed",
  title: "Distributed, 3 nodes",
  columns: ["dista, before", "dista", "Rust", "Ray"],
  unit: "ms, median of 2 passes",
  source: "gate-2026-11-01-readpath",
  caption:
    "Three worker nodes, 16 task slots each, one task per data file. “Before” is the same gate run hours earlier, before the S3 read path was rewritten. Every answer matches across the three frameworks: row counts exactly, sums to floating-point rounding.",
  rows: [
    { label: "q1_scan_count", values: [10427, 2439, 6630, 6822] },
    { label: "q2_month_range", values: [498, 220, 617, 748] },
    { label: "q3_payment_sum", values: [9628, 1723, 5269, 6274] },
    { label: "q4_tip_ratio", values: [11292, 2072, 5014, 7684] },
    { label: "q5_top_zones", values: [10578, 1889, 4426, 6344] },
    { label: "q6_zone_revenue", values: [912, 251, 616, 896] },
    { label: "q7_wide", values: [1216, 1122, 1150, 1281] },
    { label: "q8_selective", values: [12139, 2293, 5022, 8520] },
    { label: "total", values: [56690, 12008, 28744, 38570] },
  ],
};

export const matrix: Table = {
  id: "scaling",
  title: "Distributed, 3, 6 and 12 nodes",
  columns: ["dista", "Rust", "Ray"],
  unit: "ms, median of 5 passes",
  source: "matrix-2026-11-01",
  caption:
    "The same queries on 3, 6 and 12 worker nodes, after the read path; answers identical across every run. Two changes since, measured on 12 nodes: dista's driver keeps one manifest cache across queries (iceberg-rust's object cache does the same), and a query planning fewer than 64 files has its files split at row-group boundaries, so the wide query's one file runs as four tasks. The Rust and Ray benchmarks don't split files. Ray's 12-node result moves by up to 50% between runs.",
  rows: [
    { label: "3 nodes", values: [11040, 18377, 21275] },
    { label: "6 nodes", values: [7184, 10267, 12737] },
    { label: "12 nodes", values: [5941, 6682, 15703] },
    { label: "12 nodes, manifest cache", values: [4446, 6745, 9955] },
    { label: "12 nodes, + row-group splitting", values: [3751, 6691, 15395] },
  ],
};

export const earlierMatrix: Table = {
  id: "matrix",
  title: "Distributed, 3 and 6 nodes, before the read path",
  columns: ["dista", "Rust", "Ray"],
  unit: "ms, median of 5 passes",
  source: "2026-11",
  caption:
    "The first matrix, before the read path. dista was the slowest of the three here. A 12-node dista run failed its answer check then (fixed since); the table above has the 12-node runs.",
  rows: [
    { label: "3 nodes", values: [53548, 21966, 30140] },
    { label: "6 nodes", values: [35613, 10264, 16140] },
  ],
};

export const singleThreads: Table = {
  id: "single-16",
  title: "One process, 16 threads",
  columns: ["dista", "Rust", "Ray (PyIceberg + pyarrow)"],
  unit: "ms, the eight queries",
  source: "local-2026-11-01",
  caption:
    "The head node alone, no workers, every framework on its 16 cores: dista's scan with 16 workers, Rust's multi-threaded tokio runtime with one task per core, pyarrow's default thread pools. Answers identical across the three. Before this run, dista's integer column copies got about 4× faster (q5 26.8 → 15.3 s), and the Rust benchmark was fixed to decode on every core rather than on the one task polling iceberg-rust's stream (195 → 96 s). Rust's row is from local-2026-11-01-2, a re-run.",
  rows: [
    { label: "q1_scan_count", values: [7828, 15597, 9192] },
    { label: "q2_month_range", values: [315, 830, 446] },
    { label: "q3_payment_sum", values: [9229, 18365, 14937] },
    { label: "q4_tip_ratio", values: [10663, 18360, 22689] },
    { label: "q5_top_zones", values: [15309, 19907, 16625] },
    { label: "q6_zone_revenue", values: [747, 919, 1233] },
    { label: "q7_wide", values: [888, 1026, 706] },
    { label: "q8_selective", values: [11401, 21229, 28676] },
    { label: "total", values: [56380, 96233, 94504] },
  ],
};

export const singleThread: Table = {
  id: "single-1",
  title: "One process, one thread, 8 files' reads in flight",
  columns: ["dista", "Rust", "Ray (PyIceberg + pyarrow)"],
  unit: "ms, the eight queries",
  source: "local-2026-11-01",
  caption:
    "One decoding thread each, with the best settings that allows: up to 8 files' reads in flight (dista's files_at_once, with the next files fetched on a second thread while one decodes; iceberg-rust's concurrency limits on a current-thread runtime; pyarrow's I/O pool next to one CPU thread). dista is level with Rust and 15% behind Ray; overlapping the fetch helped only 8%, so what's left is decode speed on one core. Reading one file at a time instead, Rust took 1,384 s and Ray 1,306 s.",
  rows: [
    { label: "q1_scan_count", values: [28022, 34318, 17537] },
    { label: "q2_month_range", values: [391, 834, 533] },
    { label: "q3_payment_sum", values: [38329, 39690, 29969] },
    { label: "q4_tip_ratio", values: [50365, 42206, 44095] },
    { label: "q5_top_zones", values: [41525, 46057, 31709] },
    { label: "q6_zone_revenue", values: [1718, 1696, 1945] },
    { label: "q7_wide", values: [1132, 1097, 1211] },
    { label: "q8_selective", values: [50405, 42443, 57328] },
    { label: "total", values: [211887, 208341, 184327] },
  ],
};

export const timeline = {
  source: "gate-2026-11-01-readpath",
  rows: [
    { label: "A file task, median", before: "691 ms", after: "177 ms" },
    { label: "A file task, p90", before: "–", after: "243 ms" },
    { label: "Planning one query", before: "~4,000 ms", after: "295 ms" },
    { label: "Submitting a query's 416 tasks", before: "800–1,100 ms", after: "3 ms" },
  ],
  requests: [
    { label: "Table metadata (133 KB, 168 snapshots)", before: "1", after: "0, sent with the task" },
    { label: "Footer", before: "2: trailer, then footer", after: "1: a 512 KiB tail" },
    { label: "Column chunks, 4 row groups", before: "4, one after another", after: "4 at once" },
  ],
};

export const images = {
  source: "gate-2026-11-01-readpath",
  rows: [
    { label: "dista", build: 122, deps: 35.1, compile: 54.0, unpacked: 93, gzip: 32 },
    { label: "Rust", build: 170, deps: 93.4, compile: 57.9, unpacked: 132, gzip: 41 },
    { label: "Ray", build: 44, deps: 17.5, compile: null, unpacked: 607, gzip: 204 },
  ],
};

export const runtime = [
  {
    label: "Tasks through one head",
    value: "about 160,000 a second",
    note: "empty tasks, flat from 4 to 192 workers (bench/fanout.mojo, local)",
  },
  {
    label: "Actor calls",
    value: "1,000 ordered calls in about 22 ms",
    note: "one counter actor, local",
  },
  {
    label: "The 3-node AWS gate",
    value: "about 13 minutes, about $1.50",
    note: "a head and 3 workers: builds, three frameworks, two passes, teardown",
  },
];

export const worksToday = [
  "Tasks: a top-level Mojo function, declared once, called with rt.remote",
  "Results that stay on the worker that computed them, mapped from shared memory on the same host or fetched from that worker directly",
  "Tasks on other tasks' results: one ObjectRef, or a list gathered into a Seq",
  "Arrow record batches as task arguments and results",
  "Freeing: reference counts at the head, rt.release",
  "A head that restarts: workers rejoin with what they hold, drivers resume where they were",
  "Actors: stateful structs on a worker of their own, calls in order",
  "A task timeline in Chrome's trace format, the driver's own work included",
  "One container image for every role, 32 MB compressed, on Kubernetes",
];

export const notYet = [
  "Actors surviving a worker or head restart (restart, then checkpoints, are next)",
  "Actor handles passed to tasks and other actors",
  "Several results from one task, and refs inside arguments: what a shuffle needs",
  "Placement by data location, and spilling to disk",
  "Prometheus metrics and a cluster command (dista status, dista timeline)",
  "A published package: dista builds from source today",
];

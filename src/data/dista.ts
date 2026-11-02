// Dista: the distributed-tasks runtime for Mojo. Every number on the
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
  columns: ["Dista", "Rust", "Ray"],
  unit: "ms, median of 2 passes",
  source: "gate-2026-11-01-readpath",
  caption:
    "Three worker nodes, 16 task slots each, one task per data file. Every answer matches across the three frameworks: row counts exactly, sums to floating-point rounding.",
  rows: [
    { label: "q1_scan_count", values: [2439, 6630, 6822] },
    { label: "q2_month_range", values: [220, 617, 748] },
    { label: "q3_payment_sum", values: [1723, 5269, 6274] },
    { label: "q4_tip_ratio", values: [2072, 5014, 7684] },
    { label: "q5_top_zones", values: [1889, 4426, 6344] },
    { label: "q6_zone_revenue", values: [251, 616, 896] },
    { label: "q7_wide", values: [1122, 1150, 1281] },
    { label: "q8_selective", values: [2293, 5022, 8520] },
    { label: "total", values: [12008, 28744, 38570] },
  ],
};

export const matrix: Table = {
  id: "scaling",
  title: "Distributed, 3, 6 and 12 nodes",
  columns: ["Dista", "Rust", "Ray"],
  unit: "ms, median of 5 passes",
  source: "matrix-2026-11-01",
  caption:
    "The eight queries' total on 3, 6 and 12 worker nodes; answers identical across every run. On 12 nodes, each framework's best of three runs: Ray's moves by up to 50% between runs.",
  rows: [
    { label: "3 nodes", values: [11040, 18377, 21275] },
    { label: "6 nodes", values: [7184, 10267, 12737] },
    { label: "12 nodes", values: [3751, 6682, 9955] },
  ],
};

export const singleThreads: Table = {
  id: "single-16",
  title: "One process, 16 threads",
  columns: ["Dista", "Rust", "Ray (PyIceberg + pyarrow)"],
  unit: "ms, the eight queries",
  source: "local-2026-11-01",
  caption:
    "The head node alone, no workers, every framework on its 16 cores: Dista's scan with 16 workers, Rust's multi-threaded tokio runtime with one task per core, pyarrow's default thread pools. Answers identical across the three. Rust's numbers are from local-2026-11-01-2, a re-run.",
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
  columns: ["Dista", "Rust", "Ray (PyIceberg + pyarrow)"],
  unit: "ms, the eight queries",
  source: "local-2026-11-01",
  caption:
    "One decoding thread each, with up to 8 files' reads in flight: Dista's files_at_once, iceberg-rust's concurrency limits on a current-thread runtime, pyarrow's I/O pool next to one CPU thread. Dista is level with Rust and 15% behind Ray; what's left is decode speed on one core.",
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

/** The second benchmark: a group-by whose time goes to user code and the shuffle. */
export const shuffle = {
  date: "2 November 2026",
  query:
    "every trip grouped by pickup zone, dropoff zone and hour of day (1,044,000 groups), each group adding up its trips, speeds, tip ratios and fares",
  groups: 1044000,
  trips: 1422958681,
  spec: `${DISTA_REPO}/blob/main/bench/shuffle/README.md`,
};

export const shuffleMatrix: Table = {
  id: "shuffle-scaling",
  title: "The shuffle, distributed on 3, 6 and 12 nodes",
  columns: ["Dista", "Ray"],
  unit: "ms, median of 5 passes",
  source: "shuffle-matrix-2026-11-02",
  caption:
    "One map task per data file, which splits its groups into one partition per reducer; one reducer per task slot, so 48, 96 and 192 reducers, each taking its partition from all 416 map tasks. Both get slower from 6 nodes to 12, where 192 reducers make about 80,000 partitions; fewer reducers is the next thing to try. Every answer matches both one-process references: groups and trips exactly, sums to about 1e-13.",
  rows: [
    { label: "3 nodes", values: [8462, 14169] },
    { label: "6 nodes", values: [5139, 10955] },
    { label: "12 nodes", values: [7282, 11439] },
  ],
};

export const shuffleSingle: Table = {
  id: "shuffle-single",
  title: "The shuffle, one process",
  columns: ["Dista", "Ray (PyIceberg + NumPy)"],
  unit: "ms",
  source: "shuffle-local-2026-11-02",
  caption:
    "The head node alone. Ray wins on one thread. Dista's per-row loop has since been made faster (dista#58, in review) and will be measured here next. On 16 threads Dista is only 1.6× faster than on one, because one thread did every batch's per-row work while sixteen decoded. Ray's 16-thread run failed twice: Kubernetes' API server, on the same node, stopped answering while Ray used all 16 cores.",
  rows: [
    { label: "16 threads", values: [126383, null] },
    { label: "1 thread", values: [202154, 115680] },
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
    { label: "Dista", build: 122, deps: 35.1, compile: 54.0, unpacked: 93, gzip: 32 },
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
  "Actors: stateful structs on a worker of their own, calls in order, handles passed to tasks and other actors",
  "Actors that survive their worker or the head restarting, restored from checkpoints in a directory or S3",
  "Shuffles: several results from one task, and a task taking a value beside other tasks' results; a shuffle benchmark against Ray",
  "A task timeline in Chrome's trace format, the driver's own work included",
  "Prometheus metrics on the head and every worker",
  "The dista command: one head for several programs; dista status, timeline and stop",
  "One container image for every role, 32 MB compressed, on Kubernetes",
];

export const notYet = [
  "Refs nested anywhere inside a task's argument",
  "Placement by data location, and spilling to disk",
  "A published package: Dista builds from source today",
];

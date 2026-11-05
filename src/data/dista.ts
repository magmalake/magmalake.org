// Dista: the distributed-tasks runtime for Mojo. Every number on the
// /s/dista pages comes from here, and every one of them from a results folder
// in dista.mojo's bench/cloud/results/ (named in `source`), so updating a run
// is an edit to this file.

export const DISTA_REPO = "https://github.com/magmalake/dista.mojo";

/** The section's pages, in its header and (after the first) its footer. The
 * docs' own pages are reached from the strip atop every docs page. */
export const distaLinks = [
  { href: "/s/dista", label: "Overview" },
  { href: "/s/dista/docs", label: "Docs" },
  { href: "/s/dista/performance", label: "Performance" },
];

/** The docs' pages, in reading order: the strip atop each and its pager. */
export const distaDocs = [
  { href: "/s/dista/docs", label: "Start", title: "Using Dista" },
  { href: "/s/dista/docs/tasks", label: "Tasks", title: "Tasks and results" },
  { href: "/s/dista/docs/shuffles", label: "Shuffles", title: "Shuffles" },
  { href: "/s/dista/docs/actors", label: "Actors", title: "Actors and checkpoints" },
  { href: "/s/dista/docs/cluster", label: "Cluster", title: "Running a cluster" },
  { href: "/s/dista/docs/cli", label: "CLI", title: "The dista command" },
  { href: "/s/dista/docs/failures", label: "Failures", title: "Failure and recovery" },
  { href: "/s/dista/docs/tuning", label: "Tuning", title: "Tuning" },
];
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
  /** Each query, under the rows, when the rows aren't queries themselves. */
  detail?: Row[];
  source: string;
  /** A second results folder the table draws on. */
  also?: string;
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
  unit: "ms, the eight queries, median pass",
  source: "matrix-2026-11-01",
  also: "gate-2026-11-01-readpath",
  caption:
    "Three worker nodes, 16 task slots each, one task per data file, in two runs on separate clusters the same day. With 2 passes the median is the mean of both, so the slow first pass counts in it, and Rust and Ray lose more on that pass than Dista; with 5 the median is a warm pass. Even warm, Rust and Ray were slower on the first cluster: the clusters' own variation. Each query is from the 5-pass run. Every answer matches across the three frameworks: row counts exactly, sums to floating-point rounding.",
  rows: [
    { label: "2 passes", values: [12008, 28744, 38570] },
    { label: "5 passes", values: [11040, 18377, 21275] },
  ],
  detail: [
    { label: "q1_scan_count", values: [1981, 2306, 4128] },
    { label: "q2_month_range", values: [157, 429, 409] },
    { label: "q3_payment_sum", values: [1599, 3347, 4168] },
    { label: "q4_tip_ratio", values: [1980, 3538, 3528] },
    { label: "q5_top_zones", values: [1889, 3481, 3483] },
    { label: "q6_zone_revenue", values: [247, 468, 493] },
    { label: "q7_wide", values: [1001, 1074, 1219] },
    { label: "q8_selective", values: [2169, 3756, 3603] },
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
  unit: "ms, median of passes",
  source: "shuffle-matrix-2026-11-02-2",
  caption:
    "One map task per data file, which splits its groups into one partition per reducer; one reducer per task slot, up to 96. More reducers made Dista about twice as slow, since 416 map tasks then make tens of thousands of partitions; Ray's best on 12 nodes, with 48 reducers, is 9,644 ms. The 12-node row is from shuffle-reducers-2026-11-02. Every answer matches both one-process references: groups and trips exactly, sums to about 1e-13.",
  rows: [
    { label: "3 nodes", values: [6291, 14537] },
    { label: "6 nodes", values: [3795, 11407] },
    { label: "12 nodes", values: [3976, 10570] },
  ],
};

export const shuffleSingle: Table = {
  id: "shuffle-single",
  title: "The shuffle, one process",
  columns: ["Dista", "Ray (PyIceberg + NumPy)"],
  unit: "ms",
  source: "shuffle-local-2026-11-02-3",
  caption:
    "The head node alone. Each Dista thread reads whole files into arrays of its own, added up at the end. Ray's time barely moves with threads: its decoding uses them, but its per-batch NumPy work runs on one. Ray's 16- and 12-thread runs failed, likely from memory pressure on the head node, which also runs Kubernetes.",
  rows: [
    { label: "16 threads", values: [15897, null] },
    { label: "8 threads", values: [26650, 114993] },
    { label: "1 thread", values: [105656, 112448] },
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
  "Tasks: a top-level Mojo function, declared once, called with rt.remote; Task2 and Task3 for two or three arguments",
  "Results that stay on the worker that computed them, mapped from shared memory on the same host or fetched from that worker directly",
  "Tasks on other tasks' results: one ObjectRef, or a list gathered into a Seq",
  "Placement by data location: a task goes to the node holding most of its input, when one does",
  "Tasks whose worker dies run again on another, up to DISTA_TASK_RETRIES times",
  "Draining: a worker that Kubernetes stops finishes its tasks, and its results and its actor move to other workers, so nothing fails or runs twice",
  "Spilling: past DISTA_STORE_BYTES, a worker's results go to disk, and readers find them there",
  "Backpressure: with too much queued, rt.remote waits for the workers to catch up",
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
  "A published package: pixi shelf add dista-mojo",
];

export const notYet = [
  "Refs nested inside a struct or list in a task's argument, which is a compile error for now (deferred, issue 68)",
  "Rebuilding results lost with a worker, as Ray's lineage does: the job fails, naming them, and orca runs it again (deferred, issue 69)",
  "A running job asking for more workers: orca sizes each run's cluster (deferred, issue 76)",
];

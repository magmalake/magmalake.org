// orca: orchestration for Mojo data pipelines. What the /s/orca pages say
// about its state comes from here, and all of it from orca.mojo's VISION.md,
// DESIGN.md and its pull requests, so moving a phase or a PR along is an edit
// to this file.

export const ORCA_REPO = "https://github.com/magmalake/orca.mojo";
export const ORCA_PRS = `${ORCA_REPO}/pull`;
export const DISTA_SECTION = "/s/dista";

export const asOf = "1 November 2026";

export type PrState = "merged" | "review" | "planned";
export type Pr = { n: number; title: string; gate: string; state: PrState; pr?: number };

/** Phase 1, as DESIGN.md splits it into pull requests. */
export const phase1Prs: Pr[] = [
  {
    n: 1,
    title: "The design",
    gate: "Agreed.",
    state: "merged",
    pr: 1,
  },
  {
    n: 2,
    title: "Steps and pipelines: compile-time edges, describe, an in-memory run",
    gate: "A three-step pipeline runs over three partitions in order; the compile-fail tests are rejected.",
    state: "merged",
    pr: 2,
  },
  {
    n: 3,
    title: "State in Postgres: runs, steps and attempts, heartbeats, run, resume and status",
    gate: "tests/kill.sh on the toy pipeline: killed at a random step, resumed, every step ran to success exactly once.",
    state: "merged",
    pr: 3,
  },
  {
    n: 4,
    title: "Pinned reads and recognised commits over Iceberg tables",
    gate: "A step killed right after its commit, then resumed, leaves one snapshot, not two; a resumed step reads its pinned snapshot after another commit lands.",
    state: "merged",
    pr: 4,
  },
  {
    n: 5,
    title: "dista inside steps, per-attempt logs and the run's timeline",
    gate: "A step fans 100 dista tasks over 4 workers; each attempt's log is where status says.",
    state: "review",
    pr: 5,
  },
  {
    n: 6,
    title: "The taxi pipeline: download, load and compact each month of NYC taxi trips",
    gate: "2023–2024 loads to 79,478,796 rows, the same as taxibench's table, and a run killed during the load resumes at the failed month.",
    state: "planned",
  },
];

/** Alongside the design's PRs: testing that isn't one of them. */
export const testingPr = {
  pr: 6,
  title: "Fuzzing and chaos testing, as dista does",
  body: [
    "Fuzzing with mozz: month lists, step inputs read back from Postgres, JSON quoting, and matching a snapshot's orca.* summary against a reference.",
    "Chaos: a run driven to the end through kill -9s, immediate Postgres restarts, two resumes racing and flaky steps, then checked: every step succeeded by exactly one attempt, no two owners overlapping, the same total as an uninterrupted run. 25 seeds pass locally, 3 run in CI.",
  ],
  found: [
    "A summary missing a key matched an empty value (a gather step's partition). Matching now requires every key.",
    "With synchronous_commit=off, an immediate Postgres restart loses commits it had acknowledged: a run's row vanished. A deployment must keep it on.",
  ],
};

export type Phase = {
  n: number;
  title: string;
  status: "in progress" | "planned";
  summary: string;
  gate: string;
  items: string[];
};

export const phases: Phase[] = [
  {
    n: 1,
    title: "DAGs and runs",
    status: "in progress",
    summary:
      "Declare steps and the datasets between them; run a DAG once, locally, in dependency order, with a dista runtime per run; record runs and steps in Postgres.",
    gate: "The taxi load runs as a DAG (download, per-month load, compaction), and a run killed halfway resumes at the step that failed.",
    items: [],
  },
  {
    n: 2,
    title: "Schedules and partitions",
    status: "planned",
    summary: "Cron schedules, monthly and daily partitions, backfills, retries with backoff.",
    gate: "A schedule fills each month's partition as it falls due, and a backfill over 2011–2024 runs with a bounded number at once.",
    items: [
      "Partition definitions on the pipeline: Monthly(start=\"2011-01\") or Daily(...)",
      "Five-field cron expressions with a time zone, read from the system's TZif files",
      "A separate, generic orca scheduler binary that knows pipelines by their describe output and starts runs as subprocesses",
      "Backfills as one run per partition, started max_runs at a time",
      "Missed fires caught up once each; catchup=False to skip them",
      "Several partitions at once within a run (max_parallel), moved here from phase 1",
    ],
  },
  {
    n: 3,
    title: "The UI",
    status: "planned",
    summary:
      "Pipelines, runs, steps, logs and the dista timeline, served by flare; start, rerun and backfill from the browser.",
    gate: "A failed step is found, its logs read and the run resumed, without a terminal.",
    items: [
      "Server-rendered HTML from flare with a little JavaScript, and the same paths as JSON for the command line",
      "The DAG drawn server-side as SVG; the dista timeline linked for Perfetto",
      "Start, resume, rerun from a step, backfill a range, cancel",
      "No authentication: one team, bound to localhost unless told otherwise",
    ],
  },
  {
    n: 4,
    title: "Lineage and sensors",
    status: "planned",
    summary:
      "Queries and a graph over the reads and commits orca already records; runs triggered by a new upstream snapshot.",
    gate: "Committing a new snapshot to a source table rebuilds exactly the tables downstream of it.",
    items: [
      "Datasets declared on steps (reads=, writes=), checked when a step touches a table",
      "From a table's snapshot back to the run, the code and the inputs; from a table forward to what was built from it",
      "Sensors that poll declared source tables' current snapshot",
      "Rebuild downstream of a table, in dependency order",
    ],
  },
  {
    n: 5,
    title: "On Kubernetes",
    status: "planned",
    summary:
      "The scheduler as a Deployment; a dista cluster per run, created and deleted through the Kubernetes API.",
    gate: "The taxi pipeline runs on a schedule on EC2, each run on its own cluster.",
    items: [
      "A head, a worker set and a driver Job per run, labelled with the run ID, deleted when it ends",
      "Logs and timelines in S3",
      "Cluster start time measured; a warm pool only if it dominates short runs",
    ],
  },
];

export const worksToday = [
  "Steps and pipelines declared in Mojo, with every edge type-checked by the compiler",
  "Mapped steps, once per month, and gather steps, once per run",
  "describe: the DAG as JSON, with a registry hash identifying the code",
  "Runs recorded in Postgres: runs, steps, attempts, and the inputs and outputs of each",
  "Retries per step, and resume at the steps that didn't succeed, refused after a code change unless asked",
  "One owner per run, held by a heartbeat; a killed run resumes once its heartbeat is stale",
  "Iceberg reads pinned to the snapshot the first attempt saw",
  "Commits carrying orca.* summary properties, recognised on retry so a month isn't loaded twice",
];

export const inReview = [
  "dista tasks inside steps, one runtime per run (PR #5)",
  "Per-attempt log files and the run's dista timeline (PR #5)",
  "Fuzzing and chaos testing (PR #6)",
];

export const notYet = [
  "The taxi pipeline, phase 1's gate",
  "Schedules, partition definitions and backfills (phase 2)",
  "A web UI (phase 3)",
  "Lineage queries and sensors (phase 4)",
  "Runs on Kubernetes, and logs in S3 (phase 5)",
  "A published package: orca builds from source today",
];

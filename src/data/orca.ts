// Orca: orchestration for Mojo data pipelines. What the /s/orca pages say
// about its state comes from here, and all of it from orca.mojo's VISION.md,
// DESIGN.md and its pull requests, so moving a phase or a PR along is an edit
// to this file.

export const ORCA_REPO = "https://github.com/magmalake/orca.mojo";

/** The section's pages, in its header and (after the first) its footer. The
 * docs' own pages are reached from the strip atop every docs page. */
export const orcaLinks = [
  { href: "/s/orca", label: "Overview" },
  { href: "/s/orca/docs", label: "Docs" },
];

/** The docs' pages, in reading order: the strip atop each and its pager. */
export const orcaDocs = [
  { href: "/s/orca/docs", label: "Start", title: "Using Orca" },
  { href: "/s/orca/docs/build", label: "Build", title: "Writing a pipeline" },
  { href: "/s/orca/docs/cli", label: "CLI", title: "The command line" },
  { href: "/s/orca/docs/run", label: "Run", title: "Scheduling and running" },
  { href: "/s/orca/docs/ui", label: "UI", title: "The UI" },
  { href: "/s/orca/docs/debug", label: "Debug", title: "Debugging failures" },
];
export const ORCA_PRS = `${ORCA_REPO}/pull`;
export const DISTA_SECTION = "/s/dista";

export type Phase = {
  n: number;
  title: string;
  status: "done" | "in progress" | "planned";
  summary: string;
  gate: string;
  items: string[];
};

export const phases: Phase[] = [
  {
    n: 1,
    title: "DAGs and runs",
    status: "done",
    summary:
      "Declare steps and the datasets between them; run a DAG once, locally, in dependency order, with a Dista runtime per run; record runs and steps in Postgres.",
    gate: "The taxi load runs as a DAG (download, per-month load, compaction), and a run killed halfway resumes at the step that failed.",
    items: [],
  },
  {
    n: 2,
    title: "Schedules and partitions",
    status: "done",
    summary: "Cron schedules, monthly and daily partitions, a scheduler, backfills, retries with backoff.",
    gate: "A schedule fills each month's partition as it falls due, and a backfill over 2011–2024 runs with a bounded number at once.",
    items: [],
  },
  {
    n: 3,
    title: "The UI",
    status: "done",
    summary:
      "Pipelines, runs, steps, logs and the Dista timeline, served by flare; start, rerun and backfill from the browser.",
    gate: "A failed step is found, its logs read and the run resumed, without a terminal.",
    items: [],
  },
  {
    n: 4,
    title: "Lineage and sensors",
    status: "done",
    summary:
      "Datasets declared on steps; queries and a graph over the reads and commits Orca records; runs started by a new upstream snapshot, and rebuilds downstream of a table.",
    gate: "Committing a new snapshot to a source table rebuilds exactly the tables downstream of it.",
    items: [],
  },
  {
    n: 5,
    title: "On Kubernetes",
    status: "planned",
    summary:
      "The scheduler as a Deployment; a Dista cluster per run, created and deleted through the Kubernetes API.",
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
  "Partitions by month or by day, from a start: Monthly[\"2011-01\"], Daily[\"2024-01-01\"]",
  "Runs recorded in Postgres; retries per step, and resume at the steps that didn't succeed",
  "One owner per run, held by a heartbeat; a killed run resumes once its heartbeat is stale",
  "Iceberg reads pinned to the snapshot the first attempt saw, and commits recognised on retry",
  "Dista tasks inside steps, one runtime per run; per-attempt logs and the run's timeline",
  "Cron schedules in a time zone, read from the system's TZif files, daylight saving included",
  "The Orca scheduler: fires once each, backfills, max_runs, retries with backoff, missed fires caught up",
  "The NYC taxi load as a pipeline: 2023–2024 to 79,478,796 rows, resumed after kill -9",
  "Every month of taxi trips since 2011 backfilled four runs at a time, and the next filled by its schedule",
  "orca ui: pipelines, runs, attempts' logs and the DAG in the browser, live while a run goes on, and every page as JSON",
  "Start, resume, rerun from a step, backfill and cancel from the browser, as rows the scheduler acts on",
  "Datasets declared on steps, reads= and writes=, checked whenever a step touches a table",
  "Lineage: from a snapshot back to the runs, code and snapshots it was made from, and forward to what was made from it, on the command line and as a graph in the UI",
  "Sensors: a pipeline that runs when a dataset it reads gets a snapshot, from Orca or from anything else, once per snapshot",
  "Rebuild every pipeline downstream of a dataset, in dependency order, from the command line or the browser",
  "orca.toml: one checked-in file for where and how much each pipeline runs; orca config show says where each value came from",
  "Fills: a pipeline fills its whole range by itself, within fill_max_runs, a daily budget and a window of hours",
  "Placement: a run on EC2 instances of its own, on the scheduler's own host, or on a remote worker of a pool",
  "Remote workers that talk to the orca API over HTTPS, with a token scoped to their pool and no database credentials",
  "A watchdog that pauses pipelines on a launch storm, runaway cost, idle workers, failures, stuck runs or a full control host",
  "Alerts to your phone through ntfy: watchdog trips, failed runs, stalled fills, a full disk, a lost worker",
  "One Hetzner server as a fixed-price production setup, with deploys that pause, wait and resume by themselves",
];

export const inReview: string[] = [];

export const notYet = [
  "Runs on Kubernetes, and logs in S3 (phase 5)",
];

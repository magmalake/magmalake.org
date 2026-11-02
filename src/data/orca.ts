// Orca: orchestration for Mojo data pipelines. What the /s/orca pages say
// about its state comes from here, and all of it from orca.mojo's VISION.md,
// DESIGN.md and its pull requests, so moving a phase or a PR along is an edit
// to this file.

export const ORCA_REPO = "https://github.com/magmalake/orca.mojo";
export const ORCA_PRS = `${ORCA_REPO}/pull`;
export const DISTA_SECTION = "/s/dista";

export const asOf = "2 November 2026";

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
    title: "Dista inside steps, per-attempt logs and the run's timeline",
    gate: "A step fans 100 Dista tasks over 4 workers; each attempt's log is where status says.",
    state: "merged",
    pr: 5,
  },
  {
    n: 6,
    title: "The taxi pipeline: download, load and compact each month of NYC taxi trips",
    gate: "2023–2024 loads to 79,478,796 rows, the same as taxibench's table, and a run killed during the load resumes at the failed month.",
    state: "merged",
    pr: 8,
  },
];

/** Phase 2, as DESIGN.md splits it into pull requests. */
export const phase2Prs: Pr[] = [
  {
    n: 1,
    title: "Partition keys and sets: Month and Day, Monthly and Daily, partitions= on the pipeline",
    gate: "A daily pipeline runs over a range of days; a pipeline whose first step takes a Month under Daily doesn't compile.",
    state: "merged",
    pr: 10,
  },
  {
    n: 2,
    title: "Cron and time zones: next fires, a TZif reader with POSIX TZ rules, schedule= on the pipeline",
    gate: "Next fires match a table of known ones across both daylight-saving transitions in New York and London; the parsers are fuzzed.",
    state: "merged",
    pr: 11,
  },
  {
    n: 3,
    title: "The scheduler: register, tick, scheduler and backfill; max_runs, retries with backoff, missed fires",
    gate: "With the clock stepped month by month, partitions fill once each; racing ticks fire nothing twice; a backfill never has more than max_runs running.",
    state: "merged",
    pr: 12,
  },
  {
    n: 4,
    title: "The taxi backfill: every month from 2011, on a monthly schedule",
    gate: "orca backfill taxi 2011-01..2024-12 with max_runs=4 loads every month once, and the schedule then fills the next month when it falls due.",
    state: "merged",
    pr: 13,
  },
];

/** Phase 3, as DESIGN.md splits it into pull requests. */
export const phase3Prs: Pr[] = [
  {
    n: 1,
    title: "Read-only pages and their JSON: orca ui on flare, an escaping HTML writer, pipelines and runs",
    gate: "Every page answers HTML and JSON; a run's JSON agrees with status; a step's error with <script> in it comes out as text.",
    state: "merged",
    pr: 16,
  },
  {
    n: 2,
    title: "Logs, the DAG and live updates: attempt pages, the DAG as SVG, polled fragments, the Dista timeline",
    gate: "A running run's page follows it to succeeded and stops polling; the DAG has a box per step and an edge per after.",
    state: "merged",
    pr: 17,
  },
  {
    n: 3,
    title: "Actions: start, resume, rerun from a step, backfill and cancel, as rows the scheduler acts on",
    gate: "Phase 3's gate, over HTTP only: a failed step found, its log read, the run resumed and succeeding under the scheduler.",
    state: "merged",
    pr: 18,
  },
];

/** What phase 3's gate checks, in tests/actions.sh on PR #18. */
export const phase3Gate = [
  "A toy run fails a step; the test finds it on /runs, reads the failed attempt's log and posts resume, and with the scheduler running the run succeeds, the failed step on its second attempt and nothing else run again.",
  "A rerun from measure copies days from the old run and runs measure and total; a cancelled running run stops before its next step and ends cancelled; a resume onto new code waits for confirmation.",
  "A POST from another site's page, or with neither Origin nor Referer, is refused and changes nothing.",
];

/** What phase 1's gate measured. */
export const phase1Gate = [
  "The 24 months of 2023–2024 load to 79,478,796 rows, and every column's sum equals taxibench's table.",
  "A run killed with kill -9 while loading 2023-10, then resumed, loads each month once: 25 commits, one per month and the compaction.",
];

/** Alongside phase 1: testing that isn't one of the design's PRs. */
export const testingPr = {
  pr: 6,
  title: "Fuzzing and chaos testing, as Dista does",
  body: [
    "Fuzzing with mozz: month lists, step inputs read back from Postgres, JSON quoting, and matching a snapshot's orca.* summary against a reference. Phase 2 adds the cron parser, the POSIX TZ parser and day ranges.",
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
    status: "planned",
    summary:
      "Queries and a graph over the reads and commits Orca already records; runs triggered by a new upstream snapshot.",
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
];

export const inReview: string[] = [];

/** What phase 2's gate measured, by hand, on PR #13. */
export const phase2Gate = [
  "orca backfill taxi 2011-01..2024-12: all 168 months loaded on their first start, never more than 4 at once, in 11 minutes on one 10-core Mac, to 1,438,321,685 rows, one file per month.",
  "With the clock set to 2 February 2025, a tick at 05:59 fired nothing; at 06:00 it fired once, for January, which downloaded from the TLC and loaded its 3,475,204 rows.",
  "It found a bug: iceberg never seeds its random snapshot IDs, so concurrent pipeline processes drew the same ones and overwrote each other's manifest lists. Orca now seeds each process, and iceberg's fix takes them from the OS.",
];

export const notYet = [
  "Lineage queries and sensors (phase 4)",
  "Runs on Kubernetes, and logs in S3 (phase 5)",
  "A published package: Orca builds from source today",
];

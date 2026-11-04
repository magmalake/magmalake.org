/**
 * The home page's "One machine, then AWS" section: what a magmalake project
 * needs on a laptop, and what changes when it moves to AWS. The commands are
 * the getting-started example's (/getting-started/step-by-step), cut down.
 * In the points, `backticks` mark code.
 */

export const oneMachine = {
  title: "On one machine",
  points: [
    "One pixi project holds everything: Mojo, the tins, and Postgres and git from conda-forge.",
    "The local runner forks a run's Dista workers on the same machine.",
    "No database to start with: with `ORCA_DATABASE_URL` unset, a run is kept in memory. Add a Postgres under `build/` for the scheduler, retries and the UI.",
    "The warehouse is a directory: with `ORCA_WAREHOUSE=$PWD/build/warehouse`, the Iceberg table `lake.events` is `build/warehouse/lake/events`.",
  ],
  code: `export ORCA_WAREHOUSE=$PWD/build/warehouse
pixi run build
pixi run ./build/gharchive run --partitions 2024-06-12`,
};

export const onAws = {
  title: "Then on AWS",
  points: [
    "`orca aws up` deploys the project as one CloudFormation stack, and `orca aws push` builds one image of the same binaries.",
    "Each run gets EC2 workers of its own, added while its tasks wait and drained once they're idle; `--workers 0..4` starts from none.",
    "The warehouse and the logs move to `s3://`. The pipeline code doesn't change.",
  ],
  code: `./build/orca aws up --email you@example.com
./build/orca aws push
./build/orca aws register --workers 0..4 gharchive`,
};

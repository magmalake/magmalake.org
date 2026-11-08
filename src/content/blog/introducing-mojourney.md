---
title: Mojourney, a census of Mojo on GitHub
description: Every public GitHub repo with Mojo in it, found from GH Archive, with its full git history read. Repos, commits, lines of Mojo and the Mojo versions they pin, over time.
eyebrow: Ecosystem
date: 2026-11-08
sourceUrl: https://mojourney.dev
sourceLabel: mojourney.dev
unlisted: false
draft: true
---

[Mojourney](https://mojourney.dev) is a census of the public GitHub repos that
contain Mojo. It counts them, reads their git history, and shows how the
ecosystem grows and which Mojo versions it moves to. It is an independent
project. Mojo is a trademark of Modular Inc., and the census is not affiliated
with Modular.

At the time of writing, [the overview](https://mojourney.dev/api/overview)
says:

| | now | 30 days ago |
|---|---:|---:|
| repos found | 1,167 | |
| repos with their history read | 564 | 545 |
| commits | 103,921 | 94,677 |
| lines of Mojo | 19.0 M | 16.5 M |

That is 9,244 commits in the last 30 days, a little fewer than the 10,163 in
the 30 days before. 528 of the 564 repos read had a commit in the last year.
More repos are found than read: the history of the repos found most
recently is still being read, a few dozen at a time.
The site refreshes every 30 minutes, so these numbers will have moved by the
time you read this.

## How repos are found

[GH Archive](https://www.gharchive.org), by Ilya Grigorik, records every
public GitHub event, an hour at a time, and has done so for years. The census
reads every hour since 2023-01-01 and keeps the events that hint at Mojo. It
then asks the GitHub API about each candidate once, and keeps the repos whose
language or manifests show Mojo.

For each repo it keeps, it clones the repository and reads its first-parent
history. At each commit it records the Mojo files and lines, the tags, and
the Mojo version the lock file pins. A change of that version between two
commits is a migration. It also reads the manifests at HEAD (`pixi.toml`,
`mojoproject.toml`, `pyproject.toml`, `recipe.yaml` and a few others) for the
Mojo version they state and the dependencies they declare.

Because the history comes from git, the growth curves reach back before
GH Archive first showed the census a repo. The earliest commits in the census
are from April 2023.

## What the site shows

The [main page](https://mojourney.dev) has the headline counts, a breakdown
of repos by Mojo version, and four charts under Growth: lines of Mojo, repos
and commits per month, and the share of repos by tooling. Today 88% of repos
Of the repos read, 82% use pixi, 15% have no lock file or manifest, and 1% use
Bazel, and more than half, 308 of 564, are on Mojo 1.2.

Below the charts are three tables:

- **Rising** ranks repos by what they gained in the last 30 days. The score is
  stars gained + 3 × forks gained + 5 × the census repos that use it now.
- **Most active** lists the repos with the most commits in the last 30 days,
  and how many lines of Mojo they grew by.
- **Most depended on** lists the repos that the most census repos declare as a
  dependency. An owner's repos that depend on each other share one row, so
  magmalake's own libraries are `magmalake/*`, used by 23 of its repos and
  none from outside yet. The most used from another owner is Brian
  Grenier's [EmberJson](https://mojourney.dev/repos/bgreni/EmberJson), used
  by 5 repos.

[Migrations](https://mojourney.dev/migrations) counts, per month, the repos
whose lock file moved to each Mojo version. Releases show up as spikes. In
July, 209 repos moved to 1.0.0. In August, 197 moved to the nightly
1.1.0.dev2026081105, and in September 247 moved to 1.2.0.dev2026092605.

[Repos](https://mojourney.dev/repos) is the full list, sortable and filtered
by Mojo version, activity and first commit. Each repo has its own page, for
example [bgreni/EmberJson](https://mojourney.dev/repos/bgreni/EmberJson): lines
of Mojo over time, stars per month, what it depends on and what uses it, its
tags with the Mojo version at each, and every migration. The search box in
the header finds repos by name.

Every chart and table has a small (?) next to its title. Click it for what the
numbers mean and how they are counted. [How it works](https://mojourney.dev/how)
describes the pipelines in more detail.

The data is also JSON: [/api/repos](https://mojourney.dev/api/repos) for
every repo and [/api/overview](https://mojourney.dev/api/overview) for the
headline numbers and the monthly series.

## How it's built

Seven Mojo pipelines do the work: `gharchive`, `gharchive_index`,
`mojo_repos`, `mojo_history`, `mojo_versions`, `mojo_activity` and
`mojo_stats`. They write Apache Iceberg tables to Hetzner Object Storage with
[iceberg.mojo](https://github.com/magmalake/iceberg.mojo) and
[parquet.mojo](https://github.com/magmalake/parquet.mojo), both written in
Mojo. The code is in [magmalake/mojo-census](https://github.com/magmalake/mojo-census).

The pipelines are run by [orca](https://github.com/magmalake/orca.mojo),
magmalake's orchestrator, also written in Mojo. Its runs are public at
[orca.mojourney.dev](https://orca.mojourney.dev). The next post, on Monday,
is about orca.

The site is a Mojo HTTP server built on
[flare](https://github.com/ehsanmok/flare), by Ehsan M. Kermani. It reads the
Iceberg tables itself, with no database in between. Every 30 minutes it checks
the tables' snapshots and rebuilds its pages in memory when one has changed.
Before a new build goes live it runs a set of data checks, for example that
the numbers in the top tables match those on each repo's page. The latest
results are at [/checks](https://mojourney.dev/checks).

The site, the orchestrator and most of the pipelines run on one Hetzner
CAX21, a 4-vCPU ARM server with 8 GB of RAM that costs a fixed €12.49 a
month. A
second machine, an Apple-silicon Mac, runs the git-heavy pipelines as an orca
remote worker.

## What to keep in mind

- **Commit counts are first-parent.** They follow the main line of each
  repo's history, so they will be lower than the totals GitHub shows.
- **Stars are refreshed daily**, from the GitHub API at 06:00 UTC.
- **GH Archive is loaded, the histories are catching up.** 1,406 of the
  1,407 days from 2023-01-01 to 2026-11-07 are loaded; the last, 2025-06-12,
  is missing an hour GH Archive never published, and loads without it. The
  backfill found many repos in its last days, so about half of the 1,167
  repos don't have their history read yet, and counts that come from the
  history (commits, lines, versions) cover the 564 that do. The home page
  shows both fractions.
- **Detection can miss repos.** If a repo's events never carry a Mojo-specific
  signal, the census does not see it. Some repos also have no version it can
  read. They are listed as `no-manifest` or `unknown`.

If a repo is missing or something is counted wrong, the Feedback link in the
site's footer opens an issue on
[mojo-census](https://github.com/magmalake/mojo-census/issues).

## Next

Once every repo's history is read, the commit, line and version counts will
cover all the repos found. After that, the plan is to
keep the census current and add views as questions come up.


---
title: How big, how many
description: Scaling an orchestrator in two dimensions, and the bugs a fake pipeline found in each.
eyebrow: Orchestration
date: 2026-11-11
sourceUrl: https://github.com/morca-dev/morca
sourceLabel: morca-dev/morca
related: []
unlisted: false
draft: true
---

Every data pipeline needs to answer two questions before a run starts: how many resources
to reserve, and how many copies should run at once? Get the first wrong and runs die out
of memory or hoard a machine. Get the second wrong and a backfill crawls on a
server that sits half idle.

We build [orca](/s/orca/), a pipeline orchestrator written in Mojo that runs
data pipelines over Iceberg tables. Its [roadmap](/s/orca/docs/roadmap/)
borrows its shape from Google's
[Autopilot](https://research.google/pubs/autopilot-workload-autoscaling-at-google-scale/)
paper, which splits autoscaling into two axes:

- **Vertical, how big:** the memory and CPUs one run asks for, learned from
  what earlier runs actually used.
- **Horizontal, how many:** how many runs go at once, and on how many machines,
  given the available resources.

The vertical axis has to come first: you can't decide how many runs fit until
you know how big each one is. This post tests both, in that order, and records
what broke.

## The rule

A pipeline opts in with `memory_gb = "auto"` (or `"auto..6"` to cap it at
6 GB). Before each start, Orca looks at the pipeline's last 20 successful runs
and asks for:

```text
memory = p95(peak memory) × 1.15, rounded up to 256 MB
cpus   = p90(peak cores) − 0.1, rounded up
none until 3 runs have been measured
```

The grant becomes a Linux cgroup. A run is throttled at its grant
(`memory.high`) and killed 25% above it (`memory.max`). A run that's killed for
its memory retries with 1.5× more, and that raised value becomes a floor for
the pipeline's later runs.

Autopilot's recommenders are more elaborate: they weight recent usage more
heavily than old usage. Ours is deliberately the simplest rule that could work,
a percentile over a fixed window with no decay. The question was whether simple
is enough.

## Production data is too polite

Our production pipelines (the [mojourney.dev](https://mojourney.dev) census of
the Mojo ecosystem) behave well. Their memory barely moves from day to day, so
a learned request looks right after three runs and stays right. That tells you
nothing about outliers, growth, shrinkage or caps.

So we wrote **ballast**: a pipeline that does no work. Each day of 2011 holds a
set amount of memory and keeps a set number of cores busy for 20 seconds, from
a plan we wrote down in advance. Every peak is known before the run starts, so
every learned request can be checked by hand.

| Scenario | Runs | Holds | What it tests |
| --- | ---: | ---: | --- |
| Cold start, steady | 22 | 300 MB | No request until 3 runs, then a stable one |
| Outlier | 1 + 19 | 1500 / 300 MB | One run 5× the rest |
| Shrink | 20 | 60 MB | Does the request come back down? |
| Ramp | 20 | 300 MB +8%/run | Does learning keep up with growth? |
| CPU | 10 | 1–2 cores | The CPU rule |
| Over the cap | 3 | 1200 MB | `auto..1`: capped, killed, shown as capped |
| Learning off | 5 | 300 MB | `learn = false` |

It ran on our beta stack: one Hetzner CAX11, an ARM server with 2 cores and
4 GB, which also runs Postgres, the UI and a copy of the census. The small box
set the sizes: the first plan's 3 GB outlier didn't fit next to everything
else.

## What happened

### Cold start and steady: as expected

The first three runs had no request. From the fourth, every run asked for
512 MB and one CPU, learned from 3, 4, 5 … and then 20 runs. Each peaked at
318 MB.

One observation, not a bug: 318 × 1.15 is 366 MB, and the 256 MB step rounds
that up to 512. For small pipelines the rounding step, not the 15% margin,
decides the headroom; here it's 61%.

### Before the outlier: the test that would have passed anyway

Beta had per-run cgroups switched off. No run had a memory limit, so nothing
could be killed for exceeding its grant, and the outlier, ramp and cap
scenarios would all have passed without testing anything. We turned the limits
on before running them. A green test needs a way to go red.

### Outlier: bug 1

The 1500 MB run started with the learned 512 MB grant. We expected a kill at
640 MB and a retry. Instead it ran for an hour.

Past `memory.high`, the kernel throttles a cgroup and tries to reclaim its
memory. Ballast's memory is anonymous and the box has no swap, so there was
nothing to reclaim: every allocation just waited. In an hour the run crept to
595 MB, never reaching the 640 MB kill line. Its cgroup told the story:

```text
memory.events    high 222406   max 0   oom_kill 0
memory.pressure  full avg10=93.60 avg60=87.13
memory.stat      anon 594137088   file 0
```

orca already knew this state could happen. It treats a run held at its limit as
out of memory, but only once the run's heartbeat goes stale. The heartbeat runs
on its own thread, which barely allocates, so it stayed fresh while the main
thread starved.

**Fix** ([orca #279](https://github.com/morca-dev/morca/pull/279)): every
scheduler pass checks each run's cgroup. A run at its limit whose tasks are all
stalled on memory at least half the time (PSI `full avg10 ≥ 50`) for two
minutes in a row is killed and counts as out of memory. The rerun:

| Attempt | Limit | Peak | Took | Result |
| --- | ---: | ---: | ---: | --- |
| 1 | 512 MB | 542 MB | 2:16 | held, killed |
| 2 | 768 MB | 804 MB | 2:18 | held, killed |
| 3 | 1152 MB | 1194 MB | 2:16 | held, killed |
| 4 | 1728 MB | 1518 MB | 0:21 | succeeded |

Killed after two minutes held at each limit, retried at 1.5×, done in about
seven minutes.

### Shrink: bug 2

The outlier's retries left the pipeline's floor at 1728 MB. Then came 20 runs
that peaked at 77 MB. By the 20th the outlier had left the learning window
entirely, and the run still asked for 1728 MB. Without the floor, the rule
would have said 256 MB: one out-of-memory retry held a 77 MB pipeline at 6.75×
the rule's request, with no end.

The floor exists for a good reason: right after a kill, the next run shouldn't
repeat the same doomed attempts. But nothing ever lowered it; only
re-registering the pipeline with a different setting cleared it. This is
exactly the decay Autopilot builds in and our simple rule left out.

**Fix** ([orca #280](https://github.com/morca-dev/morca/pull/280)): orca
records which run caused the raise and forgets it once 20 of the pipeline's
runs after that one have succeeded. While the outlier is among the 20 runs the
request is learned from, the floor protects the next runs; after that, 20 runs
that fit have shown what they need.

### Ramp: as expected

The ramp's first run also confirmed #280: it asked for 256 MB, learned from the
shrink's 77 MB runs, rather than the old 1728 MB floor.

That run then held 318 MB, 4× more than anything in its window, and no history
predicts a jump like that. It was held at 256 MB, killed after two minutes and
retried at 384 MB, which succeeded. The next 19 runs grew 8% each, from 341 MB
to 1313 MB. The request kept ahead the whole way, from 384 MB up to 1536 MB,
and every run succeeded on its first try.

| Runs | Peak | Asked for | Memory stall | Result |
| --- | ---: | ---: | ---: | --- |
| 64 | 318 MB | 256 → 384 MB | 112 s | held, killed, retried bigger |
| 65–83 | 341 → 1313 MB | 384 → 1536 MB | 0 s | all first try |

The stall column is new ([orca #283](https://github.com/morca-dev/morca/pull/283)).
It records how long each attempt's tasks waited on memory, from the cgroup's
PSI totals. Here it splits cleanly: zero for every comfortable grant, nearly two
minutes for the one that was too small. The 15% margin plus the rounding step
absorbs 8% growth per run. A ramp steeper than about 15% per run would outgrow
it, and would cost a two-minute held kill at every step.

### CPU: bug 3

Ten runs alternated between one and two busy cores. Memory stayed put, and the
CPU rule did what it says: p90 of the peaks (1.0, 1.95, 1.0, 1.95, …) minus
0.1, rounded up, is 2 CPUs.

But beta keeps one of its two cores for Postgres, the UI and the scheduler, so
it can give a run at most one. From the seventh run on, every start waited with
`needs 2 CPUs, more than the 1 this host grants at most`. It would have waited
forever: a learned request can outgrow the machine it learned on.

**Fix** ([orca #284](https://github.com/morca-dev/morca/pull/284)): a
learned CPU request is capped at what the host can give a run. Fewer cores only
make a run slower. Memory isn't capped the same way, because a run that needs
more memory than the host has would just be killed, and waiting with a clear
reason is the better outcome.

Behind this is a design gap rather than a bug: CPU grants are advisory. orca
tells a run how many CPUs it was given, but the run's cgroup sets no CPU limit,
and ballast ignores what it was told. So a run given one CPU peaked at 1.95,
and the rule learned what runs take, not what they were given. Enforcing the
grant with a CPU limit in each run's cgroup would close the loop.

### Over the cap: bugs 4 and 5

With `memory_gb = "auto..1"`, three runs held 1200 MB against a 1 GB cap. They
should have been capped, killed, and failed, saying the cap was why.

The first run's attempts said exactly that: `out of memory at 1 GB … that's the
most it may ask for (memory_gb's maximum)`. But the run retried anyway, at the
same 1 GB, four times, about two minutes each. Then it ended as `interrupted:
its process stopped, and its retries are spent`, which hides the reason. A
retry that asks for the same limit is the same attempt again.

**Fix** ([orca #287](https://github.com/morca-dev/morca/pull/287)): a run
killed at its maximum fails on that kill, with the kill as its error. On beta,
the same day afterwards took one start, and the run's error is the
out-of-memory reason.

The failures also tripped orca's watchdog, which pauses a pipeline after 6
failed attempts in an hour. It paused ballast between two of the second run's
tries. That run still had retries left, so orca left it for the next scheduler
pass to restart, and a paused pipeline starts nothing. It sat `running` for
over two hours with its process gone. The next deploy waited an hour for it to
finish, gave up, and left every pipeline on the server paused.

**Fix** ([orca #291](https://github.com/morca-dev/morca/pull/291)): while a
pipeline is paused, a run whose process has stopped goes back to the queue,
keeping its start count, and unpausing starts it.

### Learning off: as expected

With `learn = false`, five runs asked for nothing, ran under the host's default
limit (2269 MB), peaked at 318 MB and succeeded. The setting does what it says.

### A clean rerun: bug 6

Beta's history was a patchwork of images and redeploys, so we ran every
scenario again on a fresh server (an eight-core lab stack, empty database, orca
main with all five fixes). All 92 learned runs succeeded. The outlier retried
512 → 768 → 1152 → 1728 MB, and its raise expired on schedule twenty runs
later. The pipeline shrank to 0.25 GB once the 300 MB runs left the window.
Learned CPUs went to 2 and, on eight cores, fit.

Over the cap, though, two runs logged `failed, not retried` three times each.
#287 had cleared the run's retry time, but on a failed run an empty retry time
means "retry not scheduled yet", so the next scheduler pass scheduled one. On
beta, a redeploy had hidden it. #287's test had checked too early, before the
next pass.

**Fix** ([orca #300](https://github.com/morca-dev/morca/pull/300)): a run
that must not be retried records the start it failed on, and the scheduler
skips it. The test now waits past the time a retry would start. On the lab,
both over-cap runs failed once and stayed failed.

## Along the way

- **Long partition lists.** A run over every day since 2023 printed hundreds of
  dates on its page and in the deploy's progress output. Now it shows the
  first, the last and the count
  ([orca #277](https://github.com/morca-dev/morca/pull/277)).
- **Settings drift.** The beta stack's settings named its storage bucket in the
  wrong Hetzner location, which surfaced as a 404 from the pre-deploy backup.
- **Letting an agent deploy.** The test loop (change, build an image, deploy,
  run, read results) ran from a coding agent's machine. It got access to the
  beta project only: its own Hetzner token, an SSH key the beta server alone
  accepts, and beta's decryption key for our SOPS secrets. Production's secrets
  stay behind a key in the laptop's Secure Enclave.

The loop itself had no releases in it. Each orca fix was pinned by its commit
in a branch of the census, and pushing that branch built an image tagged with
the commit, which the beta server then ran. A fix went from first noticed to
running on beta in under an hour, and ships in the next orca release.

The loop needs one discipline: a deploy restores the project's configuration.
It re-registered ballast from beta's own settings in the middle of the
over-cap scenario, which quietly lifted the 1 GB cap. The next two runs passed
at 1.5 GB, so we ran the scenario again after the deploy.

## What we learned

- **Build the inputs you need.** A pipeline with known peaks found six bugs in
  a day and a night that months of well-behaved production data hadn't.
- **Check that a test can fail.** With limits off, three scenarios would have
  passed and proved nothing. And a test of "never happens" has to wait long
  enough for it to happen.
- **Liveness isn't progress.** A heartbeat on its own thread says the process
  exists, not that it's getting anywhere. Pressure stall information (PSI)
  says whether it's getting anywhere.
- **Every floor needs an expiry.** A safety margin that never decays turns one
  bad day into a permanent cost.
- **Learned values need the same limits as declared ones.** A request learned
  from what runs took can outgrow the machine, and a retry at a limit that
  can't rise is the same failure again.
- **Safety features meet each other.** The watchdog's pause and the retry logic
  were each right on their own. Together they left a dead run looking alive.

## How many

With runs sized from their own history, orca could answer the second question.
We built it in four steps, each tested on a lab stack (a Hetzner CAX31 with 8
cores and 16 GB, in its own project) with ballast again, and a second test
pipeline, **spread**, whose step fans out one dista task per day of a month.

| Step | What changes | Machines | Result |
| --- | --- | ---: | --- |
| H1 · [#266](https://github.com/morca-dev/morca/issues/266) | `max_runs = "auto"`: start another run while its request fits | 1 | done |
| H2 · [#220](https://github.com/morca-dev/morca/issues/220) | A pool of worker machines | 2+ | works; joining by hand later |
| H3 · [#267](https://github.com/morca-dev/morca/issues/267) | A pool that grows and shrinks with the queue | 0–N | done |
| H4 · [#268](https://github.com/morca-dev/morca/issues/268) | One run spread across machines | 2+ | done |

### H1, as many as fit: bug 7

`max_runs = "auto"` starts another run whenever its request fits in what the
host's running runs weren't granted
([orca #302](https://github.com/morca-dev/morca/pull/302)). Thirty days of
ballast ran 3 at once while the learned request was 2 CPUs and 1.5 GB, then 7
at once (all the lab can grant) as the 1-core days took over the window. No
orca.toml change but the one key.

Then the 1.5 GB outlier, granted 512 MB, was held at its own limit, and every
other start stopped: `waiting: memory pressure 61%`, with 13.7 GB free. Linux's
pressure stall information counts a cgroup's stall at its own limit in every
ancestor, so one starved run looked like a starved host. With one run at a
time, which is how ballast ran before, it never showed.

**Fix** ([orca #303](https://github.com/morca-dev/morca/pull/303)):
admission subtracts the stall the runs held at their own limits explain. On
the rerun the 29 normal days ran 7 at a time while the outlier was being killed
and retried beside them.

### H2, a pool of machines: bug 8

orca already had remote workers: `orca worker` on another machine claims a
pool's runs over the UI's API. With a second CAX31 and a worker on the lab
server itself, ballast ran 15 at once (8 and 7, each worker admitting runs
against its own machine), and the 29 normal days took 55 seconds instead of
2.5 minutes. The outlier moved between the machines as it retried bigger.

The UI's "Hosts over time" chart still showed one host: it counted EC2
instances and the control host, never a self-hosted worker (fixed in
[orca #305](https://github.com/morca-dev/morca/pull/305)). Adding a machine
by hand, with a one-command join and drain, is
[#220](https://github.com/morca-dev/morca/issues/220), for later.

### H3, a pool that grows and shrinks: limit 1

A pool is now declared in orca.toml, and the scheduler makes and removes its
machines ([orca #313](https://github.com/morca-dev/morca/pull/313); EC2 in
[#321](https://github.com/morca-dev/morca/pull/321)):

```toml
[pools.lab]
provider = "hetzner"
machines = [
  { type = "cax31", wait = 600 },   # prefer this; keep trying it 10 min
  { type = "cax21", wait = 600 },
  { type = "cpx32" },               # the last: keep trying it
]
locations = ["hel1", "nbg1", "fsn1"]
max_machines = 3
idle_seconds = 900
```

- **Out of stock.** Hetzner had had no ARM machines in any region the week
  before, which is why the list has fallbacks and waits. orca tries the type
  it's on in each location, keeps trying it for its `wait`, then moves on.
- **Architecture is automatic.** orca asks the provider for each type's
  architecture and reads the worker image's manifest; a type the image has no
  variant for is skipped, saying so. Nothing in the config names an
  architecture.
- **Secrets stay off the machine's startup script.** It holds one per-machine
  worker token; the machine fetches the image, its login and the bucket's
  settings from the UI over TLS. The token is revoked when the machine goes.

On the lab, from an empty pool: 30 ballast runs queued; 21 seconds later orca
made a CAX31 (hel1 had none; nbg1 did); about a minute after the queue it
joined as a worker; it ran 8 at once; 300 seconds after its last run it was
deleted. A second machine was refused, not for stock but for the project's
core quota (`resource_limit_exceeded`), which orca reported rather than taking
for a shortage. Falling back to a smaller type that fits came next
([orca #348](https://github.com/morca-dev/morca/pull/348)).

### H4, one run over several machines: bug 9

A run with dista tasks used to run on one machine. With `workers = N` on a pool
pipeline it now spreads
([orca #325](https://github.com/morca-dev/morca/pull/325),
[#334](https://github.com/morca-dev/morca/pull/334)): the worker that
claims it starts a dista head, a dista worker and the run's driver; other
workers of the pool with room claim "join run R" and start dista workers
against that head; a run that wants more members than have joined is demand,
so the pool grows for it.

dista had no authentication: anything that reached a head could join a run or
read its results. Ray's security docs make the same point about Ray, and Ray
2.52 added a token mode. We did both of the things Ray recommends: the machines
talk over a private network orca makes for the pool, and each run start gets a
token that dista requires on every connection, head and worker-to-worker alike
([dista #125](https://github.com/morca-dev/dista/pull/125)).

On the lab, from an empty pool, two runs of spread: orca made two CAX21s on the
private network; each run's head came up on a private address (10.77.0.2, then
10.77.0.3), the other machine joined it, and both ran tasks (the one counted
ran 5 of 31 and 16 of 29); both machines were deleted once idle.

CI found the bug: a test starts a dista worker without the token and checks
it's refused. It passed on a laptop and failed in CI, because CI compiled dista
from a checkout pinned in the workflow, still at the version without the token.
The test did its job.

## What we learned, the second time

- **A host-wide signal includes your own limits.** Memory pressure on the host
  rose because one run was held at its own grant. Admission has to tell "the
  host is short" from "a run is at its limit".
- **Ask the provider, not the config.** Which architecture a machine type is,
  whether it's in stock, how much quota is left: all answerable at the moment
  of need. Config that repeats them goes stale.
- **Authenticate on the private network too.** Network isolation keeps the
  outside out; a token per run keeps the run's neighbours out. Both are cheap.
- **Know what your tests ran against.** A dependency pinned in two places, once
  for builds and once for CI, let a test pass on one machine and fail on
  another. The failing one was right.

Left for later: machines a person adds by hand
([#220](https://github.com/morca-dev/morca/issues/220)). The small
follow-ups (fill runs sized like other runs, the pool's status in the UI, the
quota fallback and clearer machine names,
[#322](https://github.com/morca-dev/morca/issues/322)) have since merged
and ship in orca 0.24.0.

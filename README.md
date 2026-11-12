# magmalake.org

The project website for [magmalake](https://github.com/magmalake) — data lake building
blocks in Mojo — live at [magmalake.org](https://magmalake.org). A static
[Astro](https://astro.build) site, deployed to Cloudflare Workers static assets.

## Develop

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # static output in dist/, plus the search index
npm run preview    # serve dist/ locally
```

## Deploy

The site is mostly a **Cloudflare Workers static assets** deployment — `wrangler.jsonc`
declares `assets.directory = "./dist"`, and `assets.run_worker_first` limits the one Worker
(`worker/posthog-proxy.js`, see [Analytics](#analytics)) to the `/ph/*` path, so every other
request is still served straight from the uploaded files with no Worker invocation.

```bash
npm run build
npx wrangler deploy      # or: npm run deploy
```

`wrangler` is a dev dependency; there is no global install. Authentication is whatever
`npx wrangler login` (or a `CLOUDFLARE_API_TOKEN` with *Workers Scripts: Edit*) has set up.

## Layout

```
src/
  data/tins.ts          the tins: description, oracle, version, repo
  data/api/*.json       each tin's API, from scripts/api-docs.mjs (see API reference)
  data/install.ts       install tabs: mojoshelf and plain pixi (see Install tabs)
  data/tincommits.json  each tin's published commit, from scripts/tin-commits.mjs
  data/perf.ts          benchmark rows and the four optimisation passes
  data/site.ts          site-wide constants (currently: the PostHog project key)
  layouts/Base.astro    <head>, fonts, theme bootstrap, nav + footer, PostHog snippet
  components/           Hero, Nav, Footer, Logo, StackDiagram, TinCard, PerfTable
  pages/index.astro     the whole landing page
  pages/404.astro       not-found page (served by not_found_handling: "404-page")
  integrations/         agent-markdown.mjs: Markdown twins, llms.txt (see below)
  styles/global.css     design tokens, light/dark palettes, layout primitives
public/                 favicon, robots.txt
worker/posthog-proxy.js first-party PostHog reverse proxy, served at /ph/* only
worker/mojourney-ph/    the same proxy as its own Worker on the mojourney.dev zone
```

Every tin gets its own small section at `/s/<tin>`, generated from `src/data/tins.ts`:
an overview, `/docs` (its Markdown in `src/content/tindocs/<tin>.md`) and, when
`src/data/perf.ts` or the tin has numbers or notes for it, `/performance`. Their header
and footer are `SectionNav` and `SectionFooter`, and the list of a tin's pages is `tinLinks` in `src/data/tinpages.ts`: add a page
there and in `src/pages/s/[tin]/`, and every tin's header picks it up.

Content lives in `src/data/*.ts`, so updating a version number or a benchmark is a one-line
change in one file rather than a hunt through markup.

## Markdown for agents

Every page has a Markdown twin for coding agents and other LLM readers, after the
[llms.txt proposal](https://llmstxt.org). `src/integrations/agent-markdown.mjs`, an Astro
integration wired up in `astro.config.mjs`, runs once `astro build` has written `dist/` and
adds:

- **A twin per page**, at the page's URL plus `.md`: `/s/iceberg` → `/s/iceberg.md`, and
  the home page at `/index.md`. The same file is also written as `<page>/index.md`, which is
  the proposal's name for a URL that ends in a slash.
- **Two links in each page's `<head>`**: `<link rel="alternate" type="text/markdown">` to its
  twin, and `<link rel="describedby">` to `/llms.txt`.
- **`/llms.txt`**: the site's name, a one-line summary, then a link to every twin with its
  page's description, in the sections listed in `astro.config.mjs`. A page that no section
  claims goes under "Other".
- **`/llms-full.txt`**: every twin in one file.

A twin comes from one of two places:

1. **Its Markdown source, when it has one.** A `.md.ts` endpoint beside the page writes
   the twin itself, and the integration keeps it as it is. `src/pages/blog/[...slug].md.ts`
   does this for posts: the title, description and date, then the post's own Markdown.
2. **Its HTML, otherwise.** The integration converts the page's `<main>`. It leaves out
   `nav`, buttons, forms, scripts, styles, SVG, eyebrows, anything `aria-hidden` or `hidden`
   (except tab panels, so every code tab is kept), and anything marked `data-md="skip"`. The
   page's first `<h1>` becomes the twin's heading, with its meta description under it as a
   quote. Site-relative links become absolute. In-page `#` links become plain text.

**A new page needs nothing.** On its next build it gets a twin, the links in its head and an
entry in `llms.txt`. To make its twin read better:

- Mark decoration that is not content with `data-md="skip"`.
- Mark a grid of boxes that is really a list with `data-md="list"`, as
  `StackDiagram.astro` does; each child becomes a list item.
- If the page is rendered from Markdown or data, add a `<page>.md.ts` endpoint that returns
  that source as `text/markdown`.
- If it starts a new part of the site, add a section to `sections` in `astro.config.mjs`.

Check a twin with `npm run build` and then `dist/<page>.md`.

**Content negotiation.** Workers static assets pick a file by its path, not by the
`Accept` header, so a request for `/s/iceberg` with `Accept: text/markdown` still gets the
HTML. Agents can get the Markdown from the `.md` URL, the `alternate` link or `llms.txt`. There
are two ways to answer `Accept: text/markdown` as well, and neither is set up:

- Cloudflare's [Markdown for Agents](https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/)
  is a zone setting on the Pro plan and above. It converts the HTML at the edge, so it would
  serve its own conversion, not these twins.
- Setting `run_worker_first` to `true` sends every request through `worker/`, which could
  then answer that header with the twin. The cost is a Worker invocation on every request,
  where today only `/ph/*` invokes one.

`wrangler dev` serves `.md` as `text/markdown; charset=utf-8` and the two `.txt` files as
`text/plain; charset=utf-8` with no `_headers` rules.
## API reference

Each tin with Mojo sources has an API reference at `/s/<tin>/api`. It lists the package's
modules, and each module has a page with its structs, traits, functions and aliases, their
signatures and their docstrings. The pages and their Markdown twins (`.md.ts` endpoints
beside them) are rendered from `src/data/api/<tin>.json`. That JSON is committed, because
Cloudflare's build has no Mojo. To regenerate it:

```bash
node scripts/api-docs.mjs            # every tin
node scripts/api-docs.mjs iceberg    # or just these
```

For each tin, the script:

1. asks `pixi shelf info <pkg>` which commit the version in `src/data/tins.ts` was
   published from. xml isn't published yet, so it uses its default branch;
2. exports that commit of the repository into `.cache/api-docs/` (gitignored);
3. runs `mojo doc` over the tin's package, with every other tin's package on `-I`, using
   the toolchain pinned in `scripts/api-docs/pixi.toml` (Mojo 1.2.0);
4. trims the output to what the pages show. It keeps public names only, leaves out the
   copy and move constructors every struct gets, and keeps arguments only where they have a
   doc. It then writes the JSON with the version, the commit and the Mojo version it came
   from, and prints how many declarations have a docstring.

It needs git, pixi with the mojoshelf extension, and the network. After a release, bump
the version in `tins.ts`, run the script for that tin, and commit the JSON with it. A tin
whose repository holds more than one package names the one to document with `api` in
`tins.ts` (parquet, parquet-full, avro). Per-tin include paths and directories to leave out
are `EXTRA` in the script: threads' compat module, and json_mlake's GPU parser, which needs
MAX. A file with a top-level `main()` is a program, not API, and is left out, since
`mojo doc` refuses a package that holds one.
## Install tabs

Every `pixi shelf add <tin>` on a tin's overview, in its tindocs Markdown, in
and in the maintainers' runbook has a second tab beside it: the same install with
plain pixi, as a git dependency at the commit the tin's version was published from. Both
tabs come from `installTabs` in `src/data/install.ts`. In the tindocs Markdown a remark
plugin, `src/integrations/install-tabs.mjs`, turns any `sh` block holding
`pixi shelf add` into the tabs, and links the first mention of mojoshelf before it to
`MOJOSHELF_INSTALL`, mojoshelf's getting-started page. In a Markdown twin both tabs
show, each under its name.

The commits are `src/data/tincommits.json`, from the registry's API. After bumping a
version in `tins.ts`, regenerate it; the build fails while the two disagree:

```bash
node scripts/tin-commits.mjs
```

## Search

`npm run build` runs `astro build` and then `pagefind --site dist`. [Pagefind](https://pagefind.app)
writes a static index to `dist/pagefind/`, and Workers static assets serve it like any other
file, so there's no server. `/search` is the search page: `?q=` is the query and `?tin=<slug>`
scopes it to one tin. The magnifier in the main header leads there, and so does the one in
each tin's header, which is scoped to that tin.

`src/layouts/Base.astro` handles indexing for every page, from `src/data/search.ts`:

- only `<main>` is indexed (`data-pagefind-body`), so headers and footers are left out;
- each page is filed under a `section` filter (Start here, Tins or Blog), and a
  `/s/<tin>/...` page also under a `tin` filter;
- 404 and /search are left out.

A new page is searchable, and scoped, on its next build with nothing added. To keep
something out of the index, such as the copy buttons, mark it `data-pagefind-ignore`. The
results UI is a small inline script on `src/pages/search.astro` that calls Pagefind's JS API
(`/pagefind/pagefind.js`), styled like the rest of the site. `npm run dev` has no index, so
search only works after `npm run build`, under `npm run preview` or `wrangler dev`.

## Analytics

The site loads [PostHog](https://posthog.com) (US cloud) for basic product analytics.
Requests are proxied first-party through `/ph` (`worker/posthog-proxy.js`, a small Worker
that `wrangler.jsonc`'s `assets.run_worker_first` routes only `/ph/*` to — every other
request is still served straight from `dist/`) so ad-blockers that drop `*.posthog.com`
don't drop it, and so the client IP forwards for geolocation without ever handing PostHog a
first-party cookie. The client is configured with `persistence: 'memory'`, so it sets no
cookies and writes nothing to `localStorage` — there is nothing to disclose and no consent
banner is needed.

The project key lives in one place, `src/data/site.ts` (`POSTHOG_KEY`), and is the same
public client-side token mojoshelf.org uses — both sites share one PostHog project. It's a
`phc_` token, safe to embed: PostHog project keys are meant to be public. To disable
analytics, clear `POSTHOG_KEY` to anything not starting with `phc_`; `src/layouts/Base.astro`
omits the snippet entirely in that case.

The same proxy also runs as a second, separate Worker on the mojourney.dev zone, for
the census console and the orca UI, which have no Worker of their own:
`worker/mojourney-ph/` (deploy with `npx wrangler deploy -c worker/mojourney-ph/wrangler.jsonc`;
see its README). The site's own deploy does not include it.

## Maintain and release

A runbook for the person who owns the stack: the pull-request routine, releasing tins and the `shelf` CLI, and where things are. It used to be the site's /getting-started/maintain page. Every command was checked against the source on 2026-11-06 (shelf 0.7.0); where something is a known caveat, it says so. Orca, Dista and the census are now Morca's, at [morca.dev](https://morca.dev): its [runbook](https://morca.dev/getting-started/maintain) covers running them in production.

### Day-to-day pull requests

`main` is protected in every magmalake repository: changes arrive by pull request only, with no direct push and no force push. Cut a branch from a *pushed* main. A squash-merge folds local commits that were never pushed into your PR under your subject, so check first:

```sh
git checkout main && git pull --ff-only
git log origin/main..main          # must print nothing
git checkout -b my-change
```

Open the PR with `gh pr create` and watch it with `gh pr checks --watch`. Each repository's `ci.yml` sorts a PR before it spends machine time: a docs-only PR (prose and similar files that no test, build or check reads) skips the code jobs, and a release-only PR (only versions, `CHANGELOG.md`, revs and locks change) takes a short path that skips the nightly leg and the heavy tests. The final `ci` job accepts "skipped" for those, so a green check there is the one to merge on.

#### Known flaky tests

A red job is real unless it is one of these three, which fail on a loaded runner:

- Port collisions in the stand-in EC2 tests: "Address already in use" or "stand-in EC2 didn't start".
- `tests/fleet.sh` failing on "by CPU, highest first", when the machine is busy.
- `kind` tests that time out inside the vCPU budget.

Rerun only the failed jobs, once:

```sh
gh run list -R magmalake/orca.mojo --branch my-change -L 3
gh run rerun <run-id> --failed -R magmalake/orca.mojo
```

If it passes, merge. If the same job fails twice, or the message is anything else, it is a real failure: read the log (`gh run view <run-id> --log-failed`) and fix it. Do not rerun a third time.

#### CHANGELOG.md conflicts

A repository that has a `changes/` directory next to its CHANGELOG.md keeps a changelog *fragment* per PR instead of editing the changelog, so two open PRs never conflict there. Add yours with `shelf changes new <slug>` (`--bump minor` for a new feature); it writes `changes/<slug>.md`, which you fill in with the entry as it should read. The level is the file name's suffix (`155-fills.minor.md`) or a first line `bump: minor`: `patch`, `minor`, `major` or `breaking`; no level is a patch, and a `### Breaking` or `### Removed` heading makes it breaking. In PR CI, `shelf changes check` fails a PR that changes code without adding or editing a fragment. PRs that change only prose pass, and so do PRs labelled `no-changelog` or `release`.

```sh
shelf changes new fills --bump minor     # writes changes/fills.minor.md
shelf changes check                      # what CI runs; compares HEAD with origin/main
```

Two fragments never conflict, since each PR adds its own file. The repositories that have not moved yet (orca.mojo among them) still use `## Unreleased`: every change adds a line there, so two open PRs conflict. Resolve by keeping both entries. If a release landed in between, the heading is now the version (`## 0.10.0`): put your entry under a fresh `## Unreleased` above it, not under the released version. The level of bump `shelf release` picks comes from these headings, so keep them spelled as the file already does. The design is in [mojoshelf #36](https://github.com/mojoshelf/mojoshelf/issues/36); it needs `shelf` 0.8.0 or later.

### Releasing tins with shelf release

Tins pin each other by git revision, so releasing one means releasing its dependents too. `shelf release` plans that cascade, cuts a release branch in each repository, tests them together, opens the PRs and (with `--merge`) merges and publishes parents first. It needs `gh` logged in with push rights.

#### Before you start

Run it from the directory that holds all the checkouts, with each directory named after its repository (`iceberg.mojo`, `orca.mojo`, ...). The release builds from the **local** checkouts, so a stale one silently leaves merged work out of the release. Pull every involved checkout first:

```sh
export TMPDIR=/Volumes/ExtNVMe/tmp
cd /Volumes/ExtNVMe/dev/magmalake
for r in dista.mojo parquet.mojo iceberg.mojo orca.mojo; do git -C $r pull --ff-only; done
shelf --version                                  # 0.8.0 or later
```

Tin names are the registry's, which differ from the directory names. Check one with `curl -s https://mojoshelf.org/api/tins/<name>`: it lists each version and its `commit_sha`. The ones you will use: `parquet-mojo` (and `parquet-full-mojo`, released together with it from the same repository), `iceberg-mojo`, `orca-mojo`, `dista-mojo`; the rest are listed on [the tins page](/tins).

#### Plan, then apply

`plan` changes nothing: it prints the tins to release, in order, with their versions and every pin that moves, and for each tin the changelog fragments it will release with their levels. Read it. A tin you did not name appears when it depends on one you did. A tin's bump is the highest of its fragments' levels (patch when there are none); a repository still on `## Unreleased` gets it from that section's headings instead. Override per tin:

```sh
shelf release plan orca-mojo --bump orca-mojo=minor
shelf release plan --changed                    # every checked-out tin with commits since its release
```

`plan` saves the plan it printed to `.shelf-plan.json`, beside `.shelf-release.json`. When the plan is right, apply it without repeating the tins or the bumps:

```sh
shelf release apply --wait --merge                # applies .shelf-plan.json
```

`apply` says which plan it is applying. If any repository's main has moved since the plan was made, it refuses: run `plan` again. This is new in shelf 0.9; with an older shelf, repeat the arguments (`shelf release apply orca-mojo --bump orca-mojo=minor --wait --merge`).

That cuts the branches, builds the release heads together (preflight), opens the PRs, polls their required checks (`--wait`), and merges and publishes each one once its pin on its parent is the parent's current release head (`--merge`). In each release commit the fragments are written into CHANGELOG.md under `## X.Y.Z - date` and deleted. State is kept in `.shelf-release.json`. Other flags worth knowing:

- `--resume`: after an interruption (laptop slept, a check failed and was fixed or rerun). It re-pins what sits below a branch that moved and carries on from the step that stopped.
- `--publish`: when you merged the PRs by hand, publish each merged release.
- `--waves`: one level of the graph at a time, each published before the next is cut. Slower, easier to follow when the cascade is large.
- `--test`: run each tin's `test` task in preflight. `--skip-preflight` skips the combined build; avoid it.
- `--without <tin>`: leave a tin out, its dependents keep its published version. `--repo name=path`: a checkout somewhere else.
- `--allow-mismatch` (new in 0.7.0): release even when a dependent pins, or checks out in CI, a tin *outside* the cascade at a different commit than its parents pin it at. A mismatch means two tins would be built against two versions of a third. Use the flag only after you have looked at which tin and why and decided the difference is harmless; otherwise add that tin to the cascade or re-pin it.

**The rule:** a package dependency's `rev` must equal the commit the registry published for that version. A rev that was never published builds on your machine and breaks for everyone else.

#### After a release

```sh
curl -s https://mojoshelf.org/api/tins/orca-mojo | head -c 600       # newest version, commit_sha
for r in dista.mojo parquet.mojo iceberg.mojo orca.mojo; do
  echo $r; gh run list -R magmalake/$r --branch main -L 1
done
```

Each released repository's main must be green (a release merge triggers a full CI run on main). Then re-pin the consumers. `mojo-census/pixi.toml` pins `dista-mojo`, `parquet-full-mojo`, `iceberg-mojo`, `orca-mojo` and the rest by `rev`; set each to the published commit, regenerate the lock, and open a PR as in the first section:

```sh
cd mojo-census && git checkout -b repin
$EDITOR pixi.toml            # each rev = commit_sha from the registry
pixi lock
```

#### When a release goes wrong

- **CI breaks on a sibling after the release.** On 2026-11-06 orca's CI checked parquet out at a stale sha, because the workflow pins its sibling repositories separately from `pixi.toml`. shelf 0.7.0 moves those refs in a release. If CI is red anyway, open `.github/workflows/ci.yml` and compare every sibling `actions/checkout` `ref:` with the registry's commit for that tin; fix it in a PR.
- **A PR check fails mid-cascade.** Fix or rerun it (see [flaky tests](#flaky)), then `shelf release apply ... --wait --merge --resume` with the same arguments.
- **Pins stop being its parent's head.** Something merged to a parent while you waited. `--resume` re-pins; if it still refuses, start again from `plan` after pulling.
- **Merged by hand.** `shelf release apply <tins> --publish`.

### Releasing the shelf CLI

The CLI lives in [mojoshelf](https://github.com/mojoshelf/mojoshelf), with its own procedure. Work in a clean checkout.

1. Bump the version in **all four** places: `crates/mojoshelf/Cargo.toml`, `Cargo.lock` (`cargo update -p mojoshelf`), `pixi.toml` and `recipe.yaml`. recipe.yaml was missed once and the package built under the old version.
2. Do not commit a stray `pixi.lock` that a local build produced.
3. Open a PR titled "Release CLI X.Y.Z", wait for green, merge it.
4. Tag the merge commit and push the tag:

   ```sh
   git checkout main && git pull --ff-only
   git tag cli-v0.8.1 && git push origin cli-v0.8.1
   ```
5. The `release-cli` workflow builds the package for three platforms, reindexes the channel under `crates/shelf-worker/public/channel` and commits it to main (`gh run watch`). Pull main afterwards.
6. The workflow's "Deploy Worker" step is **skipped** unless the repository has a `CLOUDFLARE_API_TOKEN` secret (not set yet: [mojoshelf #39](https://github.com/mojoshelf/mojoshelf/issues/39)). Until it is, deploy by hand from an up-to-date main, which has the channel commit, with `wrangler` logged in to the account that owns mojoshelf.org. If the release added a D1 migration, apply it first, because `wrangler deploy` does not (see `OPERATIONS.md`):

   ```sh
   cd crates/shelf-worker
   npx wrangler d1 migrations list mojoshelf --remote     # what is pending
   npx wrangler d1 migrations apply mojoshelf --remote    # only if something is
   npx wrangler deploy
   ```
7. Verify that the channel serves it:

   ```sh
   pixi global update mojoshelf && shelf --version
   ```

### Where things are

| Repository | What it is |
|---|---|
| [morca-dev/morca](https://github.com/morca-dev/morca) | Morca, the orchestrator, formerly magmalake/orca.mojo. Tin `orca-mojo`. Its own site is [morca.dev](https://morca.dev). |
| [morca-dev/census](https://github.com/morca-dev/census) | The census behind [mojourney.dev](https://mojourney.dev): three pipelines and the console. Pins every library by commit in `pixi.toml`; not a tin. |
| [magmalake/iceberg.mojo](https://github.com/magmalake/iceberg.mojo) | Iceberg tables, reads and writes. Tin `iceberg-mojo`. |
| [magmalake/parquet.mojo](https://github.com/magmalake/parquet.mojo) | Parquet reader and writer; `full/` adds the compression codecs. Tins `parquet-mojo`, `parquet-full-mojo`. |
| [morca-dev/dista](https://github.com/morca-dev/dista) | Distributed tasks and actors, formerly magmalake/dista.mojo. Tin `dista-mojo`. |
| [mojoshelf/mojoshelf](https://github.com/mojoshelf/mojoshelf) | The registry (a Cloudflare Worker plus D1), the `shelf` CLI and the conda channel. `OPERATIONS.md` has the Worker's secrets, deploy and database steps. It is in the *mojoshelf* organisation, not magmalake. |
| [magmalake/magmalake.org](https://github.com/magmalake/magmalake.org) | This site. |

The other tins (objectstore, threads, postgres, zstd and so on) are repositories in the same organisation, named like their tin; the registry lists them all. Issues are tracked per repository, in each one's Issues tab. There are no priority labels, so read the open issues list as it is, and the `release` label where a repository has one. Pull requests are the other queue: `gh pr list -R magmalake/iceberg.mojo`.

## Conventions

No JavaScript framework, no CSS framework. Two inline scripts — the theme toggle and the
PostHog init (see [Analytics](#analytics)) — plus PostHog's own deferred `array.js`. Fonts
come from Google Fonts; everything else is self-hosted. The build must stay static: `npm run
build` produces a plain `dist/` of HTML and CSS.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

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
```

Every tin gets its own small section at `/s/<tin>`, generated from `src/data/tins.ts`:
an overview, `/docs` (its Markdown in `src/content/tindocs/<tin>.md`) and, when
`src/data/perf.ts` or the tin has numbers or notes for it, `/performance`. Their header
and footer are `SectionNav` and `SectionFooter`, the same ones Orca's and Dista's pages
use, and the list of a tin's pages is `tinLinks` in `src/data/tinpages.ts`: add a page
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

Every `pixi shelf add <tin>` on a tin's overview, in its tindocs Markdown, in Orca's and
Dista's docs and in getting started has a second tab beside it: the same install with
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
each tin's header (and Orca's and Dista's), which is scoped to that tin.

`src/layouts/Base.astro` handles indexing for every page, from `src/data/search.ts`:

- only `<main>` is indexed (`data-pagefind-body`), so headers and footers are left out;
- each page is filed under a `section` filter (Start here, Orca, Dista, Tins or Blog), and a
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

## Conventions

No JavaScript framework, no CSS framework. Two inline scripts — the theme toggle and the
PostHog init (see [Analytics](#analytics)) — plus PostHog's own deferred `array.js`. Fonts
come from Google Fonts; everything else is self-hosted. The build must stay static: `npm run
build` produces a plain `dist/` of HTML and CSS.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

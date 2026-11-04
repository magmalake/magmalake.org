# magmalake.org

The project website for [magmalake](https://github.com/magmalake) — data lake building
blocks in Mojo — live at [magmalake.org](https://magmalake.org). A static
[Astro](https://astro.build) site, deployed to Cloudflare Workers static assets.

## Develop

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # static output in dist/
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
  data/tins.ts          the twelve tins: description, oracle, version, repo
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

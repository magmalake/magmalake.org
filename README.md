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
  data/tins.ts          the twelve tins: description, oracle, version, repo
  data/perf.ts          benchmark rows and the four optimisation passes
  data/site.ts          site-wide constants (currently: the PostHog project key)
  layouts/Base.astro    <head>, fonts, theme bootstrap, nav + footer, PostHog snippet
  components/           Hero, Nav, Footer, Logo, StackDiagram, TinCard, PerfTable
  pages/index.astro     the whole landing page
  pages/404.astro       not-found page (served by not_found_handling: "404-page")
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

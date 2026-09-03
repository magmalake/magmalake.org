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
  styles/global.css     design tokens, light/dark palettes, layout primitives
public/                 favicon, robots.txt
worker/posthog-proxy.js first-party PostHog reverse proxy, served at /ph/* only
```

Content lives in `src/data/*.ts`, so updating a version number or a benchmark is a one-line
change in one file rather than a hunt through markup.

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

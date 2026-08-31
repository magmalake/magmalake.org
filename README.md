# magmalake.org

The project website for [magmalake](https://github.com/magmalake) — data lake building
blocks in Mojo. A static [Astro](https://astro.build) site, deployed to Cloudflare Workers
static assets.

## Develop

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # static output in dist/
npm run preview    # serve dist/ locally
```

## Deploy

The site is an **assets-only Cloudflare Worker** — `wrangler.jsonc` declares
`assets.directory = "./dist"` and no `main`, so every request is served straight from the
uploaded files with no Worker invocation.

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
  layouts/Base.astro    <head>, fonts, theme bootstrap, nav + footer
  components/           Hero, Nav, Footer, Logo, StackDiagram, TinCard, PerfTable
  pages/index.astro     the whole landing page
  pages/404.astro       not-found page (served by not_found_handling: "404-page")
  styles/global.css     design tokens, light/dark palettes, layout primitives
public/                 favicon, robots.txt
```

Content lives in `src/data/*.ts`, so updating a version number or a benchmark is a one-line
change in one file rather than a hunt through markup.

## Conventions

No JavaScript framework, no CSS framework. One inline script — the theme toggle. Fonts come
from Google Fonts; everything else is self-hosted. The build must stay static: `npm run
build` produces a plain `dist/` of HTML and CSS.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

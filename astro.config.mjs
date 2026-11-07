// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import agentMarkdown from "./src/integrations/agent-markdown.mjs";
import installTabs from "./src/integrations/install-tabs.mjs";
import { shikiOptions } from "./src/integrations/shiki.mjs";

/** A tin's API reference, /s/<tin>/api and its module pages. */
const isApi = (path) => /^\/s\/[^/]+\/api(\/|$)/.test(path);

// Static output: `npm run build` emits a plain `dist/` of HTML/CSS that is
// uploaded verbatim by Cloudflare Workers static assets (see wrangler.jsonc).
export default defineConfig({
  // Canonical, and therefore what every canonical link and every sitemap entry
  // says. magmalake.org 301s here (wrangler.redirect.jsonc), so this has to
  // agree with the redirect: a canonical pointing at a URL that redirects away
  // is a contradiction, and a search engine resolves it by guessing.
  site: "https://magmalake.dev",
  output: "static",
  trailingSlash: "ignore",
  // A tindoc's `pixi shelf add` block gets a plain-pixi tab beside it.
  // Fences are coloured at build time with Shiki, in both themes at once.
  markdown: { remarkPlugins: [installTabs], shikiConfig: shikiOptions },
  integrations: [
    sitemap(),
    // A Markdown twin of every page, /llms.txt and /llms-full.txt; see the
    // README's "Markdown for agents" and the integration's own comment.
    agentMarkdown({
      name: "magmalake",
      summary:
        "Data pipelines in Mojo: Orca schedules them, Dista runs them across a cluster, and a native Iceberg, Parquet and codec stack, published as tins on mojoshelf, reads and writes the data. No Python or JVM in the path.",
      intro: [
        "Every page below is the Markdown twin of a page on https://magmalake.dev: the same URL with .md appended (the home page is /index.md). /llms-full.txt has them all in one file.",
      ],
      titleSuffix: " — magmalake",
      exclude: (path) => path === "/404" || path === "/search" || path.startsWith("/admin"),
      // A tin's API reference is long (flare's alone runs to megabytes) and
      // has its own twins; llms.txt lists it, llms-full.txt leaves it out.
      excludeFromFull: isApi,
      sections: [
        { title: "Start here", match: (p) => p === "/" || p.startsWith("/getting-started") },
        { title: "Orca", match: (p) => p.startsWith("/s/orca") && !isApi(p) },
        { title: "Dista", match: (p) => p.startsWith("/s/dista") && !isApi(p) },
        {
          title: "Tins",
          match: (p) => p === "/tins" || p === "/performance" || (p.startsWith("/s/") && !isApi(p)),
        },
        { title: "Blog", match: (p) => p.startsWith("/blog") },
        { title: "Each tin's API reference", match: isApi, optional: true },
      ],
    }),
  ],
  build: {
    // Emit /about/index.html style pages so Workers static assets can serve
    // both /about and /about/ without a Worker in the path.
    format: "directory",
    inlineStylesheets: "auto",
  },
  devToolbar: { enabled: false },
});

// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

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
  integrations: [sitemap()],
  build: {
    // Emit /about/index.html style pages so Workers static assets can serve
    // both /about and /about/ without a Worker in the path.
    format: "directory",
    inlineStylesheets: "auto",
  },
  devToolbar: { enabled: false },
});

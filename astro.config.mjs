// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// Static output: `npm run build` emits a plain `dist/` of HTML/CSS that is
// uploaded verbatim by Cloudflare Workers static assets (see wrangler.jsonc).
export default defineConfig({
  site: "https://magmalake.org",
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

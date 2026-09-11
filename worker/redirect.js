// magmalake.org -> magmalake.dev, permanently, path and query intact.
//
// Its own Worker rather than a branch inside posthog-proxy.js, because the
// assets Worker runs only for `/ph/*` (see `run_worker_first` in
// wrangler.jsonc) and a redirect has to answer every path. Making that Worker
// answer everything would put an invocation in front of magmalake.dev too —
// paying on the canonical domain to redirect the legacy one, which is the
// wrong way round. This way the cost lands only where the redirect does.
//
// Deployed from wrangler.redirect.jsonc, which owns the .org custom domains.

/** Where everything goes. Also `site` in astro.config.mjs, which is what makes
 *  the canonical links agree with the redirect rather than contradict it. */
const TARGET = "magmalake.dev";

export default {
  /**
   * @param {Request} request
   * @returns {Response}
   */
  fetch(request) {
    const url = new URL(request.url);
    url.hostname = TARGET;
    // `www` goes too: the redirect is to one host, not to whichever spelling
    // the reader happened to type.
    url.protocol = "https:";
    url.port = "";

    // 301 rather than 302. A temporary redirect keeps search engines indexing
    // the old host and splits the site between two names indefinitely, which
    // is the thing this is meant to end. `Location` carries the whole URL, so
    // /a/b/c?q=1#frag arrives as /a/b/c?q=1#frag.
    return Response.redirect(url.toString(), 301);
  },
};

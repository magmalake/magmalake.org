// Reverse proxy for PostHog so analytics requests stay first-party
// (ad-blockers drop *.posthog.com). `/ph/static/*` goes to the assets
// host, everything else to US ingestion. Cookies never leave our domain;
// the client IP is forwarded so events geolocate correctly.
//
// `wrangler.jsonc` restricts this Worker to `/ph/*` via
// `assets.run_worker_first`, so every other request is served straight
// from `dist/` with no Worker in the path. Ported 1:1 from the Rust
// proxy in mojoshelf (crates/shelf-worker/src/lib.rs, `posthog_proxy`).

export default {
  async fetch(request) {
    const url = new URL(request.url);
    // Strip the leading "/ph/" to get PostHog's own path, e.g.
    // "static/array.js" or "i/v0/e/".
    const path = url.pathname.replace(/^\/ph\//, "");
    const upstream = path.startsWith("static/")
      ? `https://us-assets.i.posthog.com/${path}`
      : `https://us.i.posthog.com/${path}`;
    const target = url.search ? `${upstream}${url.search}` : upstream;

    const headers = new Headers(request.headers);
    headers.delete("cookie");
    const ip = request.headers.get("cf-connecting-ip");
    if (ip) headers.set("x-forwarded-for", ip);

    const init = {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    };
    if (init.body) init.duplex = "half";

    const upstreamResponse = await fetch(target, init);

    // Pass the upstream response through unchanged.
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: upstreamResponse.headers,
    });
  },
};

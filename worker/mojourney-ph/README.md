# mojourney-ph

First-party PostHog proxy for the **mojourney.dev** zone: the census console
(`mojourney.dev`) and the orca UI (`orca.mojourney.dev`). Both are Mojo HTTP
servers behind a Cloudflare Tunnel, so nothing else in front of them can serve
`/ph/*`. This Worker reuses `worker/posthog-proxy.js` unchanged: `/ph/static/*`
goes to `us-assets.i.posthog.com`, the rest to `us.i.posthog.com`, cookies are
stripped and `x-forwarded-for` is set from `cf-connecting-ip`.

It has zone routes on `mojourney.dev/ph/*` and `orca.mojourney.dev/ph/*` only,
no assets and no `workers.dev` subdomain. Both hostnames must be proxied
(orange cloud) DNS records in the zone, which the tunnel's CNAMEs already are.

## Deploy

From the repository root, after `npm ci`:

```sh
npx wrangler deploy -c worker/mojourney-ph/wrangler.jsonc
```

It is separate from the website: `npm run deploy` and a plain
`npx wrangler deploy` use the root `wrangler.jsonc` and never pick this up.

## Check

```sh
curl -sI https://mojourney.dev/ph/static/array.js        # 200, from PostHog's CDN
curl -sI https://orca.mojourney.dev/ph/static/array.js   # same
```

Then open either site with its key set (`POSTHOG_KEY` for the console,
`ORCA_POSTHOG_KEY` for orca) and look for `$pageview` events under
*Activity* in PostHog, filtered by the `site` property (`mojourney` or `orca`).

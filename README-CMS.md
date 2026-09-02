# Editing posts with Sveltia CMS

Posts live in `src/content/blog/*.md` and can be edited by hand or through
[Sveltia CMS](https://sveltiacms.app) at `/admin` — which works on a phone,
which is the point.

The CMS is wired up in this repository, but **it cannot sign you in until the
authenticator below exists**. Two one-time steps, both yours to do: they need
a GitHub OAuth app and a Cloudflare account, and the client secret must not
pass through anyone else's hands.

## 1. Deploy the authenticator first

Sveltia runs no hosted OAuth service on purpose — the secret stays yours.
[`sveltia/sveltia-cms-auth`](https://github.com/sveltia/sveltia-cms-auth) is a
Cloudflare Worker that does the token exchange and nothing else.

Deploy before registering the OAuth app: the app needs a callback URL, and you
do not know the worker's URL until it exists.

```sh
git clone https://github.com/sveltia/sveltia-cms-auth
cd sveltia-cms-auth
npx wrangler deploy
```

`wrangler deploy` prints the URL, of the form
`https://sveltia-cms-auth.<subdomain>.workers.dev`. That `<subdomain>` is your
account's workers.dev subdomain — the same for every worker you deploy, and
visible in the Cloudflare dashboard under Workers & Pages. Write the URL down;
the next two steps both need it.

## 2. Register a GitHub OAuth app

<https://github.com/settings/developers> → **New OAuth App**

| Field | Value |
|---|---|
| Application name | `magmalake CMS` |
| Homepage URL | `https://magmalake.org` |
| Authorization callback URL | the URL from step 1, plus `/callback` |

So if step 1 printed `https://sveltia-cms-auth.example.workers.dev`, the
callback is `https://sveltia-cms-auth.example.workers.dev/callback` — a real
host, not a placeholder.

Keep the **Client ID** and generate a **Client secret**, then give them to the
worker:

```sh
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
# Stops anyone else's site using your authenticator:
npx wrangler secret put ALLOWED_DOMAINS   # magmalake.org
```

## 3. Point the CMS at the worker

Set `base_url` in `public/admin/config.yml` to the step 1 URL, no trailing
slash and no `/callback`. It currently reads:

```yaml
base_url: https://magmalake-cms-auth.mseritan.workers.dev
```

which is a **guess** at both the worker name and the subdomain. Replace it
with what `wrangler deploy` actually printed, then commit and push.

## 3. Use it

Go to <https://magmalake.org/admin>, sign in with GitHub, write. Saving
commits straight to `main`, and Cloudflare rebuilds the site.

To review changes before they go live instead, set `publish_mode: editorial_workflow`
in the config; each save then opens a pull request rather than committing.

## Keeping the schema in step

`public/admin/config.yml` and `src/content.config.ts` describe the same
frontmatter twice — the CMS form on one side, the build-time validation on the
other. Nothing enforces that they agree, so a field added to one and not the
other produces either a form you cannot save or a post the build rejects.
Change both together.

## Images

`media_folder: public/media` means uploads land in the repository and are
served from `/media/...`. That is fine for the occasional diagram; anything
heavier belongs somewhere that is not git.

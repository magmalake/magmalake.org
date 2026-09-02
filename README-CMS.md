# Editing posts with Sveltia CMS

Posts live in `src/content/blog/*.md` and can be edited by hand or through
[Sveltia CMS](https://sveltiacms.app) at `/admin` — which works on a phone,
which is the point.

The CMS is wired up in this repository, but **it cannot sign you in until the
authenticator below exists**. Two one-time steps, both yours to do: they need
a GitHub OAuth app and a Cloudflare account, and the client secret must not
pass through anyone else's hands.

## 1. Register a GitHub OAuth app

<https://github.com/settings/developers> → **New OAuth App**

| Field | Value |
|---|---|
| Application name | `magmalake CMS` |
| Homepage URL | `https://magmalake.org` |
| Authorization callback URL | `https://magmalake-cms-auth.<your-subdomain>.workers.dev/callback` |

Keep the **Client ID** and generate a **Client secret**. The callback host must
match the worker you deploy next, so pick the worker name first if you want
something other than `magmalake-cms-auth`.

## 2. Deploy the authenticator

Sveltia runs no hosted OAuth service on purpose — the secret stays yours.
[`sveltia/sveltia-cms-auth`](https://github.com/sveltia/sveltia-cms-auth) is a
Cloudflare Worker that does the token exchange and nothing else.

```sh
git clone https://github.com/sveltia/sveltia-cms-auth
cd sveltia-cms-auth
npx wrangler deploy

npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
# Restrict which sites may use this authenticator:
npx wrangler secret put ALLOWED_DOMAINS   # magmalake.org
```

Then set `base_url` in `public/admin/config.yml` to the deployed worker's URL,
without a trailing slash. It is currently:

```yaml
base_url: https://magmalake-cms-auth.mseritan.workers.dev
```

which is a guess at the subdomain — correct it to whatever `wrangler deploy`
prints.

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

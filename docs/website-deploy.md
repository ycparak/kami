# Website Deploy

The marketing website lives in `apps/website/` and deploys to a Cloudflare Worker service named `kami`.

## Configuration

- Worker config: `wrangler.jsonc`
- Worker name: `kami`
- Static assets directory: `apps/website/dist/client`
- Production URL: `https://kami.yusufparak.com`

The Worker name in Cloudflare must match `name` in `wrangler.jsonc` so local deploys update the intended service.

## First Deploy

Nothing has been deployed under this identity yet. Before the first `wrangler deploy`:

- Log into the Cloudflare account that will own the `kami` Worker (see below). `wrangler deploy` creates the Worker on first run if it doesn't exist.
- Point the `kami.yusufparak.com` DNS/route at the Worker in the Cloudflare dashboard (Workers & Pages → the `kami` Worker → Triggers → Custom Domains).

## Deploy Locally

Deploys are run manually from a local machine using Wrangler CLI. From the repository root:

```sh
vp install
vp run website#build
vp dlx wrangler deploy --config wrangler.jsonc
```

Wrangler must be logged into the Cloudflare account that owns (or will own) `kami`:

```sh
vp dlx wrangler login
```

Verify the deployment:

```sh
curl -I https://kami.yusufparak.com
```

## Notes

- Do not use GitHub Pages for this website.
- Do not rely on Cloudflare Git Builds for this website unless this document is updated first.
- Keep `wrangler.jsonc` at the repository root so local Wrangler deploys use the same Worker settings.
- Run `vp check` before deploying source changes when practical.

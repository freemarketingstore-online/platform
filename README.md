# FreeMarketingStore Platform

FreeMarketingStore is a Cloudflare Pages PWA for free marketing tools and website health monitoring.

Live site: https://freemarketingstore.pages.dev/

## Current Product Surface

- Public tool store with 22 browser-first marketing tools.
- PWA console at `/console/`.
- Audited sites list at `/console/sites/`.
- Website audit app at `/seo/site-audit/`.
- Search Console integration screen at `/console/search-console/`.
- Server-side audit API at `/api/audit`.

## Website Audit

The audit API accepts a public URL or bare domain and returns a structured report for:

- Crawlability and indexing basics.
- `robots.txt` and sitemap availability.
- Title, meta description, canonical URL, headings, Open Graph, and JSON-LD.
- Homepage response time, HTML size, assets, internal links, and broken sampled resources.
- Security headers, HTTPS, mixed content, insecure form actions, and privacy-adjacent third-party host signals.
- Accessibility basics such as `html lang`, image alt coverage, and heading outline.
- PWA/web-app basics such as manifest detection, display mode, icons, and service-worker registration hints.

Reports are currently stored in browser `localStorage` under `fms-site-audit-sites-v1`. Account-backed storage is the next maturity step.

## Search Console and Cloudflare Verification

The Search Console scaffold is deployed but intentionally does not persist Google tokens yet.

Implemented endpoints:

- `GET /api/search-console/status`
- `GET /api/search-console/oauth/start`
- `GET /api/search-console/oauth/callback`
- `POST /api/search-console/inspect`
- `POST /api/search-console/verify-domain`

Automatic verification flow:

1. User signs in with Google OAuth.
2. FMS asks Google Site Verification for a `DNS_TXT` token.
3. FMS creates the TXT record in the matching Cloudflare DNS zone.
4. FMS asks Google to verify the domain.
5. FMS can then import URL Inspection results for verified Search Console properties.

Required Cloudflare Pages environment variables:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` or the default `/api/search-console/oauth/callback`
- `CLOUDFLARE_API_TOKEN` with `Zone:Read` and `DNS:Edit`
- A future durable store binding such as D1 or KV for sessions, profiles, refresh tokens, sites, audit history, and imported Search Console state

See [docs/search-console-cloudflare.md](docs/search-console-cloudflare.md).

## Local Development

Build the Pages artifact:

```sh
rm -rf .deploy
mkdir .deploy
cp -R store/. .deploy/
wrangler pages functions build functions \
  --outdir .deploy \
  --build-output-directory .deploy \
  --project-directory .
```

Run locally:

```sh
wrangler pages dev .deploy --ip 127.0.0.1 --port 8789
```

Quick checks:

```sh
git diff --check
node -e "JSON.parse(require('fs').readFileSync('store/manifest.webmanifest','utf8'))"
for f in functions/api/**/*.js functions/api/*.js; do node --check "$f" || exit 1; done
```

## Deployment

CI/CD is handled by GitHub Actions in `.github/workflows/deploy-pages.yml`.

Pushes to `main` deploy to Cloudflare Pages project `freemarketingstore` and smoke test:

- `/`
- `/console/`
- `/console/search-console/`
- `/seo/site-audit/`
- `/sitemap.xml`
- `/api/search-console/status`
- `/api/audit?url=https%3A%2F%2Ffreemarketingstore.pages.dev%2F`

## Next Platform Work

- Add profile sign-in and durable session storage.
- Store audited sites, history, Search Console imports, and alert state server-side.
- Encrypt Google refresh tokens at rest.
- Add scheduled audits and issue notifications.
- Add a per-site dashboard that combines local crawl health, Search Console indexing status, sitemap status, and change history.

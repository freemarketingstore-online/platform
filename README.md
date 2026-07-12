# FreeMarketingStore Platform

FreeMarketingStore is a Cloudflare Pages PWA for free marketing tools and website health monitoring.

Live site: https://freemarketingstore.pages.dev/

## Repository Structure

FMS is a single workspace repo. Public, crawlable pages stay static under `store/`; the authenticated/operational console is a React/Vite PWA built from `console/web` into `store/console`; Cloudflare Pages Functions stay under `functions`.

```text
console/web/          React/Vite source for /console/*
functions/            Cloudflare Pages Functions APIs
packages/shared/      Shared routes, storage keys, and domain types
packages/audit-core/  Shared audit scoring/counting helpers
store/                Public static Pages output and SEO-facing tools
schema.sql            D1 schema for profiles, sessions, sites, and audits
docs/                 Product and operating docs
```

## Current Product Surface

- Public tool store with 22 browser-first marketing tools.
- React PWA console at `/console/`.
- Free profile route at `/console/profile/`.
- Audited sites route at `/console/sites/`.
- Website audit app at `/console/audit/`.
- Search Console integration route at `/console/search-console/`.
- Server-side audit API at `/api/audit`.
- Free account APIs under `/api/auth/*`, `/api/profile/status`, and `/api/sites`.

## Free Account Foundation

FMS sign-in is free and stores diagnostic state only. Campaign execution remains PMS.

Implemented account pieces:

- Google sign-in start/callback endpoints.
- Signed HTTP-only session cookie.
- D1 schema for users, sessions, sites, and audits.
- Auth status endpoint.
- Server-backed sites list.
- Server-backed audit persistence after a signed-in audit run.
- Local browser storage fallback when account storage is not configured.
- Local site import into a signed-in profile.

Required bindings/secrets:

- `FMS_DB` or `DB`: D1 binding using `schema.sql`.
- `FMS_SESSION_SIGNING_KEY`: secret used to sign session cookies and OAuth state.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: Google OAuth credentials.
- Optional `GOOGLE_AUTH_REDIRECT_URI`, otherwise `/api/auth/google/callback` is used.

## Website Audit

The audit API accepts a public URL or bare domain and returns a structured report for:

- Crawlability and indexing basics.
- `robots.txt` and sitemap availability.
- Title, meta description, canonical URL, headings, Open Graph, and JSON-LD.
- Homepage response time, HTML size, assets, internal links, and broken sampled resources.
- Security headers, HTTPS, mixed content, insecure form actions, and privacy-adjacent third-party host signals.
- Accessibility basics such as `html lang`, image alt coverage, and heading outline.
- PWA/web-app basics such as manifest detection, display mode, icons, and service-worker registration hints.

Anonymous reports are stored in browser `localStorage` under `fms-site-audit-sites-v1`. Signed-in reports are persisted to D1.

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

## Product Boundary

FMS can have free sign-in. The boundary is not account vs no account; it is diagnostics vs execution.

- FMS free accounts store sites, audit history, Search Console setup, issue prompts, and marketing readiness dashboards.
- PMS pro accounts run campaigns, publish posts, send emails, connect execution channels, and optimize based on campaign metrics.

See [docs/product-boundary.md](docs/product-boundary.md).

## Local Development

Build the Pages artifact:

```sh
corepack enable
pnpm install
pnpm build:pages
```

Run locally:

```sh
pnpm dev:pages
```

Quick checks:

```sh
git diff --check
pnpm check
```

## Deployment

CI/CD is handled by GitHub Actions in `.github/workflows/deploy-pages.yml`.

Pushes to `main` deploy to Cloudflare Pages project `freemarketingstore` and smoke test:

- `/`
- `/console/`
- `/console/profile/`
- `/console/search-console/`
- `/docs/`
- `/console/audit/`
- `/sitemap.xml`
- `/api/auth/status`
- `/api/profile/status`
- `/api/search-console/status`
- `/api/audit?url=https%3A%2F%2Ffreemarketingstore.pages.dev%2F`

## Next Platform Work

- Configure production D1 and Google OAuth secrets.
- Store Search Console imports and alert state server-side.
- Encrypt Google refresh tokens at rest.
- Add scheduled audits and issue notifications.
- Add a per-site dashboard that combines local crawl health, Search Console indexing status, sitemap status, and change history.

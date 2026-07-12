# Website Audit Model

The website audit combines direct server-side crawling with structured issue generation and AI-ready fix prompts.

## Inputs

`GET /api/audit?url=<public-url-or-domain>`

The API accepts public `http` and `https` URLs. Local and private network targets are rejected.

## Report Sections

The `health.sections` object currently includes:

- `crawlability`
- `performance`
- `security`
- `metadata`
- `accessibility`
- `quality`
- `application`

Each section has:

- `label`
- `score`
- `status`
- `checks`

Checks use `pass`, `warn`, `fail`, or `info`.

## Issue Model

Each issue includes:

- `severity`
- `category`
- `title`
- `detail`
- `fix`
- `aiPrompt`

The prompt is written so it can be handed to an implementation agent for the affected website.

## Known Limits

- The crawler intentionally samples assets and internal links instead of crawling the full site.
- Browser-only Lighthouse metrics are not implemented yet.
- Search Console indexing status is not imported until Google OAuth/session storage is complete.
- Accessibility checks are basic static checks, not a substitute for a full automated and manual accessibility review.

## Persistence

Anonymous audits continue to save in browser `localStorage`.

When FMS account storage is configured and the user is signed in, new audit reports are also persisted through:

- `POST /api/sites/audits`
- D1 `sites`
- D1 `audits`

The signed-in sites dashboard reads from `GET /api/sites`.

## Next Checks to Add

- Full sitemap URL sampling with per-URL status.
- Redirect chain details.
- Canonical target fetch validation.
- Larger internal-link crawl with configurable depth.
- Lighthouse or browser-based Core Web Vitals approximation.
- SSL certificate expiry and DNS diagnostics.
- Content freshness and duplicate title/description checks across sampled pages.

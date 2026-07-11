# Search Console and Cloudflare DNS Verification

This document describes the intended production flow for connecting Google Search Console and automatically verifying domains through Cloudflare DNS.

## Goal

For a domain such as `freegamestore.online`, FreeMarketingStore should be able to:

1. Confirm the user controls the Google account that will own the Search Console property.
2. Confirm the domain DNS is managed in Cloudflare.
3. Add the Google verification TXT record automatically.
4. Ask Google to verify the property.
5. Use Search Console APIs to show indexing and URL Inspection status in the site health dashboard.

## Current Implementation

The app currently ships:

- Search Console UI: `/console/search-console/`
- Platform status endpoint: `GET /api/search-console/status`
- OAuth start endpoint: `GET /api/search-console/oauth/start`
- OAuth callback endpoint: `GET /api/search-console/oauth/callback`
- URL Inspection proxy endpoint: `POST /api/search-console/inspect`
- Cloudflare DNS verification endpoint: `POST /api/search-console/verify-domain`

The callback can prove that Google OAuth is wired, but it discards tokens because durable profile/session storage has not been added yet.

## Required Runtime Configuration

Cloudflare Pages environment variables:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `CLOUDFLARE_API_TOKEN`

Cloudflare token permissions:

- `Zone:Read`
- `DNS:Edit`

Recommended next bindings:

- D1 database for users, sites, audit history, Search Console imports, and job state.
- KV or Durable Object session storage for short-lived auth/session state.
- Secret used for encrypting OAuth refresh tokens.

## Endpoint Contracts

### `GET /api/search-console/status`

Returns which platform capabilities are configured:

```json
{
  "google": {
    "oauthConfigured": false,
    "tokenExchangeConfigured": false,
    "redirectUri": "https://freemarketingstore.pages.dev/api/search-console/oauth/callback"
  },
  "cloudflare": {
    "dnsAutomationConfigured": false
  },
  "capabilities": {
    "automaticDnsVerification": false,
    "persistedProfiles": false
  }
}
```

### `POST /api/search-console/inspect`

Temporary developer shape until server-side sessions exist:

```http
POST /api/search-console/inspect
Authorization: Bearer <google-access-token>
Content-Type: application/json
```

```json
{
  "inspectionUrl": "https://freegamestore.online/",
  "siteUrl": "sc-domain:freegamestore.online"
}
```

### `POST /api/search-console/verify-domain`

Temporary developer shape until server-side sessions exist:

```http
POST /api/search-console/verify-domain
Authorization: Bearer <google-access-token>
Content-Type: application/json
```

```json
{
  "domain": "freegamestore.online"
}
```

The endpoint:

1. Finds the matching active Cloudflare zone.
2. Requests a Google `DNS_TXT` verification token.
3. Creates a TXT record in Cloudflare.
4. Calls Google Site Verification.
5. Returns `200` if verified immediately or `202` if DNS propagation needs a retry.

## Production Hardening Required

Before enabling this as a normal user-facing flow:

- Add real profile sign-in.
- Store OAuth refresh tokens only server-side.
- Encrypt refresh tokens at rest.
- Add OAuth `state` validation backed by session storage.
- Add retry handling for DNS propagation.
- Prevent duplicate TXT records for the same Google token.
- Add per-domain ownership records and audit logs.
- Add revoke/disconnect flow.
- Add Search Console property listing and import job scheduling.

## User-Facing Interpretation

Search Console status should be shown as a separate signal from crawl health.

- Crawl health answers: can FMS fetch and inspect the public site now?
- Search Console answers: does Google know the property, can Google inspect URLs, and what indexing status does Google report?

Both should appear together in the mature site dashboard.

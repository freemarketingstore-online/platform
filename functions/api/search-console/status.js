const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
};

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/siteverification.verify_only',
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: JSON_HEADERS });
}

function redirectUri(request, env) {
  return env.GOOGLE_REDIRECT_URI || `${new URL(request.url).origin}/api/search-console/oauth/callback`;
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return new Response(null, { headers: JSON_HEADERS });
  if (context.request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const env = context.env || {};
  const googleClientId = Boolean(env.GOOGLE_CLIENT_ID);
  const googleClientSecret = Boolean(env.GOOGLE_CLIENT_SECRET);
  const cloudflareToken = Boolean(env.CLOUDFLARE_API_TOKEN);

  return json({
    google: {
      oauthConfigured: googleClientId,
      tokenExchangeConfigured: googleClientId && googleClientSecret,
      redirectUri: redirectUri(context.request, env),
      scopes: GOOGLE_SCOPES,
    },
    cloudflare: {
      dnsAutomationConfigured: cloudflareToken,
      requiredTokenPermissions: ['Zone:Read', 'DNS:Edit'],
    },
    capabilities: {
      oauthStart: googleClientId,
      urlInspection: googleClientId,
      automaticDnsVerification: googleClientId && googleClientSecret && cloudflareToken,
      persistedProfiles: Boolean(env.FMS_SESSIONS || env.FMS_DB || env.FMS_KV),
    },
    requiredConfiguration: [
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'GOOGLE_REDIRECT_URI or default /api/search-console/oauth/callback',
      'CLOUDFLARE_API_TOKEN with Zone:Read and DNS:Edit for owned zones',
      'FMS_SESSIONS, FMS_DB, or FMS_KV for durable account/profile storage',
    ],
  });
}

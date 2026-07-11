const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: JSON_HEADERS });
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return new Response(null, { headers: JSON_HEADERS });
  if (context.request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const env = context.env || {};
  const hasSessionSecret = Boolean(env.FMS_SESSION_SIGNING_KEY);
  const hasUserStore = Boolean(env.FMS_DB || env.FMS_KV || env.FMS_SESSIONS);
  const hasGoogleOAuth = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  return json({
    product: 'FreeMarketingStore',
    accountTier: 'free',
    profileConfigured: hasSessionSecret && hasUserStore,
    capabilities: {
      freeSignIn: hasSessionSecret && hasUserStore,
      savedSites: hasUserStore,
      auditHistory: hasUserStore,
      searchConsoleConnection: hasGoogleOAuth && hasUserStore,
      campaignExecution: false,
      socialPublishing: false,
      emailSending: false,
    },
    currentStorage: hasUserStore ? 'server' : 'browser-localStorage',
    requiredConfiguration: [
      'FMS_SESSION_SIGNING_KEY',
      'FMS_DB, FMS_KV, or FMS_SESSIONS',
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET for Google/Search Console sign-in',
    ],
    boundary: {
      fms: 'Free account for saved sites, audits, Search Console setup, and marketing readiness.',
      pms: 'Paid account for campaign execution, publishing, sending, analytics, and optimization.',
    },
  });
}

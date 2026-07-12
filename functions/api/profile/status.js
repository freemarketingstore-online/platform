import { authConfigured, currentUser, db, googleAuthConfigured, json, JSON_HEADERS } from '../../_lib/auth.js';

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return new Response(null, { headers: JSON_HEADERS });
  if (context.request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const env = context.env || {};
  const auth = await currentUser(context.request, env);
  const hasUserStore = Boolean(db(env));
  const hasGoogleOAuth = googleAuthConfigured(env);

  return json({
    product: 'FreeMarketingStore',
    accountTier: 'free',
    profileConfigured: authConfigured(env),
    authenticated: auth.authenticated,
    user: auth.user,
    capabilities: {
      freeSignIn: authConfigured(env),
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

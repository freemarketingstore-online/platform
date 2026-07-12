import { authConfigured, base64Url, db, googleAuthConfigured, json, JSON_HEADERS, redirect, signValue } from '../../../_lib/auth.js';

const GOOGLE_SCOPES = ['openid', 'email', 'profile'];

function redirectUri(request, env) {
  return env.GOOGLE_AUTH_REDIRECT_URI || `${new URL(request.url).origin}/api/auth/google/callback`;
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return new Response(null, { headers: JSON_HEADERS });
  if (context.request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const env = context.env || {};
  if (!googleAuthConfigured(env)) {
    const missing = [];
    if (!db(env)) missing.push('FMS_DB or DB');
    if (!env.FMS_SESSION_SIGNING_KEY) missing.push('FMS_SESSION_SIGNING_KEY');
    if (!env.GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
    if (!env.GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
    return json({
      error: 'FMS Google sign-in is not configured.',
      storageConfigured: authConfigured(env),
      missing,
    }, 501);
  }

  const requestUrl = new URL(context.request.url);
  const returnTo = requestUrl.searchParams.get('returnTo') || '/console/profile/';
  const statePayload = base64Url(JSON.stringify({ returnTo, createdAt: Date.now(), nonce: crypto.randomUUID() }));
  const state = await signValue(env.FMS_SESSION_SIGNING_KEY, statePayload);

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri(context.request, env));
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', GOOGLE_SCOPES.join(' '));
  authUrl.searchParams.set('prompt', 'select_account');
  authUrl.searchParams.set('state', state);

  return redirect(authUrl.href);
}

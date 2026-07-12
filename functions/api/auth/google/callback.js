import { createSession, db, fromBase64Url, googleAuthConfigured, redirect, sessionCookie, verifySignedValue } from '../../../_lib/auth.js';

const HTML_HEADERS = { 'content-type': 'text/html; charset=utf-8' };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[ch]));
}

function page(title, body) {
  return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - FreeMarketingStore</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, sans-serif; background: #f7f8fb; color: #1a1a1a; }
    main { max-width: 720px; margin: 12vh auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; box-shadow: 0 8px 22px rgba(31, 41, 55, .08); }
    h1 { margin: 0 0 10px; font-size: 28px; }
    p { color: #64748b; line-height: 1.6; }
    a { color: #f97316; font-weight: 800; text-decoration: none; }
  </style>
</head>
<body><main>${body}</main></body>
</html>`, { headers: HTML_HEADERS });
}

function redirectUri(request, env) {
  return env.GOOGLE_AUTH_REDIRECT_URI || `${new URL(request.url).origin}/api/auth/google/callback`;
}

function safeReturnTo(value) {
  const fallback = '/console/profile/';
  if (!value || typeof value !== 'string') return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}

async function exchangeCode(code, request, env) {
  const body = new URLSearchParams();
  body.set('code', code);
  body.set('client_id', env.GOOGLE_CLIENT_ID);
  body.set('client_secret', env.GOOGLE_CLIENT_SECRET);
  body.set('redirect_uri', redirectUri(request, env));
  body.set('grant_type', 'authorization_code');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.error || `Google token exchange returned HTTP ${response.status}`);
  return data;
}

async function googleUser(accessToken) {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.sub || !data.email) throw new Error(data.error_description || data.error || 'Google user profile could not be loaded.');
  return data;
}

async function upsertUser(env, profile) {
  const existing = await db(env).prepare('SELECT id FROM users WHERE google_sub = ?').bind(profile.sub).first();
  const userId = existing?.id || crypto.randomUUID();
  if (existing) {
    await db(env).prepare(`
      UPDATE users
      SET email = ?, name = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(profile.email, profile.name || '', profile.picture || '', userId).run();
  } else {
    await db(env).prepare(`
      INSERT INTO users (id, google_sub, email, name, avatar_url)
      VALUES (?, ?, ?, ?, ?)
    `).bind(userId, profile.sub, profile.email, profile.name || '', profile.picture || '').run();
  }
  return userId;
}

export async function onRequest(context) {
  const env = context.env || {};
  const requestUrl = new URL(context.request.url);
  const error = requestUrl.searchParams.get('error');
  const code = requestUrl.searchParams.get('code');
  const signedState = requestUrl.searchParams.get('state') || '';

  if (error) return page('Sign-in failed', `<h1>Sign-in failed</h1><p>${escapeHtml(error)}</p><p><a href="/console/profile/">Back to profile</a></p>`);
  if (!googleAuthConfigured(env)) return page('Sign-in unavailable', '<h1>Sign-in unavailable</h1><p>FMS sign-in needs D1 storage, a session signing key, and Google OAuth credentials.</p><p><a href="/console/profile/">Back to profile</a></p>');
  if (!code) return page('Missing OAuth code', '<h1>Missing OAuth code</h1><p>Google did not return an authorization code.</p><p><a href="/console/profile/">Back to profile</a></p>');

  try {
    const stateValue = await verifySignedValue(env.FMS_SESSION_SIGNING_KEY, signedState);
    if (!stateValue) throw new Error('OAuth state validation failed.');
    const state = JSON.parse(fromBase64Url(stateValue));
    if (!state.createdAt || Date.now() - Number(state.createdAt) > 10 * 60 * 1000) throw new Error('OAuth state expired.');

    const token = await exchangeCode(code, context.request, env);
    const profile = await googleUser(token.access_token);
    const userId = await upsertUser(env, profile);
    const signedSession = await createSession(env, userId, context.request);
    return redirect(safeReturnTo(state.returnTo), { 'set-cookie': sessionCookie(signedSession) });
  } catch (err) {
    return page('Sign-in failed', `<h1>Sign-in failed</h1><p>${escapeHtml(err?.message || String(err))}</p><p><a href="/console/profile/">Back to profile</a></p>`);
  }
}

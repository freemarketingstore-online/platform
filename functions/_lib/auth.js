export const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
};

const SESSION_COOKIE = 'fms_session';
const SESSION_DAYS = 30;

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { ...JSON_HEADERS, ...headers } });
}

export function db(env) {
  return env?.FMS_DB || env?.DB || null;
}

export function authConfigured(env) {
  return Boolean(db(env) && env?.FMS_SESSION_SIGNING_KEY);
}

export function googleAuthConfigured(env) {
  return authConfigured(env) && Boolean(env?.GOOGLE_CLIENT_ID && env?.GOOGLE_CLIENT_SECRET);
}

function bytesToBase64Url(bytes) {
  let value = '';
  for (const byte of new Uint8Array(bytes)) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64Url(value) {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function fromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return atob(padded);
}

export async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return bytesToBase64Url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

export async function signValue(secret, value) {
  return `${value}.${await hmac(secret, value)}`;
}

export async function verifySignedValue(secret, signed) {
  const dot = String(signed || '').lastIndexOf('.');
  if (dot <= 0) return '';
  const value = signed.slice(0, dot);
  const signature = signed.slice(dot + 1);
  const expected = await hmac(secret, value);
  return signature === expected ? value : '';
}

export function cookies(request) {
  return Object.fromEntries(
    (request.headers.get('cookie') || '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        return index === -1 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

export function sessionCookie(value, maxAge = SESSION_DAYS * 24 * 60 * 60) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  return parts.join('; ');
}

export function clearSessionCookie() {
  return sessionCookie('', 0);
}

export function redirect(location, headers = {}) {
  return new Response(null, { status: 302, headers: { location, ...headers } });
}

export function userPayload(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name || '',
    avatarUrl: row.avatar_url || '',
  };
}

export async function currentUser(request, env) {
  if (!authConfigured(env)) return { configured: false, authenticated: false, user: null, session: null };
  const signed = cookies(request)[SESSION_COOKIE];
  const sessionId = await verifySignedValue(env.FMS_SESSION_SIGNING_KEY, signed);
  if (!sessionId) return { configured: true, authenticated: false, user: null, session: null };

  const result = await db(env).prepare(`
    SELECT
      sessions.id AS session_id,
      sessions.expires_at,
      users.id,
      users.email,
      users.name,
      users.avatar_url
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.id = ? AND sessions.expires_at > datetime('now')
  `).bind(sessionId).first();

  if (!result) return { configured: true, authenticated: false, user: null, session: null };
  await db(env).prepare('UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?').bind(sessionId).run();
  return {
    configured: true,
    authenticated: true,
    user: userPayload(result),
    session: { id: result.session_id, expiresAt: result.expires_at },
  };
}

export async function requireUser(request, env) {
  const auth = await currentUser(request, env);
  if (!auth.configured) return { error: json({ error: 'FMS account storage is not configured.' }, 501), auth };
  if (!auth.authenticated) return { error: json({ error: 'Sign in required.' }, 401), auth };
  return { auth };
}

export async function createSession(env, userId, request) {
  const sessionId = crypto.randomUUID();
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await db(env).prepare(`
    INSERT INTO sessions (id, user_id, expires_at, user_agent)
    VALUES (?, ?, ?, ?)
  `).bind(sessionId, userId, expires, request.headers.get('user-agent') || '').run();
  return signValue(env.FMS_SESSION_SIGNING_KEY, sessionId);
}

export async function deleteSession(request, env) {
  if (!authConfigured(env)) return;
  const sessionId = await verifySignedValue(env.FMS_SESSION_SIGNING_KEY, cookies(request)[SESSION_COOKIE]);
  if (sessionId) await db(env).prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
}

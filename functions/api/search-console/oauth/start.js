const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
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

function base64Url(value) {
  const encoded = btoa(value);
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return new Response(null, { headers: JSON_HEADERS });
  if (context.request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const env = context.env || {};
  if (!env.GOOGLE_CLIENT_ID) {
    return json({
      error: 'Google OAuth is not configured.',
      missing: ['GOOGLE_CLIENT_ID'],
    }, 501);
  }

  const requestUrl = new URL(context.request.url);
  const state = base64Url(JSON.stringify({
    returnTo: requestUrl.searchParams.get('returnTo') || '/console/search-console/',
    site: requestUrl.searchParams.get('site') || '',
    createdAt: Date.now(),
  }));

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri(context.request, env));
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', GOOGLE_SCOPES.join(' '));
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);

  return Response.redirect(authUrl.href, 302);
}

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
  return env.GOOGLE_REDIRECT_URI || `${new URL(request.url).origin}/api/search-console/oauth/callback`;
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
  return { ok: response.ok, status: response.status, data };
}

export async function onRequest(context) {
  const env = context.env || {};
  const requestUrl = new URL(context.request.url);
  const error = requestUrl.searchParams.get('error');
  const code = requestUrl.searchParams.get('code');

  if (error) {
    return page('Google sign-in failed', `<h1>Google sign-in failed</h1><p>${escapeHtml(error)}</p><p><a href="/console/search-console/">Back to Search Console</a></p>`);
  }

  if (!code) {
    return page('Missing OAuth code', '<h1>Missing OAuth code</h1><p>Google did not return an authorization code.</p><p><a href="/console/search-console/">Back to Search Console</a></p>');
  }

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return page('Google code received', '<h1>Google code received</h1><p>The OAuth callback is live, but token exchange needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Cloudflare Pages environment variables.</p><p><a href="/console/search-console/">Back to Search Console</a></p>');
  }

  const token = await exchangeCode(code, context.request, env);
  if (!token.ok) {
    return page('Token exchange failed', `<h1>Token exchange failed</h1><p>Google returned HTTP ${token.status}. Check the OAuth client, redirect URI, enabled APIs, and consent screen.</p><p><a href="/console/search-console/">Back to Search Console</a></p>`);
  }

  return page('Google connected', '<h1>Google connected</h1><p>Google returned tokens successfully. Durable profile storage is not installed yet, so this proof-of-connection discards the token instead of storing it in browser localStorage.</p><p>The next backend step is adding a session store, then saving encrypted refresh tokens per profile.</p><p><a href="/console/search-console/">Back to Search Console</a></p>');
}

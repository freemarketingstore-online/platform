import { currentUser, googleAuthConfigured, json, JSON_HEADERS } from '../../_lib/auth.js';

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return new Response(null, { headers: JSON_HEADERS });
  if (context.request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const auth = await currentUser(context.request, context.env || {});
  return json({
    configured: auth.configured,
    googleConfigured: googleAuthConfigured(context.env || {}),
    authenticated: auth.authenticated,
    user: auth.user,
  });
}

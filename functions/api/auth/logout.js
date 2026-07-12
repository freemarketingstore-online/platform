import { clearSessionCookie, deleteSession, json, JSON_HEADERS } from '../../_lib/auth.js';

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return new Response(null, { headers: JSON_HEADERS });
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  await deleteSession(context.request, context.env || {});
  return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
}

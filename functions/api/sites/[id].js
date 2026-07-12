import { db, json, JSON_HEADERS, requireUser } from '../../_lib/auth.js';

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return new Response(null, { headers: JSON_HEADERS });
  const { auth, error } = await requireUser(context.request, context.env || {});
  if (error) return error;

  const id = context.params.id;
  if (context.request.method === 'DELETE') {
    await db(context.env).prepare('DELETE FROM sites WHERE id = ? AND user_id = ?').bind(id, auth.user.id).run();
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}

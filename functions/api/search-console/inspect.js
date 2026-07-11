const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: JSON_HEADERS });
}

function bearer(request) {
  const value = request.headers.get('authorization') || '';
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function bodyJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return new Response(null, { headers: JSON_HEADERS });
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token = bearer(context.request);
  if (!token) {
    return json({ error: 'Missing Google access token. Persisted OAuth sessions are not installed yet.' }, 401);
  }

  const body = await bodyJson(context.request);
  const inspectionUrl = String(body.inspectionUrl || '').trim();
  const siteUrl = String(body.siteUrl || '').trim();
  if (!inspectionUrl || !siteUrl) return json({ error: 'inspectionUrl and siteUrl are required.' }, 400);

  const response = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ inspectionUrl, siteUrl }),
  });
  const data = await response.json().catch(() => ({}));
  return json(data, response.ok ? 200 : response.status);
}

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

function normalizeDomain(value) {
  const raw = String(value || '').trim().replace(/^sc-domain:/i, '');
  if (!raw) throw new Error('domain is required.');
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const parsed = new URL(withProtocol);
  return parsed.hostname.toLowerCase().replace(/^www\./, '');
}

function zoneCandidates(domain) {
  const labels = domain.split('.');
  const candidates = [];
  for (let index = 0; index <= labels.length - 2; index += 1) {
    candidates.push(labels.slice(index).join('.'));
  }
  return candidates;
}

async function cloudflare(path, token, options = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(data.errors?.[0]?.message || `Cloudflare API returned HTTP ${response.status}`);
  }
  return data;
}

async function findZone(domain, token) {
  for (const candidate of zoneCandidates(domain)) {
    const data = await cloudflare(`/zones?name=${encodeURIComponent(candidate)}&status=active&per_page=1`, token);
    const zone = data.result?.[0];
    if (zone?.id) return zone;
  }
  throw new Error(`No active Cloudflare zone found for ${domain}.`);
}

async function googleToken(domain, accessToken) {
  const response = await fetch('https://www.googleapis.com/siteVerification/v1/token', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      site: { type: 'INET_DOMAIN', identifier: domain },
      verificationMethod: 'DNS_TXT',
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `Google token request returned HTTP ${response.status}`);
  return data;
}

async function googleVerify(domain, accessToken) {
  const response = await fetch('https://www.googleapis.com/siteVerification/v1/webResource?verificationMethod=DNS_TXT', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      site: { type: 'INET_DOMAIN', identifier: domain },
    }),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return new Response(null, { headers: JSON_HEADERS });
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const env = context.env || {};
    if (!env.CLOUDFLARE_API_TOKEN) {
      return json({ error: 'Cloudflare DNS automation is not configured. Add CLOUDFLARE_API_TOKEN with Zone:Read and DNS:Edit.' }, 501);
    }
    const accessToken = bearer(context.request);
    if (!accessToken) {
      return json({ error: 'Missing Google access token. Persisted OAuth sessions are not installed yet.' }, 401);
    }

    const body = await bodyJson(context.request);
    const domain = normalizeDomain(body.domain);
    const zone = await findZone(domain, env.CLOUDFLARE_API_TOKEN);
    const token = await googleToken(domain, accessToken);

    const record = await cloudflare(`/zones/${zone.id}/dns_records`, env.CLOUDFLARE_API_TOKEN, {
      method: 'POST',
      body: JSON.stringify({
        type: 'TXT',
        name: zone.name,
        content: token.token,
        ttl: 120,
        comment: `FreeMarketingStore Google verification for ${domain}`,
      }),
    });

    const verification = await googleVerify(domain, accessToken);
    return json({
      domain,
      zone: { id: zone.id, name: zone.name },
      dnsRecord: { id: record.result?.id, type: record.result?.type, name: record.result?.name },
      google: {
        tokenMethod: token.method,
        verified: verification.ok,
        status: verification.status,
        result: verification.ok ? verification.data : undefined,
        error: verification.ok ? undefined : verification.data?.error?.message || 'Google did not see the DNS record yet. DNS propagation can take time; retry verification shortly.',
      },
    }, verification.ok ? 200 : 202);
  } catch (error) {
    return json({ error: error?.message || String(error) }, 400);
  }
}

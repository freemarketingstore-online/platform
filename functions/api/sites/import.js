import { db, json, JSON_HEADERS, requireUser } from '../../_lib/auth.js';

function normalizeSiteUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('URL is required.');
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withProtocol);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS URLs are supported.');
  url.hash = '';
  return { url: url.href, hostname: url.hostname.toLowerCase().replace(/^www\./, '') };
}

function issueCounts(report) {
  return (report?.issues || []).reduce((acc, issue) => {
    acc[issue.severity] = (acc[issue.severity] || 0) + 1;
    return acc;
  }, { critical: 0, warning: 0, info: 0 });
}

async function upsertSite(env, userId, item) {
  const normalized = normalizeSiteUrl(item.url);
  const existing = await db(env).prepare('SELECT id FROM sites WHERE user_id = ? AND hostname = ?').bind(userId, normalized.hostname).first();
  const siteId = existing?.id || crypto.randomUUID();
  if (existing) {
    await db(env).prepare("UPDATE sites SET url = ?, label = COALESCE(NULLIF(?, ''), label), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(normalized.url, item.label || '', siteId, userId).run();
  } else {
    await db(env).prepare('INSERT INTO sites (id, user_id, url, hostname, label) VALUES (?, ?, ?, ?, ?)').bind(siteId, userId, normalized.url, normalized.hostname, item.label || '').run();
  }
  return siteId;
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return new Response(null, { headers: JSON_HEADERS });
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const { auth, error } = await requireUser(context.request, context.env || {});
  if (error) return error;

  const body = await context.request.json().catch(() => ({}));
  const sites = Array.isArray(body.sites) ? body.sites.slice(0, 100) : [];
  let imported = 0;
  for (const site of sites) {
    if (!site?.url) continue;
    const siteId = await upsertSite(context.env, auth.user.id, site);
    if (site.lastAudit?.page?.requestedUrl && Array.isArray(site.lastAudit.issues)) {
      const auditId = crypto.randomUUID();
      const counts = issueCounts(site.lastAudit);
      await db(context.env).prepare(`
        INSERT INTO audits (id, site_id, user_id, score, health_score, status, issue_counts, report_json, checked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        auditId,
        siteId,
        auth.user.id,
        Number(site.lastAudit.score || 0),
        site.lastAudit.health?.score == null ? null : Number(site.lastAudit.health.score),
        site.lastAudit.health?.status || '',
        JSON.stringify(counts),
        JSON.stringify(site.lastAudit),
        site.lastAudit.checkedAt || new Date().toISOString(),
      ).run();
      await db(context.env).prepare('UPDATE sites SET last_audit_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').bind(auditId, siteId, auth.user.id).run();
    }
    imported += 1;
  }
  return json({ ok: true, imported });
}

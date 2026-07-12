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

function countsFor(report) {
  return (report?.issues || []).reduce((acc, issue) => {
    acc[issue.severity] = (acc[issue.severity] || 0) + 1;
    return acc;
  }, { critical: 0, warning: 0, info: 0 });
}

function sitePayload(row) {
  const report = row.report_json ? JSON.parse(row.report_json) : null;
  return {
    id: row.id,
    url: row.url,
    hostname: row.hostname,
    label: row.label || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastAudit: report,
    lastAuditSummary: row.audit_id ? {
      id: row.audit_id,
      score: row.score,
      healthScore: row.health_score,
      status: row.status,
      checkedAt: row.checked_at,
      issueCounts: row.issue_counts ? JSON.parse(row.issue_counts) : countsFor(report),
    } : null,
  };
}

async function listSites(env, userId) {
  const result = await db(env).prepare(`
    SELECT
      sites.*,
      audits.id AS audit_id,
      audits.score,
      audits.health_score,
      audits.status,
      audits.issue_counts,
      audits.report_json,
      audits.checked_at
    FROM sites
    LEFT JOIN audits ON audits.id = sites.last_audit_id
    WHERE sites.user_id = ?
    ORDER BY COALESCE(audits.checked_at, sites.updated_at) DESC
  `).bind(userId).all();
  return (result.results || []).map(sitePayload);
}

async function createSite(env, userId, body) {
  const normalized = normalizeSiteUrl(body.url);
  const label = String(body.label || '').trim();
  const existing = await db(env).prepare('SELECT id FROM sites WHERE user_id = ? AND hostname = ?').bind(userId, normalized.hostname).first();
  const siteId = existing?.id || crypto.randomUUID();
  if (existing) {
    await db(env).prepare(`
      UPDATE sites SET url = ?, label = COALESCE(NULLIF(?, ''), label), updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(normalized.url, label, siteId, userId).run();
  } else {
    await db(env).prepare(`
      INSERT INTO sites (id, user_id, url, hostname, label)
      VALUES (?, ?, ?, ?, ?)
    `).bind(siteId, userId, normalized.url, normalized.hostname, label).run();
  }
  return siteId;
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return new Response(null, { headers: JSON_HEADERS });
  const { auth, error } = await requireUser(context.request, context.env || {});
  if (error) return error;

  if (context.request.method === 'GET') {
    return json({ sites: await listSites(context.env, auth.user.id) });
  }

  if (context.request.method === 'POST') {
    const body = await context.request.json().catch(() => ({}));
    const siteId = await createSite(context.env, auth.user.id, body);
    const sites = await listSites(context.env, auth.user.id);
    return json({ site: sites.find((site) => site.id === siteId) }, 201);
  }

  return json({ error: 'Method not allowed' }, 405);
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: JSON_HEADERS });
}

function normalizeTarget(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('Enter a valid public website URL or domain.');
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error('Enter a valid public website URL or domain.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS URLs can be audited.');
  if (BLOCKED_HOSTS.has(url.hostname) || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) && /^(10|127|169\.254|192\.168|172\.(1[6-9]|2\d|3[0-1]))\./.test(url.hostname)) {
    throw new Error('Private and local network targets are not supported.');
  }
  url.hash = '';
  return url;
}

async function fetchText(url, options = {}) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 12000);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'FreeMarketingStoreBot/1.0 (+https://freemarketingstore.pages.dev/seo/site-audit/)',
        accept: options.accept || 'text/html,application/xhtml+xml,application/xml,text/xml,text/plain,*/*',
      },
    });
    const contentType = response.headers.get('content-type') || '';
    const body = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      url,
      finalUrl: response.url,
      contentType,
      headers: Object.fromEntries(response.headers.entries()),
      bytes: new TextEncoder().encode(body).length,
      ms: Date.now() - started,
      body: body.slice(0, options.limit || 600000),
    };
  } catch (error) {
    return {
      ok: false,
      url,
      error: error?.name === 'AbortError' ? 'Request timed out' : error?.message || String(error),
      ms: Date.now() - started,
      body: '',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchResourceMeta(url, options = {}) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 7000);
  try {
    let response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'FreeMarketingStoreBot/1.0 (+https://freemarketingstore.pages.dev/seo/site-audit/)',
        accept: '*/*',
      },
    });
    if (response.status === 405) {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'user-agent': 'FreeMarketingStoreBot/1.0 (+https://freemarketingstore.pages.dev/seo/site-audit/)',
          accept: '*/*',
          range: 'bytes=0-0',
        },
      });
    }
    const contentRange = response.headers.get('content-range') || '';
    const rangeSize = contentRange.match(/\/(\d+)$/)?.[1];
    return {
      ok: response.ok,
      status: response.status,
      url,
      finalUrl: response.url,
      contentType: response.headers.get('content-type') || '',
      contentLength: Number(rangeSize || response.headers.get('content-length') || 0),
      cacheControl: response.headers.get('cache-control') || '',
      ms: Date.now() - started,
    };
  } catch (error) {
    return {
      ok: false,
      url,
      error: error?.name === 'AbortError' ? 'Request timed out' : error?.message || String(error),
      ms: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

function tagMatches(html, tagName) {
  return html.match(new RegExp(`<${tagName}\\b[^>]*>`, 'gi')) || [];
}

function textContent(html, tag) {
  const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? clean(match[1]) : '';
}

function clean(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function attr(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = tag.match(new RegExp(`${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match ? (match[1] || match[2] || match[3] || '').trim() : '';
}

function meta(html, selectorName, selectorValue, contentName = 'content') {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const found = tags.find((tag) => attr(tag, selectorName).toLowerCase() === selectorValue.toLowerCase());
  return found ? attr(found, contentName) : '';
}

function linkRel(html, rel) {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  const found = tags.find((tag) => attr(tag, 'rel').toLowerCase().split(/\s+/).includes(rel));
  return found ? attr(found, 'href') : '';
}

function countMatches(html, pattern) {
  return (html.match(pattern) || []).length;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function toAbsoluteUrl(value, base) {
  try {
    return new URL(value, base).href;
  } catch {
    return '';
  }
}

function resourceKind(url, fallback = 'other') {
  const pathname = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return String(url || '').toLowerCase();
    }
  })();
  if (/\.(css)$/.test(pathname)) return 'stylesheet';
  if (/\.(js|mjs)$/.test(pathname)) return 'script';
  if (/\.(png|jpe?g|gif|webp|avif|svg|ico)$/.test(pathname)) return 'image';
  if (/\.(woff2?|ttf|otf|eot)$/.test(pathname)) return 'font';
  return fallback;
}

function collectAssets(html, baseUrl) {
  const scripts = tagMatches(html, 'script').map((tag) => attr(tag, 'src')).filter(Boolean);
  const links = tagMatches(html, 'link').map((tag) => ({ rel: attr(tag, 'rel').toLowerCase(), href: attr(tag, 'href') })).filter((item) => item.href);
  const images = tagMatches(html, 'img').map((tag) => attr(tag, 'src') || attr(tag, 'data-src')).filter(Boolean);
  const iframes = tagMatches(html, 'iframe').map((tag) => attr(tag, 'src')).filter(Boolean);
  const candidates = [
    ...scripts.map((src) => ({ url: toAbsoluteUrl(src, baseUrl), kind: 'script' })),
    ...images.map((src) => ({ url: toAbsoluteUrl(src, baseUrl), kind: 'image' })),
    ...iframes.map((src) => ({ url: toAbsoluteUrl(src, baseUrl), kind: 'iframe' })),
    ...links
      .filter((link) => /stylesheet|preload|modulepreload|icon|manifest/.test(link.rel))
      .map((link) => ({ url: toAbsoluteUrl(link.href, baseUrl), kind: link.rel.includes('stylesheet') ? 'stylesheet' : resourceKind(link.href) })),
  ].filter((item) => item.url && /^https?:\/\//i.test(item.url));

  return unique(candidates.map((item) => `${item.kind}|${item.url}`)).map((key) => {
    const [kind, url] = key.split('|');
    return { kind, url };
  });
}

function collectForms(html, baseUrl) {
  return tagMatches(html, 'form').map((tag) => {
    const action = attr(tag, 'action');
    const method = attr(tag, 'method') || 'get';
    return {
      action,
      actionUrl: action ? toAbsoluteUrl(action, baseUrl) : '',
      method: method.toLowerCase(),
    };
  });
}

function header(headers, name) {
  return headers?.[name.toLowerCase()] || '';
}

function sitemapUrls(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((match) => match[1]);
}

function robotsSitemaps(text) {
  return [...text.matchAll(/^\s*Sitemap:\s*(\S+)/gim)].map((match) => match[1]);
}

function resolveSitemapUrl(value, origin) {
  try {
    return new URL(value, origin).href;
  } catch {
    return value;
  }
}

function robotsAllowsSearch(text) {
  const groups = text.split(/(?=^\s*User-agent:)/gim);
  const starGroups = groups.filter((group) => /User-agent:\s*\*/i.test(group));
  if (!starGroups.length) return true;
  return !starGroups.some((group) => /^\s*Disallow:\s*\/\s*$/gim.test(group));
}

function makePrompt(title, detail, fix) {
  return [
    `Fix this SEO issue: ${title}.`,
    `Problem: ${detail}`,
    `Expected outcome: ${fix}`,
    'Keep the change minimal, preserve the existing visual design, and update any generated sitemap/metadata if the change affects crawlable URLs.',
    'After the change, verify the page still renders and rerun the SEO audit.',
  ].join('\n');
}

function addIssue(issues, severity, category, title, detail, fix, aiPrompt) {
  issues.push({ severity, category, title, detail, fix, aiPrompt: aiPrompt || makePrompt(title, detail, fix) });
}

function scoreFromIssues(issues) {
  const penalty = issues.reduce((sum, issue) => {
    if (issue.severity === 'critical') return sum + 18;
    if (issue.severity === 'warning') return sum + 8;
    return sum + 3;
  }, 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  if (issues.some((issue) => issue.severity === 'critical' && issue.category === 'availability')) return Math.min(score, 30);
  if (issues.some((issue) => issue.severity === 'critical' && issue.category === 'indexing')) return Math.min(score, 60);
  return score;
}

function healthCheck(label, status, detail) {
  return { label, status, detail };
}

function scoreChecks(checks) {
  if (!checks.length) return 0;
  const values = checks.map((check) => {
    if (check.status === 'pass') return 100;
    if (check.status === 'info') return 85;
    if (check.status === 'warn') return 65;
    return 20;
  });
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function statusFromChecks(checks) {
  if (checks.some((check) => check.status === 'fail')) return 'fail';
  if (checks.some((check) => check.status === 'warn')) return 'warn';
  return 'pass';
}

function makeHealthSection(label, checks) {
  return {
    label,
    score: scoreChecks(checks),
    status: statusFromChecks(checks),
    checks,
  };
}

function buildHealth({ page, robots, sitemaps, security, load, manifest, issues }) {
  const sitemapOk = (sitemaps || []).some((sitemap) => sitemap.ok && sitemap.urlCount > 0);
  const hasIndexBlocker = issues.some((issue) => issue.severity === 'critical' && ['availability', 'indexing'].includes(issue.category));
  const canonicalUrl = page.canonical ? toAbsoluteUrl(page.canonical, page.finalUrl || page.requestedUrl) : '';
  const canonicalSameOrigin = canonicalUrl ? (() => {
    try {
      return new URL(canonicalUrl).origin === new URL(page.finalUrl || page.requestedUrl).origin;
    } catch {
      return false;
    }
  })() : false;

  const sections = {
    crawlability: makeHealthSection('Crawlability', [
      healthCheck('Homepage fetch', page.status && page.status < 400 ? 'pass' : 'fail', page.status ? `HTTP ${page.status}` : 'Homepage could not be fetched'),
      healthCheck('HTML response', /html/i.test(page.contentType || '') ? 'pass' : 'warn', page.contentType || 'Unknown content type'),
      healthCheck('Robots meta', /noindex|none/i.test(page.robotsMeta || '') ? 'fail' : 'pass', page.robotsMeta || 'No blocking robots meta'),
      healthCheck('robots.txt', robots?.ok ? 'pass' : 'warn', robots?.ok ? `HTTP ${robots.status}` : robots?.error || 'Not reachable'),
      healthCheck('Crawler access', robots?.allowsSearch === false ? 'fail' : 'pass', robots?.allowsSearch === false ? 'User-agent * blocks /' : 'Not blocked'),
      healthCheck('Sitemap', sitemapOk ? 'pass' : 'fail', sitemapOk ? `${sitemaps.reduce((sum, sitemap) => sum + (sitemap.urlCount || 0), 0)} URLs found` : 'No valid sitemap URLs found'),
      healthCheck('Canonical', canonicalUrl ? (canonicalSameOrigin ? 'pass' : 'warn') : 'warn', canonicalUrl || 'Missing canonical URL'),
    ]),
    performance: makeHealthSection('Load & Performance', [
      healthCheck('Homepage response time', page.responseMs <= 1000 ? 'pass' : page.responseMs <= 2500 ? 'warn' : 'fail', `${page.responseMs || 'unknown'} ms`),
      healthCheck('HTML payload', page.bytes <= 250000 ? 'pass' : page.bytes <= 900000 ? 'warn' : 'fail', page.bytes ? `${Math.round(page.bytes / 1024)} KB` : 'Unknown'),
      healthCheck('Asset count', load?.assetCount <= 40 ? 'pass' : load?.assetCount <= 80 ? 'warn' : 'fail', load ? `${load.assetCount} referenced assets` : 'Not checked'),
      healthCheck('Sampled asset weight', !load ? 'warn' : load.sampledAssetBytes <= 750000 ? 'pass' : load.sampledAssetBytes <= 2000000 ? 'warn' : 'fail', load ? `${Math.round((load.sampledAssetBytes || 0) / 1024)} KB sampled` : 'Not checked'),
      healthCheck('Failed assets', load?.failedAssets?.length ? 'fail' : 'pass', load ? `${load.failedAssets.length} failed sampled assets` : 'Not checked'),
      healthCheck('Slow assets', load?.slowAssets?.length ? 'warn' : 'pass', load ? `${load.slowAssets.length} slow sampled assets` : 'Not checked'),
    ]),
    security: makeHealthSection('Security', [
      healthCheck('HTTPS', security?.https ? 'pass' : 'fail', security?.https ? 'Final URL uses HTTPS' : 'Final URL is not HTTPS'),
      healthCheck('HSTS', security?.headers?.strictTransportSecurity ? 'pass' : 'warn', security?.headers?.strictTransportSecurity || 'Missing Strict-Transport-Security'),
      healthCheck('Content Security Policy', security?.headers?.contentSecurityPolicy ? 'pass' : 'warn', security?.headers?.contentSecurityPolicy ? 'Present' : 'Missing Content-Security-Policy'),
      healthCheck('MIME sniffing protection', security?.headers?.xContentTypeOptions ? 'pass' : 'info', security?.headers?.xContentTypeOptions || 'Missing X-Content-Type-Options'),
      healthCheck('Referrer policy', security?.headers?.referrerPolicy ? 'pass' : 'info', security?.headers?.referrerPolicy || 'Missing Referrer-Policy'),
      healthCheck('Permissions policy', security?.headers?.permissionsPolicy ? 'pass' : 'info', security?.headers?.permissionsPolicy || 'Missing Permissions-Policy'),
      healthCheck('Clickjacking protection', security?.headers?.xFrameOptions || /frame-ancestors/i.test(security?.headers?.contentSecurityPolicy || '') ? 'pass' : 'info', 'X-Frame-Options or CSP frame-ancestors'),
      healthCheck('Mixed content', load?.mixedContent?.length ? 'fail' : 'pass', load ? `${load.mixedContent.length} HTTP assets on HTTPS page` : 'Not checked'),
      healthCheck('Insecure form actions', page.forms.some((form) => form.actionUrl?.startsWith('http://')) ? 'fail' : 'pass', `${page.forms.length} forms checked`),
    ]),
    metadata: makeHealthSection('SEO Metadata', [
      healthCheck('Title', page.title ? page.title.length > 65 || page.title.length < 20 ? 'warn' : 'pass' : 'fail', page.title || 'Missing title'),
      healthCheck('Meta description', page.description ? page.description.length > 170 || page.description.length < 80 ? 'warn' : 'pass' : 'fail', page.description || 'Missing description'),
      healthCheck('H1', page.h1Count === 1 ? 'pass' : page.h1Count === 0 ? 'warn' : 'info', `${page.h1Count} H1 elements`),
      healthCheck('Viewport', page.viewport ? 'pass' : 'warn', page.viewport || 'Missing viewport meta'),
      healthCheck('Open Graph', page.ogTitle && page.ogDescription && page.ogImage ? 'pass' : 'info', page.ogImage ? 'OG tags mostly present' : 'Missing OG image or text tags'),
      healthCheck('Structured data', page.structuredDataCount ? 'pass' : 'info', `${page.structuredDataCount} JSON-LD blocks`),
    ]),
    accessibility: makeHealthSection('Accessibility Basics', [
      healthCheck('Language', page.lang ? 'pass' : 'info', page.lang || 'Missing html lang'),
      healthCheck('Image alt coverage', !page.images.total || page.images.missingAlt / page.images.total <= 0.1 ? 'pass' : page.images.missingAlt / page.images.total <= 0.25 ? 'warn' : 'fail', `${page.images.missingAlt} of ${page.images.total} images missing alt`),
      healthCheck('Heading outline', page.headingCounts.h1 === 1 && page.headingCounts.h2 > 0 ? 'pass' : page.headingCounts.h1 === 1 ? 'info' : 'warn', `H1 ${page.headingCounts.h1 || 0}, H2 ${page.headingCounts.h2 || 0}`),
      healthCheck('Forms detected', page.forms.length ? 'info' : 'pass', page.forms.length ? `${page.forms.length} forms need manual label/validation review` : 'No forms detected'),
    ]),
    quality: makeHealthSection('Links & Resources', [
      healthCheck('Internal links', page.internalLinks > 0 ? 'pass' : 'info', `${page.internalLinks || 0} internal links`),
      healthCheck('External links', page.externalLinks <= 100 ? 'pass' : 'warn', `${page.externalLinks || 0} external links`),
      healthCheck('Broken sampled internal links', load?.failedInternalLinks?.length ? 'fail' : 'pass', load ? `${load.failedInternalLinks.length} failed sampled links` : 'Not checked'),
      healthCheck('Third-party hosts', load?.thirdPartyHosts?.length <= 6 ? 'pass' : 'warn', load ? `${load.thirdPartyHosts.length} third-party hosts` : 'Not checked'),
      healthCheck('Cookie-setting response', security?.setCookieCount ? 'info' : 'pass', `${security?.setCookieCount || 0} Set-Cookie headers on homepage`),
    ]),
    application: makeHealthSection('Web App / PWA', [
      healthCheck('Web app manifest', manifest?.ok ? 'pass' : page.manifestUrl ? 'warn' : 'info', manifest?.ok ? `HTTP ${manifest.status}` : page.manifestUrl || 'No manifest link'),
      healthCheck('Manifest display mode', manifest?.display && manifest.display !== 'browser' ? 'pass' : manifest?.ok ? 'warn' : 'info', manifest?.display || 'Not available'),
      healthCheck('Service worker hint', page.serviceWorkerHint ? 'pass' : 'info', page.serviceWorkerHint ? 'Registration code detected' : 'No service worker registration detected in HTML'),
      healthCheck('Install icons', manifest?.iconCount >= 2 ? 'pass' : manifest?.ok ? 'warn' : 'info', manifest?.ok ? `${manifest.iconCount} icons listed` : 'Not checked'),
    ]),
  };

  const sectionValues = Object.values(sections);
  return {
    status: hasIndexBlocker ? 'fail' : statusFromChecks(sectionValues.map((section) => ({ status: section.status }))),
    score: Math.round(sectionValues.reduce((sum, section) => sum + section.score, 0) / sectionValues.length),
    sections,
  };
}

async function audit(target) {
  const targetUrl = normalizeTarget(target);
  const checkedAt = new Date().toISOString();
  const home = await fetchText(targetUrl.href);
  const issues = [];
  const page = {
    requestedUrl: targetUrl.href,
    finalUrl: home.finalUrl || targetUrl.href,
    status: home.status || null,
    contentType: home.contentType || '',
    responseMs: home.ms,
    bytes: home.bytes || 0,
    title: '',
    description: '',
    canonical: '',
    robotsMeta: '',
    h1Count: 0,
    lang: '',
    ogTitle: '',
    ogDescription: '',
    ogImage: '',
    internalLinks: 0,
    externalLinks: 0,
    headingCounts: {},
    images: { total: 0, missingAlt: 0 },
    forms: [],
    inlineScripts: 0,
    inlineStyles: 0,
    structuredDataCount: 0,
    viewport: '',
    manifestUrl: '',
    serviceWorkerHint: false,
  };

  if (home.error) {
    addIssue(issues, 'critical', 'availability', 'Homepage could not be fetched', home.error, 'Fix DNS, hosting, firewall, or SSL configuration so the homepage returns HTML.', [
      `The homepage for ${targetUrl.hostname} cannot be fetched by the SEO audit.`,
      `Error: ${home.error}`,
      'Investigate DNS, SSL, hosting, Cloudflare Pages/custom-domain routing, and firewall/WAF settings.',
      'Make the public homepage return a 200 HTML response at the canonical URL.',
      'Verify with curl for the homepage, /robots.txt, and /sitemap.xml, then rerun the audit.',
    ].join('\n'));
    return { checkedAt, page, robots: null, sitemaps: [], security: null, load: null, manifest: null, score: scoreFromIssues(issues), health: null, issues };
  }

  if (!home.ok) {
    addIssue(issues, 'critical', 'availability', `Homepage returns HTTP ${home.status}`, `The audited URL returned ${home.status}.`, 'Serve the canonical page with a 200 status, or redirect cleanly to a 200 URL.', [
      `Fix the homepage HTTP status for ${targetUrl.hostname}.`,
      `Current status: ${home.status}`,
      'Ensure the requested URL either returns 200 with crawlable HTML or performs a single clean redirect to the canonical 200 URL.',
      'Update deployment routing, redirects, or static output as needed.',
      'Verify with curl -I and rerun the SEO audit.',
    ].join('\n'));
  }

  if (!/html/i.test(home.contentType)) {
    addIssue(issues, 'warning', 'content', 'Homepage is not served as HTML', `Content-Type is "${home.contentType || 'unknown'}".`, 'Serve crawlable pages as text/html.', [
      `Fix the Content-Type for the homepage on ${targetUrl.hostname}.`,
      `Current Content-Type: ${home.contentType || 'unknown'}`,
      'Ensure the homepage is served as text/html with valid HTML content.',
      'Check hosting headers, Pages/Worker response headers, and static file naming.',
      'Verify with curl -I and rerun the SEO audit.',
    ].join('\n'));
  }

  const html = home.body || '';
  page.title = textContent(html, 'title');
  page.description = meta(html, 'name', 'description');
  page.canonical = linkRel(html, 'canonical');
  page.robotsMeta = meta(html, 'name', 'robots');
  page.h1Count = countMatches(html, /<h1\b/gi);
  page.lang = attr(html.match(/<html\b[^>]*>/i)?.[0] || '', 'lang');
  page.ogTitle = meta(html, 'property', 'og:title');
  page.ogDescription = meta(html, 'property', 'og:description');
  page.ogImage = meta(html, 'property', 'og:image');
  page.viewport = meta(html, 'name', 'viewport');
  page.manifestUrl = linkRel(html, 'manifest') ? toAbsoluteUrl(linkRel(html, 'manifest'), page.finalUrl) : '';
  page.serviceWorkerHint = /navigator\.serviceWorker|serviceWorker\.register|\/sw\.js/i.test(html);
  page.structuredDataCount = countMatches(html, /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>/gi);
  page.inlineScripts = tagMatches(html, 'script').filter((tag) => !attr(tag, 'src')).length;
  page.inlineStyles = countMatches(html, /<style\b/gi);
  page.headingCounts = {
    h1: page.h1Count,
    h2: countMatches(html, /<h2\b/gi),
    h3: countMatches(html, /<h3\b/gi),
    h4: countMatches(html, /<h4\b/gi),
  };

  const imageTags = tagMatches(html, 'img');
  page.images = {
    total: imageTags.length,
    missingAlt: imageTags.filter((tag) => !attr(tag, 'alt')).length,
  };
  page.forms = collectForms(html, page.finalUrl);

  const finalOrigin = new URL(page.finalUrl).origin;
  const anchors = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)].map((match) => match[1]);
  const anchorUrls = [];
  for (const href of anchors) {
    try {
      const link = new URL(href, page.finalUrl);
      if (!['http:', 'https:'].includes(link.protocol)) continue;
      anchorUrls.push(link.href);
      if (link.origin === finalOrigin) page.internalLinks += 1;
      else page.externalLinks += 1;
    } catch {
      // Ignore malformed links for this first version.
    }
  }

  const headers = home.headers || {};
  const security = {
    https: new URL(page.finalUrl).protocol === 'https:',
    headers: {
      contentSecurityPolicy: header(headers, 'content-security-policy'),
      strictTransportSecurity: header(headers, 'strict-transport-security'),
      xFrameOptions: header(headers, 'x-frame-options'),
      xContentTypeOptions: header(headers, 'x-content-type-options'),
      referrerPolicy: header(headers, 'referrer-policy'),
      permissionsPolicy: header(headers, 'permissions-policy'),
    },
    setCookieCount: header(headers, 'set-cookie') ? header(headers, 'set-cookie').split(/,(?=\s*[^;,]+=)/).length : 0,
  };

  const assets = collectAssets(html, page.finalUrl);
  const sampledAssets = assets.slice(0, 24);
  const assetResults = await Promise.all(sampledAssets.map(async (asset) => ({ ...asset, ...(await fetchResourceMeta(asset.url)) })));
  if (!page.serviceWorkerHint) {
    const scriptAssets = assets.filter((asset) => asset.kind === 'script').slice(0, 6);
    const scriptResults = await Promise.all(scriptAssets.map((asset) => fetchText(asset.url, {
      accept: 'application/javascript,text/javascript,*/*',
      limit: 500000,
      timeout: 8000,
    })));
    page.serviceWorkerHint = scriptResults.some((script) => /navigator\.serviceWorker|serviceWorker\.register|\/sw\.js/i.test(script.body || ''));
  }
  const assetBytes = assetResults.reduce((sum, asset) => sum + (asset.contentLength || 0), 0);
  const thirdPartyHosts = unique(assets.map((asset) => {
    try {
      const url = new URL(asset.url);
      return url.origin === finalOrigin ? '' : url.hostname;
    } catch {
      return '';
    }
  }));
  const mixedContent = assets.filter((asset) => security.https && asset.url.startsWith('http://'));
  const load = {
    htmlBytes: page.bytes,
    responseMs: page.responseMs,
    assetCount: assets.length,
    sampledAssetCount: assetResults.length,
    sampledAssetBytes: assetBytes,
    failedAssets: assetResults.filter((asset) => asset.error || asset.status >= 400).slice(0, 8),
    slowAssets: assetResults.filter((asset) => asset.ms > 1500).slice(0, 8),
    thirdPartyHosts: thirdPartyHosts.slice(0, 12),
    mixedContent: mixedContent.slice(0, 8),
    byKind: assets.reduce((acc, asset) => {
      acc[asset.kind] = (acc[asset.kind] || 0) + 1;
      return acc;
    }, {}),
  };

  let manifest = null;
  if (page.manifestUrl) {
    const manifestFetch = await fetchText(page.manifestUrl, { accept: 'application/manifest+json,application/json,*/*', limit: 160000 });
    let manifestBody = {};
    try {
      manifestBody = manifestFetch.body ? JSON.parse(manifestFetch.body) : {};
    } catch {
      manifestBody = {};
    }
    manifest = {
      url: page.manifestUrl,
      status: manifestFetch.status || null,
      ok: Boolean(manifestFetch.ok && manifestBody && typeof manifestBody === 'object' && (manifestBody.name || manifestBody.short_name)),
      name: manifestBody.name || '',
      shortName: manifestBody.short_name || '',
      display: manifestBody.display || '',
      startUrl: manifestBody.start_url || '',
      scope: manifestBody.scope || '',
      iconCount: Array.isArray(manifestBody.icons) ? manifestBody.icons.length : 0,
      error: manifestFetch.error || '',
    };
  }
  const sampledLinks = unique(anchorUrls).filter((href) => new URL(href).origin === finalOrigin).slice(0, 12);
  const linkResults = await Promise.all(sampledLinks.map((href) => fetchResourceMeta(href, { timeout: 6000 })));
  load.failedInternalLinks = linkResults.filter((link) => link.error || link.status >= 400).slice(0, 8);

  if (!page.title) addIssue(issues, 'critical', 'metadata', 'Missing title tag', 'The homepage has no <title>.', 'Add a concise, unique title tag around 30-60 characters.', [
    `Add a homepage <title> tag for ${targetUrl.hostname}.`,
    'Write a unique title around 30-60 characters that includes the brand and page purpose.',
    'Place it in the document <head> and preserve existing meta/social tags.',
    'Verify the rendered homepage title in the browser and rerun the SEO audit.',
  ].join('\n'));
  else if (page.title.length > 65) addIssue(issues, 'warning', 'metadata', 'Title is long', `${page.title.length} characters.`, 'Keep important words within the first 60 characters.', [
    `Shorten the homepage title for ${targetUrl.hostname}.`,
    `Current title: "${page.title}" (${page.title.length} characters)`,
    'Rewrite it so the important brand and page value fit within roughly 60 characters.',
    'Keep the title specific and human-readable. Do not change unrelated page content.',
    'Verify the <title> and rerun the SEO audit.',
  ].join('\n'));
  else if (page.title.length < 20) addIssue(issues, 'warning', 'metadata', 'Title is short', `${page.title.length} characters.`, 'Use a descriptive title that includes the brand and page purpose.', [
    `Improve the short homepage title for ${targetUrl.hostname}.`,
    `Current title: "${page.title}" (${page.title.length} characters)`,
    'Expand it to describe the brand and core page purpose without keyword stuffing.',
    'Keep it under roughly 60 characters and preserve the existing design.',
    'Verify the <title> and rerun the SEO audit.',
  ].join('\n'));

  if (!page.description) addIssue(issues, 'critical', 'metadata', 'Missing meta description', 'The homepage has no meta description.', 'Add a human-written description around 120-155 characters.', [
    `Add a meta description for ${targetUrl.hostname}.`,
    'Write a clear human-readable description around 120-155 characters.',
    'Include the page value proposition, avoid keyword stuffing, and place it in <meta name="description" content="...">.',
    'Verify the tag in the rendered HTML and rerun the SEO audit.',
  ].join('\n'));
  else if (page.description.length > 170) addIssue(issues, 'warning', 'metadata', 'Meta description is long', `${page.description.length} characters.`, 'Shorten it so search snippets are less likely to truncate.', [
    `Shorten the homepage meta description for ${targetUrl.hostname}.`,
    `Current description: "${page.description}" (${page.description.length} characters)`,
    'Rewrite it to roughly 120-155 characters while preserving the core value proposition.',
    'Update only the meta description unless related social descriptions intentionally mirror it.',
    'Verify the tag and rerun the SEO audit.',
  ].join('\n'));
  else if (page.description.length < 80) addIssue(issues, 'info', 'metadata', 'Meta description is short', `${page.description.length} characters.`, 'Expand it with the page value proposition.', [
    `Improve the short homepage meta description for ${targetUrl.hostname}.`,
    `Current description: "${page.description}" (${page.description.length} characters)`,
    'Expand it to clearly explain the page value proposition in roughly 120-155 characters.',
    'Keep it natural and specific. Verify the tag and rerun the SEO audit.',
  ].join('\n'));

  if (/noindex|none/i.test(page.robotsMeta)) addIssue(issues, 'critical', 'indexing', 'Page has noindex robots meta', `robots="${page.robotsMeta}"`, 'Remove noindex/none when the page should appear in search.', [
    `Remove unintended noindex from ${targetUrl.hostname}.`,
    `Current robots meta: ${page.robotsMeta}`,
    'If this public homepage should appear in search, remove noindex/none from the robots meta tag.',
    'Keep any intentional directives such as max-image-preview if needed.',
    'Verify the rendered robots meta and rerun the SEO audit.',
  ].join('\n'));
  if (!page.canonical) addIssue(issues, 'warning', 'indexing', 'Missing canonical link', 'No rel=canonical link was found.', 'Add a canonical URL for the preferred indexed version.', [
    `Add a canonical link to the homepage for ${targetUrl.hostname}.`,
    `Use the preferred final URL: ${page.finalUrl || targetUrl.href}`,
    'Add <link rel="canonical" href="..."> in the document head.',
    'Make sure the canonical URL matches the public preferred host and protocol.',
    'Verify the tag and rerun the SEO audit.',
  ].join('\n'));
  if (page.h1Count === 0) addIssue(issues, 'warning', 'content', 'Missing H1', 'No H1 was found on the homepage.', 'Add exactly one clear H1 describing the page.', [
    `Add one clear H1 to the homepage for ${targetUrl.hostname}.`,
    'Problem: the audit found no <h1> on the homepage.',
    'Choose the visible main headline that best describes the page and mark it up as <h1>.',
    'Preserve the existing visual design; change semantic markup/CSS only as needed.',
    'Do not add multiple H1s. Verify there is exactly one H1 and rerun the SEO audit.',
  ].join('\n'));
  if (page.h1Count > 1) addIssue(issues, 'info', 'content', 'Multiple H1 headings', `${page.h1Count} H1 elements were found.`, 'Use one primary H1 unless the page structure intentionally needs more.', [
    `Review H1 usage on ${targetUrl.hostname}.`,
    `The homepage has ${page.h1Count} H1 elements.`,
    'Keep the main page headline as the only H1 and demote secondary headings to H2/H3 where appropriate.',
    'Preserve visual styling with CSS if needed, then rerun the SEO audit.',
  ].join('\n'));
  if (!page.lang) addIssue(issues, 'info', 'accessibility', 'Missing html lang attribute', 'The <html> element has no lang attribute.', 'Set lang, for example <html lang="en">.', [
    `Add an html lang attribute for ${targetUrl.hostname}.`,
    'Set the language on the root <html> element, for example <html lang="en">.',
    'Use the correct BCP-47 language code for the page content.',
    'Verify the rendered HTML and rerun the SEO audit.',
  ].join('\n'));
  if (!page.ogTitle || !page.ogDescription) addIssue(issues, 'info', 'social', 'Incomplete Open Graph metadata', 'Missing og:title or og:description.', 'Add Open Graph tags for richer social previews.', [
    `Complete Open Graph metadata for ${targetUrl.hostname}.`,
    `Current og:title: ${page.ogTitle || 'missing'}`,
    `Current og:description: ${page.ogDescription || 'missing'}`,
    'Add og:title and og:description in the document head, usually matching or complementing the title and meta description.',
    'Verify social preview tags and rerun the SEO audit.',
  ].join('\n'));
  if (!page.ogImage) addIssue(issues, 'info', 'social', 'Missing Open Graph image', 'No og:image tag was found.', 'Add an absolute og:image URL for link previews.', [
    `Add an og:image for ${targetUrl.hostname}.`,
    'Create or choose a share-preview image, ideally 1200x630 pixels.',
    'Add <meta property="og:image" content="https://..."> using an absolute public URL.',
    'Verify social preview metadata and rerun the audit.',
  ].join('\n'));
  if (!page.viewport) addIssue(issues, 'warning', 'mobile', 'Missing viewport meta tag', 'No viewport meta tag was found.', 'Add <meta name="viewport" content="width=device-width, initial-scale=1.0">.', [
    `Add a viewport meta tag for ${targetUrl.hostname}.`,
    'Place <meta name="viewport" content="width=device-width, initial-scale=1.0"> in the document head.',
    'Verify the page renders correctly on mobile and rerun the audit.',
  ].join('\n'));
  if (!page.structuredDataCount) addIssue(issues, 'info', 'structured-data', 'No structured data detected', 'No application/ld+json script was found.', 'Add JSON-LD Organization, WebSite, SoftwareApplication, Product, or Breadcrumb data where relevant.', [
    `Add relevant JSON-LD structured data for ${targetUrl.hostname}.`,
    'Choose schema types that match the page, such as Organization, WebSite, SoftwareApplication, Product, or BreadcrumbList.',
    'Add valid <script type="application/ld+json"> data without changing the visible design.',
    'Validate the JSON-LD and rerun the audit.',
  ].join('\n'));
  if (page.bytes > 900000) addIssue(issues, 'warning', 'performance', 'Large homepage HTML payload', `${Math.round(page.bytes / 1024)} KB of HTML was fetched.`, 'Reduce inline scripts/styles and unnecessary markup.', [
    `Reduce the homepage HTML payload for ${targetUrl.hostname}.`,
    `Current HTML size: ${Math.round(page.bytes / 1024)} KB.`,
    'Move large inline scripts/styles to assets, remove unused markup, and avoid embedding large data blobs in the HTML.',
    'Preserve functionality and visual design, then rerun the SEO audit.',
  ].join('\n'));
  if (page.responseMs > 5000) addIssue(issues, 'critical', 'performance', 'Homepage response is very slow', `${page.responseMs} ms to receive the homepage.`, 'Reduce server/render latency and cache static pages at the edge.', [
    `Fix very slow homepage response time for ${targetUrl.hostname}.`,
    `Current measured response time: ${page.responseMs} ms.`,
    'Check hosting cold starts, server rendering, cache headers, redirects, and upstream API calls.',
    'Make the homepage cacheable where possible and rerun the audit.',
  ].join('\n'));
  else if (page.responseMs > 2000) addIssue(issues, 'warning', 'performance', 'Homepage response is slow', `${page.responseMs} ms to receive the homepage.`, 'Improve server response time or edge caching.', [
    `Improve homepage response time for ${targetUrl.hostname}.`,
    `Current measured response time: ${page.responseMs} ms.`,
    'Review redirects, server rendering, cache headers, and deployment region/edge caching.',
    'Rerun the audit after the homepage consistently responds faster.',
  ].join('\n'));
  if (page.images.total && page.images.missingAlt / page.images.total > 0.25) addIssue(issues, 'warning', 'accessibility', 'Many images are missing alt text', `${page.images.missingAlt} of ${page.images.total} image tags have no alt attribute.`, 'Add meaningful alt text for informative images and empty alt for decorative images.', [
    `Fix image alt coverage for ${targetUrl.hostname}.`,
    `${page.images.missingAlt} of ${page.images.total} image tags are missing alt attributes.`,
    'Add descriptive alt text for informative images and alt="" for decorative images.',
    'Preserve layout and rerun the audit.',
  ].join('\n'));
  if (page.forms.some((form) => form.actionUrl && form.actionUrl.startsWith('http://'))) addIssue(issues, 'critical', 'security', 'Form posts to insecure HTTP', 'At least one form action uses http://.', 'Submit forms only to HTTPS endpoints.', [
    `Fix insecure form actions on ${targetUrl.hostname}.`,
    'Find forms whose action uses http:// and change them to HTTPS endpoints.',
    'Verify submissions still work and rerun the audit.',
  ].join('\n'));
  if (!security.https) addIssue(issues, 'critical', 'security', 'Homepage is not served over HTTPS', `Final URL is ${page.finalUrl}.`, 'Serve the canonical homepage over HTTPS and redirect HTTP to HTTPS.', [
    `Enable HTTPS for ${targetUrl.hostname}.`,
    `Current final URL: ${page.finalUrl}`,
    'Configure the host/CDN certificate and redirect HTTP traffic to the HTTPS canonical URL.',
    'Verify with curl -I and rerun the audit.',
  ].join('\n'));
  if (security.https && !security.headers.strictTransportSecurity) addIssue(issues, 'warning', 'security', 'Missing HSTS header', 'Strict-Transport-Security was not found.', 'Add HSTS after confirming HTTPS works across the whole domain.', [
    `Add HSTS for ${targetUrl.hostname}.`,
    'After confirming all subdomains that should be covered support HTTPS, add a Strict-Transport-Security header.',
    'A common starting point is max-age=31536000; includeSubDomains only when safe for the whole domain.',
    'Verify response headers and rerun the audit.',
  ].join('\n'));
  if (!security.headers.contentSecurityPolicy) addIssue(issues, 'warning', 'security', 'Missing Content Security Policy', 'No Content-Security-Policy header was found.', 'Add a CSP to reduce script injection and content injection risk.', [
    `Add a Content Security Policy for ${targetUrl.hostname}.`,
    'Inventory required script, style, image, font, connect, and frame sources.',
    'Start with a report-only CSP if needed, then enforce a policy that avoids unsafe-inline where practical.',
    'Verify no required assets are blocked and rerun the audit.',
  ].join('\n'));
  if (!security.headers.xContentTypeOptions) addIssue(issues, 'info', 'security', 'Missing X-Content-Type-Options header', 'X-Content-Type-Options was not found.', 'Add X-Content-Type-Options: nosniff.', [
    `Add X-Content-Type-Options for ${targetUrl.hostname}.`,
    'Set the response header X-Content-Type-Options: nosniff on HTML and asset responses.',
    'Verify headers and rerun the audit.',
  ].join('\n'));
  if (!security.headers.referrerPolicy) addIssue(issues, 'info', 'security', 'Missing Referrer-Policy header', 'Referrer-Policy was not found.', 'Add a privacy-conscious Referrer-Policy header.', [
    `Add a Referrer-Policy header for ${targetUrl.hostname}.`,
    'Use a policy such as strict-origin-when-cross-origin unless the product has stricter privacy needs.',
    'Verify response headers and rerun the audit.',
  ].join('\n'));
  if (!security.headers.permissionsPolicy) addIssue(issues, 'info', 'security', 'Missing Permissions-Policy header', 'Permissions-Policy was not found.', 'Disable browser features the site does not use.', [
    `Add a Permissions-Policy header for ${targetUrl.hostname}.`,
    'Disable unused browser capabilities such as camera, microphone, geolocation, payment, and USB unless the app needs them.',
    'Verify response headers and rerun the audit.',
  ].join('\n'));
  if (!security.headers.xFrameOptions && !/frame-ancestors/i.test(security.headers.contentSecurityPolicy)) addIssue(issues, 'info', 'security', 'Missing clickjacking protection', 'No X-Frame-Options header or CSP frame-ancestors directive was found.', 'Add frame-ancestors in CSP or X-Frame-Options when embedding is not intentional.', [
    `Add clickjacking protection for ${targetUrl.hostname}.`,
    'If this site should not be embedded, add CSP frame-ancestors or X-Frame-Options.',
    'Use frame-ancestors when possible because it is more flexible and modern.',
    'Verify response headers and rerun the audit.',
  ].join('\n'));
  if (load.mixedContent.length) addIssue(issues, 'critical', 'security', 'Mixed-content resources detected', `${load.mixedContent.length} http:// asset references were found on an HTTPS page.`, 'Load all scripts, styles, images, and frames over HTTPS.', [
    `Fix mixed content on ${targetUrl.hostname}.`,
    `The audit found ${load.mixedContent.length} asset references using http:// on an HTTPS page.`,
    'Change those asset URLs to HTTPS or self-host them securely.',
    'Verify the browser console has no mixed-content warnings and rerun the audit.',
  ].join('\n'));
  if (load.failedAssets.length) addIssue(issues, 'warning', 'performance', 'Some page assets failed to load', `${load.failedAssets.length} sampled assets returned errors or HTTP 4xx/5xx.`, 'Fix broken script, stylesheet, image, font, or iframe URLs.', [
    `Fix failed page assets for ${targetUrl.hostname}.`,
    `The audit found ${load.failedAssets.length} failed sampled assets.`,
    'Check the failed asset URLs in the audit response, update missing files or paths, and remove dead references.',
    'Verify the browser network panel is clean and rerun the audit.',
  ].join('\n'));
  if (load.slowAssets.length) addIssue(issues, 'info', 'performance', 'Some assets are slow', `${load.slowAssets.length} sampled assets took over 1500 ms to respond.`, 'Compress, cache, reduce, or move slow assets behind a faster CDN.', [
    `Review slow assets for ${targetUrl.hostname}.`,
    `The audit found ${load.slowAssets.length} sampled assets over 1500 ms.`,
    'Inspect asset URLs, cache headers, file sizes, and third-party hosts.',
    'Optimize or defer noncritical assets and rerun the audit.',
  ].join('\n'));
  if (load.assetCount > 80) addIssue(issues, 'warning', 'performance', 'High asset count', `${load.assetCount} script, style, image, icon, manifest, or iframe resources were referenced.`, 'Reduce, defer, combine, or lazy-load noncritical assets.', [
    `Reduce homepage asset count for ${targetUrl.hostname}.`,
    `Current referenced asset count: ${load.assetCount}.`,
    'Remove unused assets, lazy-load noncritical images/iframes, and defer noncritical scripts.',
    'Verify the page still works and rerun the audit.',
  ].join('\n'));
  if (load.thirdPartyHosts.length > 6) addIssue(issues, 'info', 'privacy', 'Many third-party hosts', `${load.thirdPartyHosts.length} third-party hosts were referenced by sampled page assets.`, 'Reduce third-party dependencies and document privacy impact.', [
    `Review third-party hosts for ${targetUrl.hostname}.`,
    `Third-party host count: ${load.thirdPartyHosts.length}.`,
    'Remove unnecessary third-party scripts/assets, self-host stable assets where practical, and document privacy impact.',
    'Verify required integrations still work and rerun the audit.',
  ].join('\n'));
  if (load.failedInternalLinks.length) addIssue(issues, 'warning', 'quality', 'Broken internal links detected', `${load.failedInternalLinks.length} sampled internal links returned errors or HTTP 4xx/5xx.`, 'Fix broken internal links and redirects.', [
    `Fix broken internal links on ${targetUrl.hostname}.`,
    `The audit found ${load.failedInternalLinks.length} failed sampled internal links.`,
    'Update or remove broken links, repair redirects, and regenerate navigation/sitemap output if needed.',
    'Verify links manually and rerun the audit.',
  ].join('\n'));

  const robotsUrl = new URL('/robots.txt', finalOrigin).href;
  const robotsFetch = await fetchText(robotsUrl, { accept: 'text/plain,*/*', limit: 120000 });
  const robots = {
    url: robotsUrl,
    status: robotsFetch.status || null,
    ok: Boolean(robotsFetch.ok),
    allowsSearch: true,
    sitemapLines: [],
    error: robotsFetch.error || '',
  };

  if (robotsFetch.error || !robotsFetch.ok) {
    addIssue(issues, 'warning', 'indexing', 'robots.txt is not reachable', robotsFetch.error || `HTTP ${robotsFetch.status}`, 'Publish robots.txt with User-agent: * and a Sitemap line.', [
      `Publish a reachable robots.txt for ${targetUrl.hostname}.`,
      `Current result: ${robotsFetch.error || `HTTP ${robotsFetch.status}`}`,
      'Add /robots.txt at the public site root with User-agent: *, Allow: /, and a Sitemap line.',
      'Verify https://your-domain/robots.txt returns 200 text/plain and rerun the SEO audit.',
    ].join('\n'));
  } else {
    robots.allowsSearch = robotsAllowsSearch(robotsFetch.body);
    robots.sitemapLines = robotsSitemaps(robotsFetch.body);
    if (!robots.allowsSearch) addIssue(issues, 'critical', 'indexing', 'robots.txt blocks search crawling', 'User-agent: * disallows /.', 'Allow / for public search crawling.', [
      `Fix robots.txt for ${targetUrl.hostname}.`,
      'Problem: User-agent: * currently disallows /, blocking general search crawlers.',
      'Change the public robots policy to allow crawlable public pages, for example User-agent: * then Allow: /.',
      'Keep any specific AI crawler blocks separate if intentional.',
      'Verify robots.txt and rerun the SEO audit.',
    ].join('\n'));
    if (!robots.sitemapLines.length) addIssue(issues, 'warning', 'indexing', 'robots.txt has no Sitemap line', 'No Sitemap directive was found.', 'Add Sitemap: https://your-domain/sitemap.xml.', [
      `Add a Sitemap directive to robots.txt for ${targetUrl.hostname}.`,
      'Add a line like: Sitemap: https://your-domain/sitemap.xml',
      'Use the canonical public host and make sure the sitemap URL returns 200 XML.',
      'Verify robots.txt and rerun the SEO audit.',
    ].join('\n'));
  }

  const sitemapTargets = robots.sitemapLines.length
    ? robots.sitemapLines.slice(0, 3).map((line) => resolveSitemapUrl(line, finalOrigin))
    : [new URL('/sitemap.xml', finalOrigin).href];
  const sitemaps = [];
  for (const sitemapUrl of sitemapTargets) {
    const sitemapFetch = await fetchText(sitemapUrl, { accept: 'application/xml,text/xml,text/plain,*/*', limit: 800000 });
    const locs = sitemapFetch.body ? sitemapUrls(sitemapFetch.body) : [];
    const origins = [...new Set(locs.map((loc) => {
      try {
        return new URL(loc).origin;
      } catch {
        return 'invalid';
      }
    }))];
    const item = {
      url: sitemapUrl,
      status: sitemapFetch.status || null,
      ok: Boolean(sitemapFetch.ok),
      urlCount: locs.length,
      origins,
      error: sitemapFetch.error || '',
    };
    sitemaps.push(item);
    if (sitemapFetch.error || !sitemapFetch.ok) addIssue(issues, 'critical', 'indexing', 'Sitemap is not reachable', `${sitemapUrl} ${sitemapFetch.error || `returned HTTP ${sitemapFetch.status}`}`, 'Publish a valid XML sitemap and reference it from robots.txt.', [
      `Fix the sitemap for ${targetUrl.hostname}.`,
      `Sitemap URL: ${sitemapUrl}`,
      `Current result: ${sitemapFetch.error || `HTTP ${sitemapFetch.status}`}`,
      'Generate and deploy a valid XML sitemap at the advertised URL.',
      'Reference it from robots.txt and ensure it contains canonical public URLs.',
      'Verify /sitemap.xml returns 200 and rerun the SEO audit.',
    ].join('\n'));
    else if (!locs.length) addIssue(issues, 'critical', 'indexing', 'Sitemap has no URLs', `${sitemapUrl} contains zero <loc> entries.`, 'Generate a sitemap with canonical public URLs.', [
      `Populate the sitemap for ${targetUrl.hostname}.`,
      `Sitemap URL: ${sitemapUrl}`,
      'The sitemap currently has zero <loc> entries.',
      'Generate XML entries for the homepage and important canonical pages.',
      'Keep URLs on the preferred public host and rerun the SEO audit.',
    ].join('\n'));
    else if (origins.length > 1) addIssue(issues, 'warning', 'indexing', 'Sitemap mixes multiple hosts', origins.join(', '), 'Split sitemaps per host or use only canonical URLs for this property.', [
      `Fix mixed-host sitemap URLs for ${targetUrl.hostname}.`,
      `Hosts found: ${origins.join(', ')}`,
      'Use only canonical URLs for this site in its sitemap, or split separate hosts into separate sitemap files.',
      'Update robots.txt to point to the sitemap for the current property.',
      'Verify sitemap hosts and rerun the SEO audit.',
    ].join('\n'));
  }

  const health = buildHealth({ page, robots, sitemaps, security, load, manifest, issues });

  return {
    checkedAt,
    page,
    robots,
    sitemaps,
    security,
    load,
    manifest,
    score: scoreFromIssues(issues),
    health,
    issues,
  };
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return new Response(null, { headers: JSON_HEADERS });
  if (context.request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  try {
    const requestUrl = new URL(context.request.url);
    const target = requestUrl.searchParams.get('url');
    if (!target) return json({ error: 'Missing url query parameter.' }, 400);
    return json(await audit(target));
  } catch (error) {
    return json({ error: error?.message || String(error) }, 400);
  }
}

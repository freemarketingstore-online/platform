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
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withProtocol);
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
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? match[1].trim() : '';
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

function sitemapUrls(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((match) => match[1]);
}

function robotsSitemaps(text) {
  return [...text.matchAll(/^\s*Sitemap:\s*(\S+)/gim)].map((match) => match[1]);
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
  return Math.max(0, Math.min(100, 100 - penalty));
}

async function audit(target) {
  const targetUrl = normalizeTarget(target);
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
  };

  if (home.error) {
    addIssue(issues, 'critical', 'availability', 'Homepage could not be fetched', home.error, 'Fix DNS, hosting, firewall, or SSL configuration so the homepage returns HTML.', [
      `The homepage for ${targetUrl.hostname} cannot be fetched by the SEO audit.`,
      `Error: ${home.error}`,
      'Investigate DNS, SSL, hosting, Cloudflare Pages/custom-domain routing, and firewall/WAF settings.',
      'Make the public homepage return a 200 HTML response at the canonical URL.',
      'Verify with curl for the homepage, /robots.txt, and /sitemap.xml, then rerun the audit.',
    ].join('\n'));
    return { page, robots: null, sitemaps: [], score: scoreFromIssues(issues), issues };
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

  const finalOrigin = new URL(page.finalUrl).origin;
  const anchors = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)].map((match) => match[1]);
  for (const href of anchors) {
    try {
      const link = new URL(href, page.finalUrl);
      if (link.origin === finalOrigin) page.internalLinks += 1;
      else page.externalLinks += 1;
    } catch {
      // Ignore malformed links for this first version.
    }
  }

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
  if (page.bytes > 900000) addIssue(issues, 'warning', 'performance', 'Large homepage HTML payload', `${Math.round(page.bytes / 1024)} KB of HTML was fetched.`, 'Reduce inline scripts/styles and unnecessary markup.', [
    `Reduce the homepage HTML payload for ${targetUrl.hostname}.`,
    `Current HTML size: ${Math.round(page.bytes / 1024)} KB.`,
    'Move large inline scripts/styles to assets, remove unused markup, and avoid embedding large data blobs in the HTML.',
    'Preserve functionality and visual design, then rerun the SEO audit.',
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

  const sitemapTargets = robots.sitemapLines.length ? robots.sitemapLines.slice(0, 3) : [new URL('/sitemap.xml', finalOrigin).href];
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

  return {
    checkedAt: new Date().toISOString(),
    page,
    robots,
    sitemaps,
    score: scoreFromIssues(issues),
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

import {
  Activity,
  BarChart3,
  CheckCircle2,
  Cloud,
  ExternalLink,
  FileSearch,
  Globe2,
  LayoutDashboard,
  LogIn,
  LogOut,
  Search,
  ShieldCheck,
  Store,
  Terminal,
  Trash2,
  UserRound
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { auditScore, issueCounts, scoreTone } from "@freemarketingstore/audit-core";
import { AuditedSite, consoleRoutes, SITE_STORAGE_KEY } from "@freemarketingstore/shared";

type Page = "dashboard" | "audit" | "sites" | "profile" | "search-console";

type AuthStatus = {
  configured?: boolean;
  googleConfigured?: boolean;
  authenticated?: boolean;
  user?: { email?: string; name?: string } | null;
};

type ProfileStatus = {
  configured?: boolean;
  profileConfigured?: boolean;
  authenticated?: boolean;
  freeSignIn?: boolean;
  storage?: string;
  currentStorage?: string;
  user?: { email?: string; name?: string } | null;
  capabilities?: {
    freeSignIn?: boolean;
    auditHistory?: boolean;
    campaignExecution?: boolean;
  };
};

type SearchConsoleStatus = {
  google?: {
    oauthConfigured?: boolean;
    redirectUri?: string;
  };
  cloudflare?: {
    dnsAutomationConfigured?: boolean;
  };
  capabilities?: {
    persistedProfiles?: boolean;
  };
};

const navItems: Array<{ page: Page; label: string; icon: typeof LayoutDashboard; href: string }> = [
  { page: "dashboard", label: "Overview", icon: LayoutDashboard, href: consoleRoutes.dashboard },
  { page: "audit", label: "Audit", icon: FileSearch, href: consoleRoutes.audit },
  { page: "sites", label: "Sites", icon: Globe2, href: consoleRoutes.sites },
  { page: "profile", label: "Profile", icon: UserRound, href: consoleRoutes.profile },
  { page: "search-console", label: "Search Console", icon: Search, href: consoleRoutes.searchConsole }
];

function currentPage(): Page {
  const path = window.location.pathname.replace(/\/+$/, "/");
  if (path === consoleRoutes.audit) return "audit";
  if (path === consoleRoutes.sites) return "sites";
  if (path === consoleRoutes.profile) return "profile";
  if (path === consoleRoutes.searchConsole) return "search-console";
  return "dashboard";
}

function loadLocalSites(): AuditedSite[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SITE_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalSites(sites: AuditedSite[]) {
  localStorage.setItem(SITE_STORAGE_KEY, JSON.stringify(sites));
}

function domainFor(url: string) {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function safeUrl(value: string) {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

function siteTime(site: AuditedSite) {
  return Date.parse(site.lastAudit?.checkedAt || site.createdAt || "") || 0;
}

function sortSites(sites: AuditedSite[]) {
  return [...sites].sort((a, b) => siteTime(b) - siteTime(a));
}

function checkedAt(site?: AuditedSite) {
  if (!site?.lastAudit?.checkedAt) return "Not audited";
  return new Date(site.lastAudit.checkedAt).toLocaleString();
}

function makeId() {
  return window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function routeTo(page: Page, href: string, setPage: (page: Page) => void) {
  window.history.pushState({}, "", href);
  setPage(page);
  window.scrollTo({ top: 0 });
}

function ToneBadge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function IconButton({
  children,
  href,
  onClick,
  title,
  tone = "neutral"
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  title: string;
  tone?: "primary" | "neutral" | "danger";
}) {
  const className = `icon-button ${tone}`;
  if (href) {
    return (
      <a className={className} href={href} title={title} aria-label={title}>
        {children}
      </a>
    );
  }
  return (
    <button className={className} type="button" onClick={onClick} title={title} aria-label={title}>
      {children}
    </button>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon: typeof Activity }) {
  return (
    <article className="metric">
      <div className="metric-icon">
        <Icon size={18} />
      </div>
      <div>
        <div className="metric-label">{label}</div>
        <div className="metric-value">{value}</div>
      </div>
    </article>
  );
}

function AppShell({
  page,
  setPage,
  children
}: {
  page: Page;
  setPage: (page: Page) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href={consoleRoutes.store}>
          <img src="/favicon.svg" alt="" />
          <span>FreeMarketingStore</span>
        </a>
        <nav className="nav-list" aria-label="Console">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`nav-item ${page === item.page ? "active" : ""}`}
                key={item.page}
                type="button"
                onClick={() => routeTo(item.page, item.href, setPage)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-links">
          <button className="nav-item" type="button" onClick={() => routeTo("audit", consoleRoutes.audit, setPage)}>
            <FileSearch size={16} />
            <span>Website Audit</span>
          </button>
          <a href={consoleRoutes.docs}>
            <BarChart3 size={16} />
            <span>Docs</span>
          </a>
          <a href={consoleRoutes.store}>
            <Store size={16} />
            <span>Store</span>
          </a>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

function AuditLauncher({ compact = false }: { compact?: boolean }) {
  const [value, setValue] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    const url = normalizeUrl(value);
    if (!url) return;
    window.location.href = `${consoleRoutes.audit}?url=${encodeURIComponent(url)}`;
  }
  return (
    <form className={compact ? "audit-launcher compact" : "audit-launcher"} onSubmit={submit}>
      <label htmlFor={compact ? "audit-url-compact" : "audit-url"}>Website</label>
      <div className="input-row">
        <input
          id={compact ? "audit-url-compact" : "audit-url"}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="freegamestore.online"
          autoComplete="url"
        />
        <button className="primary-button" type="submit">
          <FileSearch size={17} />
          <span>Run audit</span>
        </button>
      </div>
    </form>
  );
}

function Dashboard({
  sites,
  auth,
  profile,
  searchConsole,
  setPage
}: {
  sites: AuditedSite[];
  auth: AuthStatus | null;
  profile: ProfileStatus | null;
  searchConsole: SearchConsoleStatus | null;
  setPage: (page: Page) => void;
}) {
  const audited = sites.filter((site) => site.lastAudit);
  const average = audited.length
    ? Math.round(audited.reduce((sum, site) => sum + Number(auditScore(site.lastAudit) || 0), 0) / audited.length)
    : null;
  const latest = sortSites(audited)[0];
  const allIssues = audited.flatMap((site) => site.lastAudit?.issues || []);
  const counts = issueCounts(allIssues);

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">Marketing Console</p>
          <h1>Website health operations</h1>
          <p className="lede">
            Audit public websites, track saved properties, connect Search Console, and keep diagnostic work in FMS before campaign execution moves to PMS.
          </p>
        </div>
        <AuditLauncher />
      </section>

      <section className="metrics-grid">
        <Metric label="Registered sites" value={sites.length} icon={Globe2} />
        <Metric label="Audited sites" value={audited.length} icon={FileSearch} />
        <Metric label="Average score" value={average ?? "-"} icon={Activity} />
        <Metric label="Open issues" value={counts.critical + counts.warning + counts.info} icon={ShieldCheck} />
      </section>

      <section className="content-grid">
        <article className="panel wide">
          <div className="panel-head">
            <div>
              <h2>Latest audit</h2>
              <p>{latest ? `${domainFor(latest.url)} checked ${checkedAt(latest)}` : "No completed report in this browser yet."}</p>
            </div>
            <IconButton href={consoleRoutes.audit} title="Open website audit" tone="primary">
              <FileSearch size={18} />
            </IconButton>
          </div>
          {latest ? (
            <div className="latest-row">
              <div className={`score-ring ${scoreTone(auditScore(latest.lastAudit))}`}>{auditScore(latest.lastAudit)}</div>
              <div className="issue-strip">
                <ToneBadge tone="critical">{issueCounts(latest.lastAudit?.issues).critical} critical</ToneBadge>
                <ToneBadge tone="warning">{issueCounts(latest.lastAudit?.issues).warning} warnings</ToneBadge>
                <ToneBadge tone="neutral">{issueCounts(latest.lastAudit?.issues).info} info</ToneBadge>
              </div>
            </div>
          ) : (
            <AuditLauncher compact />
          )}
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <h2>Profile</h2>
              <p>{auth?.authenticated ? auth.user?.email || "Signed in" : "Local storage mode"}</p>
            </div>
            <ToneBadge tone={auth?.authenticated ? "good" : "warning"}>{auth?.authenticated ? "Signed in" : "Local"}</ToneBadge>
          </div>
          <dl className="facts">
            <div><dt>Storage</dt><dd>{profile?.currentStorage || profile?.storage || "browser-localStorage"}</dd></div>
            <div><dt>Free sign-in</dt><dd>{profile?.freeSignIn || profile?.capabilities?.freeSignIn ? "Ready" : "Needs secrets"}</dd></div>
          </dl>
          <button className="secondary-button" type="button" onClick={() => routeTo("profile", consoleRoutes.profile, setPage)}>
            <UserRound size={17} />
            <span>Open profile</span>
          </button>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <h2>Search Console</h2>
              <p>Google indexing import and Cloudflare verification.</p>
            </div>
            <ToneBadge tone={searchConsole?.google?.oauthConfigured ? "good" : "warning"}>
              {searchConsole?.google?.oauthConfigured ? "Ready" : "Setup"}
            </ToneBadge>
          </div>
          <dl className="facts">
            <div><dt>Google OAuth</dt><dd>{searchConsole?.google?.oauthConfigured ? "Configured" : "Missing"}</dd></div>
            <div><dt>Cloudflare DNS</dt><dd>{searchConsole?.cloudflare?.dnsAutomationConfigured ? "Configured" : "Missing"}</dd></div>
          </dl>
          <button className="secondary-button" type="button" onClick={() => routeTo("search-console", consoleRoutes.searchConsole, setPage)}>
            <Search size={17} />
            <span>Open setup</span>
          </button>
        </article>
      </section>
    </>
  );
}

function AuditPage({
  sites,
  setSites,
  accountMode,
  reload
}: {
  sites: AuditedSite[];
  setSites: (sites: AuditedSite[]) => void;
  accountMode: boolean;
  reload: () => Promise<void>;
}) {
  const params = new URLSearchParams(window.location.search);
  const requestedSite = params.get("site") || "";
  const requestedUrl = params.get("url") || "";
  const [activeId, setActiveId] = useState(requestedSite);
  const [input, setInput] = useState(requestedUrl);
  const [status, setStatus] = useState(requestedUrl ? "Ready to run this audit." : "Enter a public homepage URL.");
  const [busy, setBusy] = useState(false);
  const [autoStarted, setAutoStarted] = useState(false);
  const selected = sites.find((site) => site.id === activeId);
  const report = selected?.lastAudit as any;
  const counts = issueCounts(report?.issues || []);
  const score = auditScore(report);
  const healthSections = Object.values(report?.health?.sections || {}) as Array<any>;

  async function persistAudit(url: string, auditReport: any) {
    if (!accountMode) return null;
    const response = await fetch("/api/sites/audits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, report: auditReport })
    });
    if (!response.ok) return null;
    return response.json().catch(() => null);
  }

  async function runAudit(rawValue = input) {
    const url = normalizeUrl(rawValue);
    if (!url) {
      setStatus("Enter a public homepage URL.");
      return;
    }
    setBusy(true);
    setStatus(`Auditing ${domainFor(url)}...`);
    try {
      const response = await fetch(`/api/audit?url=${encodeURIComponent(url)}`);
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || data.error) throw new Error(data?.error || "Audit failed.");
      const normalized = data.page?.requestedUrl || url;
      const existing = sites.find((site) => site.url === normalized || domainFor(site.url) === domainFor(normalized));
      const site: AuditedSite = {
        ...(existing || { id: makeId(), createdAt: new Date().toISOString() }),
        url: normalized,
        lastAudit: data
      };
      let nextSites = sortSites([site, ...sites.filter((item) => item.id !== site.id)]);
      setSites(nextSites);
      setActiveId(site.id);
      if (!accountMode) saveLocalSites(nextSites);
      const saved = await persistAudit(normalized, data);
      if (saved?.siteId) {
        setActiveId(saved.siteId);
        await reload();
      }
      const nextUrl = new URL(window.location.href);
      nextUrl.search = `?site=${encodeURIComponent(saved?.siteId || site.id)}`;
      window.history.replaceState({}, "", nextUrl);
      setStatus(`Audit complete for ${domainFor(normalized)}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function copyPrompt(prompt: string) {
    await navigator.clipboard.writeText(prompt);
    setStatus("Prompt copied.");
  }

  useEffect(() => {
    if (requestedSite && sites.some((site) => site.id === requestedSite)) setActiveId(requestedSite);
  }, [requestedSite, sites]);

  useEffect(() => {
    if (!requestedUrl || autoStarted) return;
    setAutoStarted(true);
    runAudit(requestedUrl);
  }, [requestedUrl, autoStarted]);

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Website Audit</p>
          <h1>{selected ? domainFor(selected.url) : "Audit a website"}</h1>
          <p className="lede">Run crawlability, SEO, performance shape, security headers, accessibility basics, links, resources, and PWA checks inside the FMS console.</p>
        </div>
        <form className="audit-launcher compact" onSubmit={(event) => { event.preventDefault(); runAudit(); }}>
          <label htmlFor="console-audit-url">Website</label>
          <div className="input-row">
            <input
              id="console-audit-url"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="freegamestore.online"
              autoComplete="url"
            />
            <button className="primary-button" type="submit" disabled={busy}>
              <FileSearch size={17} />
              <span>{busy ? "Auditing" : "Run audit"}</span>
            </button>
          </div>
        </form>
      </section>

      <div className="notice">{status}</div>

      {report ? (
        <>
          <section className="audit-summary">
            <article className={`audit-score ${scoreTone(score)}`}>
              <div>{score ?? "-"}</div>
              <span>Health score</span>
            </article>
            <Metric label="Critical" value={counts.critical} icon={ShieldCheck} />
            <Metric label="Warnings" value={counts.warning} icon={Activity} />
            <Metric label="Info" value={counts.info} icon={BarChart3} />
            <Metric label="Checked" value={report.checkedAt ? new Date(report.checkedAt).toLocaleTimeString() : "-"} icon={CheckCircle2} />
          </section>

          <section className="audit-layout">
            <div className="audit-main">
              <article className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Prioritized issues</h2>
                    <p>{report.issues?.length ? "Use these prompts in the owning repo." : "No blocking issues found in the latest audit."}</p>
                  </div>
                  <a className="secondary-button" href={consoleRoutes.sites}>
                    <Globe2 size={17} />
                    <span>All sites</span>
                  </a>
                </div>
                <div className="issue-list">
                  {report.issues?.length ? (
                    report.issues.map((issue: any, index: number) => (
                      <article className="issue-card" key={`${issue.title}-${index}`}>
                        <div className="issue-card-head">
                          <div>
                            <h3>{issue.title || issue.message || "Audit issue"}</h3>
                            <p>{issue.detail || issue.message}</p>
                          </div>
                          <ToneBadge tone={issue.severity === "critical" ? "critical" : issue.severity === "warning" ? "warning" : "neutral"}>
                            {issue.severity}
                          </ToneBadge>
                        </div>
                        {issue.fix ? <p><strong>Fix:</strong> {issue.fix}</p> : null}
                        {issue.aiPrompt || issue.fix ? (
                          <div className="prompt-card">
                            <pre>{issue.aiPrompt || issue.fix}</pre>
                            <button className="secondary-button" type="button" onClick={() => copyPrompt(issue.aiPrompt || issue.fix)}>
                              <Terminal size={17} />
                              <span>Copy prompt</span>
                            </button>
                          </div>
                        ) : null}
                      </article>
                    ))
                  ) : (
                    <div className="empty-state">
                      <CheckCircle2 size={26} />
                      <p>No issues found.</p>
                    </div>
                  )}
                </div>
              </article>

              <article className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Health sections</h2>
                    <p>Grouped checks from the server-side audit.</p>
                  </div>
                </div>
                <div className="health-grid">
                  {healthSections.map((section) => (
                    <article className="health-panel" key={section.label}>
                      <div className="health-panel-head">
                        <h3>{section.label}</h3>
                        <div className={`score-pill ${scoreTone(section.score ?? null)}`}>{section.score ?? "-"}</div>
                      </div>
                      <div className="check-list">
                        {(section.checks || []).slice(0, 8).map((check: any) => (
                          <div className="check-row" key={`${section.label}-${check.label}`}>
                            <ToneBadge tone={check.status === "pass" ? "good" : check.status === "warn" ? "warning" : "critical"}>{check.status}</ToneBadge>
                            <div>
                              <strong>{check.label}</strong>
                              <p>{check.detail}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </article>
            </div>

            <aside className="panel audit-sidebar">
              <div className="panel-head">
                <div>
                  <h2>Page facts</h2>
                  <p>{report.page?.finalUrl || selected?.url}</p>
                </div>
              </div>
              <dl className="facts compact-facts">
                <div><dt>Title</dt><dd>{report.page?.title || "Missing"}</dd></div>
                <div><dt>Description</dt><dd>{report.page?.description || "Missing"}</dd></div>
                <div><dt>Canonical</dt><dd>{report.page?.canonical || "Missing"}</dd></div>
                <div><dt>Robots</dt><dd>{report.robots?.status || report.robots?.error || "Unknown"}</dd></div>
                <div><dt>Sitemap</dt><dd>{report.sitemaps?.[0] ? `${report.sitemaps[0].status || "unknown"} · ${report.sitemaps[0].urlCount || 0} URLs` : "Not found"}</dd></div>
                <div><dt>Load</dt><dd>{report.page?.responseMs || "?"} ms · {Math.round(Number(report.page?.bytes || 0) / 1024)} KB</dd></div>
                <div><dt>Links</dt><dd>{report.page?.internalLinks ?? 0} internal · {report.page?.externalLinks ?? 0} external</dd></div>
                <div><dt>Security</dt><dd>{report.security?.https ? "HTTPS" : "Not HTTPS"}</dd></div>
                <div><dt>PWA</dt><dd>{report.health?.sections?.application?.score ?? "Not checked"}</dd></div>
              </dl>
              <div className="action-stack">
                <button className="secondary-button" type="button" onClick={() => selected && runAudit(selected.url)} disabled={busy || !selected}>
                  <Activity size={17} />
                  <span>Re-audit</span>
                </button>
                {selected && safeUrl(selected.url) ? (
                  <a className="secondary-button" href={safeUrl(selected.url)} target="_blank" rel="noreferrer">
                    <ExternalLink size={17} />
                    <span>Open site</span>
                  </a>
                ) : null}
              </div>
            </aside>
          </section>
        </>
      ) : (
        <section className="panel">
          <div className="empty-state">
            <FileSearch size={30} />
            <p>No report selected. Run an audit or open a saved site from Sites.</p>
          </div>
        </section>
      )}
    </>
  );
}

function SitesPage({
  sites,
  accountMode,
  setSites
}: {
  sites: AuditedSite[];
  accountMode: boolean;
  setSites: (sites: AuditedSite[]) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return sortSites(sites).filter((site) => {
      if (!normalized) return true;
      return domainFor(site.url).toLowerCase().includes(normalized) || site.url.toLowerCase().includes(normalized);
    });
  }, [query, sites]);

  const audited = sites.filter((site) => site.lastAudit);
  const average = audited.length
    ? Math.round(audited.reduce((sum, site) => sum + Number(auditScore(site.lastAudit) || 0), 0) / audited.length)
    : null;

  async function deleteSite(id: string) {
    if (accountMode) {
      await fetch(`/api/sites/${encodeURIComponent(id)}`, { method: "DELETE" });
    }
    const next = sites.filter((site) => site.id !== id);
    setSites(next);
    if (!accountMode) saveLocalSites(next);
  }

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Portfolio</p>
          <h1>Audited sites</h1>
          <p className="lede">{accountMode ? "Server-backed profile sites." : "Browser-local website reports."}</p>
        </div>
        <AuditLauncher compact />
      </section>
      <section className="metrics-grid">
        <Metric label="Registered" value={sites.length} icon={Globe2} />
        <Metric label="Audited" value={audited.length} icon={FileSearch} />
        <Metric label="Average score" value={average ?? "-"} icon={Activity} />
        <Metric label="Visible" value={filtered.length} icon={Search} />
      </section>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Sites</h2>
            <p>Open reports, rerun audits, or inspect the live property.</p>
          </div>
          <div className="search-box">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by domain" type="search" />
          </div>
        </div>
        <div className="site-table">
          {filtered.length ? (
            filtered.map((site) => {
              const counts = issueCounts(site.lastAudit?.issues);
              const score = auditScore(site.lastAudit);
              const open = safeUrl(site.url);
              return (
                <article className="site-row" key={site.id}>
                  <div>
                    <h3>{domainFor(site.url)}</h3>
                    <p>{site.url}</p>
                    <p>{checkedAt(site)} · {counts.critical} critical · {counts.warning} warnings · {counts.info} info</p>
                  </div>
                  <div className={`score-pill ${scoreTone(score)}`}>{score ?? "New"}</div>
                  <div className="row-actions">
                    <IconButton href={`${consoleRoutes.audit}?site=${encodeURIComponent(site.id)}`} title="Open report" tone="primary">
                      <FileSearch size={17} />
                    </IconButton>
                    <IconButton href={`${consoleRoutes.audit}?url=${encodeURIComponent(site.url)}`} title="Run audit">
                      <Activity size={17} />
                    </IconButton>
                    {open ? (
                      <IconButton href={open} title="Open website">
                        <ExternalLink size={17} />
                      </IconButton>
                    ) : null}
                    <IconButton onClick={() => deleteSite(site.id)} title="Delete site" tone="danger">
                      <Trash2 size={17} />
                    </IconButton>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="empty-state">
              <Globe2 size={26} />
              <p>{sites.length ? "No matching sites." : "No sites registered yet."}</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function ProfilePage({
  profile,
  localSites,
  reload
}: {
  profile: ProfileStatus | null;
  localSites: AuditedSite[];
  reload: () => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const authenticated = Boolean(profile?.authenticated);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    await reload();
  }

  async function importLocalSites() {
    const response = await fetch("/api/sites/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sites: localSites })
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      setMessage(error.error || "Import failed.");
      return;
    }
    setMessage("Local sites imported.");
    await reload();
  }

  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Free profile</h1>
          <p className="lede">Saved diagnostic data belongs in FMS. Publishing and campaign execution belong in PMS.</p>
        </div>
        <div className="action-stack">
          {authenticated ? (
            <>
              <button className="secondary-button" type="button" onClick={importLocalSites} disabled={!localSites.length}>
                <Cloud size={17} />
                <span>Import local sites</span>
              </button>
              <button className="secondary-button" type="button" onClick={signOut}>
                <LogOut size={17} />
                <span>Sign out</span>
              </button>
            </>
          ) : (
            <a className="primary-button" href="/api/auth/google/start?returnTo=%2Fconsole%2Fprofile%2F">
              <LogIn size={17} />
              <span>Sign in with Google</span>
            </a>
          )}
        </div>
      </section>
      {message ? <div className="notice">{message}</div> : null}
      <section className="content-grid">
        <article className="panel">
          <div className="panel-head">
            <div>
              <h2>Identity</h2>
              <p>{authenticated ? profile?.user?.email || "Signed in" : "Anonymous browser session"}</p>
            </div>
            <ToneBadge tone={authenticated ? "good" : "warning"}>{authenticated ? "Signed in" : "Unsigned"}</ToneBadge>
          </div>
          <dl className="facts">
            <div><dt>Configured</dt><dd>{(profile?.profileConfigured ?? profile?.configured) ? "Yes" : "No"}</dd></div>
            <div><dt>Storage</dt><dd>{profile?.currentStorage || profile?.storage || "browser-localStorage"}</dd></div>
            <div><dt>Local sites</dt><dd>{localSites.length}</dd></div>
          </dl>
        </article>
        <article className="panel">
          <div className="panel-head">
            <div>
              <h2>Boundary</h2>
              <p>Diagnostics remain free; execution remains separate.</p>
            </div>
            <CheckCircle2 size={22} />
          </div>
          <dl className="facts">
            <div><dt>FMS</dt><dd>Audits, issues, Search Console imports</dd></div>
            <div><dt>PMS</dt><dd>Campaigns, publishing, sending</dd></div>
          </dl>
        </article>
      </section>
    </>
  );
}

function SearchConsolePage({ status }: { status: SearchConsoleStatus | null }) {
  const [domain, setDomain] = useState("freegamestore.online");
  const requestBody = JSON.stringify({ domain }, null, 2);
  return (
    <>
      <section className="page-head">
        <div>
          <p className="eyebrow">Google</p>
          <h1>Search Console setup</h1>
          <p className="lede">Connect Google URL Inspection and automate domain verification through Cloudflare DNS.</p>
        </div>
        <a className="primary-button" href="/api/search-console/oauth/start?returnTo=%2Fconsole%2Fsearch-console%2F">
          <LogIn size={17} />
          <span>Start Google</span>
        </a>
      </section>
      <section className="metrics-grid">
        <Metric label="Google OAuth" value={status?.google?.oauthConfigured ? "Ready" : "Missing"} icon={Search} />
        <Metric label="Cloudflare DNS" value={status?.cloudflare?.dnsAutomationConfigured ? "Ready" : "Missing"} icon={Cloud} />
        <Metric label="Profile store" value={status?.capabilities?.persistedProfiles ? "Ready" : "Pending"} icon={UserRound} />
        <Metric label="Scope" value="Indexing" icon={ShieldCheck} />
      </section>
      <section className="content-grid">
        <article className="panel wide">
          <div className="panel-head">
            <div>
              <h2>Verification request</h2>
              <p>Domain ownership check routed through the deployed API.</p>
            </div>
          </div>
          <label htmlFor="domain-input">Domain</label>
          <div className="input-row">
            <input id="domain-input" value={domain} onChange={(event) => setDomain(event.target.value)} />
          </div>
          <pre>{["POST /api/search-console/verify-domain", "Authorization: Bearer <google-access-token>", "Content-Type: application/json", "", requestBody].join("\n")}</pre>
        </article>
        <article className="panel">
          <div className="panel-head">
            <div>
              <h2>Runtime</h2>
              <p>Current deployment status.</p>
            </div>
            <ToneBadge tone={status?.google?.oauthConfigured && status.cloudflare?.dnsAutomationConfigured ? "good" : "warning"}>
              {status?.google?.oauthConfigured && status.cloudflare?.dnsAutomationConfigured ? "Ready" : "Needs config"}
            </ToneBadge>
          </div>
          <dl className="facts">
            <div><dt>Redirect URI</dt><dd>{status?.google?.redirectUri || "Not configured"}</dd></div>
            <div><dt>DNS automation</dt><dd>{status?.cloudflare?.dnsAutomationConfigured ? "Configured" : "Missing token"}</dd></div>
          </dl>
        </article>
      </section>
    </>
  );
}

export function App() {
  const [page, setPage] = useState<Page>(currentPage());
  const [sites, setSites] = useState<AuditedSite[]>(sortSites(loadLocalSites()));
  const [localSites, setLocalSites] = useState<AuditedSite[]>(sortSites(loadLocalSites()));
  const [accountMode, setAccountMode] = useState(false);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [profile, setProfile] = useState<ProfileStatus | null>(null);
  const [searchConsole, setSearchConsole] = useState<SearchConsoleStatus | null>(null);

  async function reload() {
    const local = sortSites(loadLocalSites());
    setLocalSites(local);
    try {
      const [authResponse, profileResponse, searchConsoleResponse] = await Promise.all([
        fetch("/api/auth/status"),
        fetch("/api/profile/status"),
        fetch("/api/search-console/status")
      ]);
      const nextAuth = await authResponse.json();
      const nextProfile = await profileResponse.json();
      const nextSearchConsole = await searchConsoleResponse.json();
      setAuth(nextAuth);
      setProfile(nextProfile);
      setSearchConsole(nextSearchConsole);
      if (nextAuth.authenticated) {
        const sitesResponse = await fetch("/api/sites");
        const data = await sitesResponse.json().catch(() => ({}));
        if (Array.isArray(data.sites)) {
          setSites(sortSites(data.sites));
          setAccountMode(true);
          return;
        }
      }
    } catch {
      setAuth(null);
      setProfile(null);
      setSearchConsole(null);
    }
    setSites(local);
    setAccountMode(false);
  }

  useEffect(() => {
    const onPopState = () => setPage(currentPage());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    reload();
  }, []);

  return (
    <AppShell page={page} setPage={setPage}>
      {page === "dashboard" ? (
        <Dashboard sites={sites} auth={auth} profile={profile} searchConsole={searchConsole} setPage={setPage} />
      ) : null}
      {page === "audit" ? <AuditPage sites={sites} setSites={setSites} accountMode={accountMode} reload={reload} /> : null}
      {page === "sites" ? <SitesPage sites={sites} accountMode={accountMode} setSites={setSites} /> : null}
      {page === "profile" ? <ProfilePage profile={profile} localSites={localSites} reload={reload} /> : null}
      {page === "search-console" ? <SearchConsolePage status={searchConsole} /> : null}
    </AppShell>
  );
}

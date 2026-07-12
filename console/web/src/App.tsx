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
  Trash2,
  UserRound
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { auditScore, issueCounts, scoreTone } from "@freemarketingstore/audit-core";
import { AuditedSite, consoleRoutes, SITE_STORAGE_KEY } from "@freemarketingstore/shared";

type Page = "dashboard" | "sites" | "profile" | "search-console";

type AuthStatus = {
  configured?: boolean;
  googleConfigured?: boolean;
  authenticated?: boolean;
  user?: { email?: string; name?: string } | null;
};

type ProfileStatus = {
  configured?: boolean;
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
  { page: "sites", label: "Sites", icon: Globe2, href: consoleRoutes.sites },
  { page: "profile", label: "Profile", icon: UserRound, href: consoleRoutes.profile },
  { page: "search-console", label: "Search Console", icon: Search, href: consoleRoutes.searchConsole }
];

function currentPage(): Page {
  const path = window.location.pathname.replace(/\/+$/, "/");
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
          <a href={consoleRoutes.audit}>
            <FileSearch size={16} />
            <span>Website Audit</span>
          </a>
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
            <div><dt>Configured</dt><dd>{profile?.configured ? "Yes" : "No"}</dd></div>
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
      {page === "sites" ? <SitesPage sites={sites} accountMode={accountMode} setSites={setSites} /> : null}
      {page === "profile" ? <ProfilePage profile={profile} localSites={localSites} reload={reload} /> : null}
      {page === "search-console" ? <SearchConsolePage status={searchConsole} /> : null}
    </AppShell>
  );
}

export const SITE_STORAGE_KEY = "fms-site-audit-sites-v1";

export const consoleRoutes = {
  dashboard: "/console/",
  sites: "/console/sites/",
  profile: "/console/profile/",
  searchConsole: "/console/search-console/",
  audit: "/seo/site-audit/",
  docs: "/docs/",
  store: "/"
} as const;

export type IssueSeverity = "critical" | "warning" | "info";

export type AuditIssue = {
  severity: IssueSeverity;
  title?: string;
  message?: string;
  detail?: string;
};

export type AuditReport = {
  score?: number;
  healthScore?: number;
  checkedAt?: string;
  issues?: AuditIssue[];
  finalUrl?: string;
};

export type AuditedSite = {
  id: string;
  url: string;
  createdAt?: string;
  lastAudit?: AuditReport;
};

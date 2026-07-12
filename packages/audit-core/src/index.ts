import type { AuditIssue, AuditReport } from "@freemarketingstore/shared";

export function issueCounts(issues: AuditIssue[] = []) {
  return issues.reduce(
    (counts, issue) => {
      counts[issue.severity] += 1;
      return counts;
    },
    { critical: 0, warning: 0, info: 0 }
  );
}

export function auditScore(report?: AuditReport) {
  return report?.healthScore ?? report?.score ?? null;
}

export function scoreTone(score: number | null) {
  if (score == null) return "neutral";
  if (score >= 85) return "good";
  if (score >= 65) return "warning";
  return "critical";
}

/**
 * Report builder — aggregates all check results into a scored health report.
 */

import type { SslResult } from "./ssl-checker.js";
import type { DnsResult } from "./dns-checker.js";
import type { EmailAuthResult } from "./email-auth-checker.js";
import type { PerformanceResult } from "./performance-checker.js";
import type { UptimeResult } from "./uptime-checker.js";
import type { LinkCheckResult } from "./link-checker.js";

export interface HealthReport {
  url: string;
  timestamp: string;
  overallScore: number;
  overallGrade: string;
  checks: {
    ssl: SslResult & { weight: number; score: number };
    dns: DnsResult & { weight: number; score: number };
    emailAuth: EmailAuthResult & { weight: number; score: number };
    performance: PerformanceResult & { weight: number; score: number };
    uptime: UptimeResult & { weight: number; score: number };
    links: LinkCheckResult & { weight: number; score: number };
  };
  criticalIssues: string[];
  warnings: string[];
  recommendations: string[];
}

const GRADE_TO_SCORE: Record<string, number> = {
  A: 100,
  B: 80,
  C: 60,
  D: 40,
  F: 10,
};

const WEIGHTS = {
  ssl: 20,
  dns: 10,
  emailAuth: 15,
  performance: 20,
  uptime: 20,
  links: 15,
};

function gradeToScore(grade: string): number {
  return GRADE_TO_SCORE[grade] ?? 0;
}

function scoreToGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

export function buildReport(
  url: string,
  ssl: SslResult,
  dns: DnsResult,
  emailAuth: EmailAuthResult,
  perf: PerformanceResult,
  uptime: UptimeResult,
  links: LinkCheckResult,
): HealthReport {
  const scores = {
    ssl: gradeToScore(ssl.grade),
    dns: gradeToScore(dns.grade),
    emailAuth: gradeToScore(emailAuth.grade),
    performance: gradeToScore(perf.grade),
    uptime: gradeToScore(uptime.grade),
    links: gradeToScore(links.grade),
  };

  // Weighted average
  const totalWeight = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  const overallScore = Math.round(
    (scores.ssl * WEIGHTS.ssl +
      scores.dns * WEIGHTS.dns +
      scores.emailAuth * WEIGHTS.emailAuth +
      scores.performance * WEIGHTS.performance +
      scores.uptime * WEIGHTS.uptime +
      scores.links * WEIGHTS.links) /
      totalWeight,
  );

  const criticalIssues: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  // SSL issues
  if (!ssl.valid) {
    criticalIssues.push("SSL certificate is invalid or expired");
  } else if (ssl.daysUntilExpiry <= 14) {
    criticalIssues.push(`SSL certificate expires in ${ssl.daysUntilExpiry} days`);
  } else if (ssl.daysUntilExpiry <= 30) {
    warnings.push(`SSL certificate expires in ${ssl.daysUntilExpiry} days — renew soon`);
  }

  // DNS issues
  if (dns.a.length === 0) {
    criticalIssues.push("No A records found — domain may not resolve");
  }
  if (dns.ns.length < 2) {
    warnings.push("Less than 2 NS records — no redundancy for DNS resolution");
  }

  // Email auth issues
  if (!emailAuth.spf.found) {
    warnings.push("No SPF record — email spoofing risk");
  }
  if (!emailAuth.dmarc.found) {
    criticalIssues.push("No DMARC record — required by Gmail/Yahoo/Microsoft for deliverability");
  }
  recommendations.push(...emailAuth.recommendations);

  // Performance issues
  if (perf.ttfbMs > 2000) {
    warnings.push(`Slow TTFB: ${perf.ttfbMs}ms (should be < 500ms)`);
  }
  if (perf.pageSizeKb > 3000) {
    warnings.push(`Large page: ${perf.pageSizeKb}KB (should be < 1MB)`);
  }
  if (!perf.hasCompression) {
    recommendations.push("Enable gzip/brotli compression to reduce transfer size");
  }
  if (!perf.hasCaching) {
    recommendations.push("Add Cache-Control headers for static assets");
  }
  if (perf.redirectCount > 2) {
    warnings.push(`${perf.redirectCount} redirects before reaching content — reduce redirect chain`);
  }

  // Uptime
  if (!uptime.reachable) {
    criticalIssues.push("Site is unreachable");
  }

  // Links
  if (links.brokenCount > 0) {
    warnings.push(`${links.brokenCount} broken links found out of ${links.checkedLinks} checked`);
  }

  return {
    url,
    timestamp: new Date().toISOString(),
    overallScore,
    overallGrade: scoreToGrade(overallScore),
    checks: {
      ssl: { ...ssl, weight: WEIGHTS.ssl, score: scores.ssl },
      dns: { ...dns, weight: WEIGHTS.dns, score: scores.dns },
      emailAuth: { ...emailAuth, weight: WEIGHTS.emailAuth, score: scores.emailAuth },
      performance: { ...perf, weight: WEIGHTS.performance, score: scores.performance },
      uptime: { ...uptime, weight: WEIGHTS.uptime, score: scores.uptime },
      links: { ...links, weight: WEIGHTS.links, score: scores.links },
    },
    criticalIssues,
    warnings,
    recommendations,
  };
}

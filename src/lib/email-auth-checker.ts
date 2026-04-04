/**
 * Email authentication checker — validates DMARC, SPF, and DKIM records.
 */

import dns from "node:dns/promises";

export interface EmailAuthResult {
  domain: string;
  spf: {
    found: boolean;
    record: string;
    valid: boolean;
    issues: string[];
  };
  dmarc: {
    found: boolean;
    record: string;
    policy: string;
    valid: boolean;
    issues: string[];
  };
  dkim: {
    found: boolean;
    selectorsChecked: string[];
    records: { selector: string; record: string }[];
    issues: string[];
  };
  grade: string;
  recommendations: string[];
}

const COMMON_DKIM_SELECTORS = [
  "default",
  "google",
  "selector1",  // Microsoft
  "selector2",  // Microsoft
  "k1",         // Mailchimp
  "s1",
  "s2",
  "dkim",
  "mail",
  "smtp",
  "mandrill",
  "zendesk1",
  "everlytickey1",
  "cm",          // Campaign Monitor
];

export async function checkEmailAuth(urlStr: string): Promise<EmailAuthResult> {
  const domain = extractDomain(urlStr);

  const [spf, dmarc, dkim] = await Promise.all([
    checkSpf(domain),
    checkDmarc(domain),
    checkDkim(domain),
  ]);

  const recommendations: string[] = [];
  let score = 0;

  // SPF scoring
  if (spf.found && spf.valid) {
    score += 35;
  } else if (spf.found) {
    score += 15;
    recommendations.push("Fix SPF record issues: " + spf.issues.join("; "));
  } else {
    recommendations.push("Add an SPF record to prevent email spoofing. Example: v=spf1 include:_spf.google.com -all");
  }

  // DMARC scoring
  if (dmarc.found && dmarc.valid) {
    score += 40;
    if (dmarc.policy === "none") {
      score -= 10;
      recommendations.push("Upgrade DMARC policy from 'none' to 'quarantine' or 'reject' for stronger protection");
    }
  } else if (dmarc.found) {
    score += 15;
    recommendations.push("Fix DMARC record issues: " + dmarc.issues.join("; "));
  } else {
    recommendations.push("Add a DMARC record. DMARC is now MANDATORY for Gmail/Yahoo/Microsoft deliverability. Example: v=DMARC1; p=quarantine; rua=mailto:dmarc@" + domain);
  }

  // DKIM scoring
  if (dkim.found) {
    score += 25;
  } else {
    recommendations.push("Configure DKIM signing for your email provider. Check with your ESP for setup instructions.");
  }

  let grade: string;
  if (score >= 90) grade = "A";
  else if (score >= 70) grade = "B";
  else if (score >= 50) grade = "C";
  else if (score >= 30) grade = "D";
  else grade = "F";

  return { domain, spf, dmarc, dkim, grade, recommendations };
}

async function checkSpf(domain: string) {
  const result = { found: false, record: "", valid: false, issues: [] as string[] };

  try {
    const txtRecords = await dns.resolveTxt(domain);
    const spfRecords = txtRecords
      .map((r) => r.join(""))
      .filter((r) => r.startsWith("v=spf1"));

    if (spfRecords.length === 0) return result;

    result.found = true;
    result.record = spfRecords[0];

    if (spfRecords.length > 1) {
      result.issues.push("Multiple SPF records found — only one is allowed per RFC 7208");
    }

    const spf = spfRecords[0];

    if (!spf.includes("-all") && !spf.includes("~all") && !spf.includes("?all")) {
      result.issues.push("SPF record should end with -all (hard fail) or ~all (soft fail)");
    }

    if (spf.includes("+all")) {
      result.issues.push("CRITICAL: +all allows anyone to send as your domain");
    }

    // Count DNS lookups (max 10 per RFC)
    const lookupMechanisms = (spf.match(/\b(include:|a:|mx:|ptr:|redirect=)/g) || []).length;
    if (lookupMechanisms > 10) {
      result.issues.push(`Too many DNS lookups (${lookupMechanisms}/10 max) — may cause PermError`);
    }

    result.valid = result.issues.length === 0;
  } catch {
    // No TXT records
  }

  return result;
}

async function checkDmarc(domain: string) {
  const result = { found: false, record: "", policy: "", valid: false, issues: [] as string[] };

  try {
    const txtRecords = await dns.resolveTxt(`_dmarc.${domain}`);
    const dmarcRecords = txtRecords
      .map((r) => r.join(""))
      .filter((r) => r.startsWith("v=DMARC1"));

    if (dmarcRecords.length === 0) return result;

    result.found = true;
    result.record = dmarcRecords[0];

    // Parse policy
    const policyMatch = dmarcRecords[0].match(/;\s*p=(\w+)/);
    result.policy = policyMatch ? policyMatch[1] : "none";

    if (result.policy === "none") {
      result.issues.push("Policy is 'none' — emails failing DMARC are still delivered (monitoring only)");
    }

    // Check for rua (aggregate reporting)
    if (!dmarcRecords[0].includes("rua=")) {
      result.issues.push("No rua= tag — you won't receive aggregate DMARC reports");
    }

    result.valid = result.issues.filter(
      (i) => !i.includes("monitoring only") && !i.includes("aggregate"),
    ).length === 0;
  } catch {
    // No DMARC record
  }

  return result;
}

async function checkDkim(domain: string) {
  const result = {
    found: false,
    selectorsChecked: COMMON_DKIM_SELECTORS,
    records: [] as { selector: string; record: string }[],
    issues: [] as string[],
  };

  const checks = COMMON_DKIM_SELECTORS.map(async (selector) => {
    try {
      const txt = await dns.resolveTxt(`${selector}._domainkey.${domain}`);
      const record = txt.map((r) => r.join("")).join("");
      if (record.includes("v=DKIM1") || record.includes("k=rsa") || record.includes("p=")) {
        return { selector, record };
      }
    } catch {
      // Not found for this selector
    }
    return null;
  });

  const results = await Promise.all(checks);
  for (const r of results) {
    if (r) {
      result.found = true;
      result.records.push(r);
    }
  }

  if (!result.found) {
    result.issues.push(
      "No DKIM records found for common selectors. DKIM may use a custom selector not checked here.",
    );
  }

  return result;
}

function extractDomain(urlStr: string): string {
  try {
    return new URL(urlStr.startsWith("http") ? urlStr : `https://${urlStr}`).hostname;
  } catch {
    return urlStr.replace(/^https?:\/\//, "").split("/")[0];
  }
}

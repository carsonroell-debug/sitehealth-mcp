#!/usr/bin/env node

/**
 * SiteHealth MCP Server
 *
 * Full website health audit in one tool call. Checks SSL, DNS, email auth
 * (DMARC/SPF/DKIM), page performance, uptime, and broken links.
 * Returns a scored report with actionable recommendations.
 *
 * Zero external API dependencies — all checks use Node builtins.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { checkSsl } from "./lib/ssl-checker.js";
import { checkDns } from "./lib/dns-checker.js";
import { checkEmailAuth } from "./lib/email-auth-checker.js";
import { checkPerformance } from "./lib/performance-checker.js";
import { checkUptime } from "./lib/uptime-checker.js";
import { checkLinks } from "./lib/link-checker.js";
import { buildReport } from "./lib/report-builder.js";

const server = new McpServer(
  { name: "sitehealth-mcp", version: "0.1.0" },
  {
    instructions: [
      "SiteHealth runs a comprehensive website health audit.",
      "",
      "Use `audit_site` for a full audit (SSL + DNS + email auth + performance + uptime + broken links).",
      "Or run individual checks: `check_ssl`, `check_dns`, `check_email_auth`, `check_performance`, `check_uptime`, `check_links`.",
      "",
      "Every check returns a letter grade (A-F) and specific issues/recommendations.",
      "The full audit returns a weighted 0-100 score with critical issues, warnings, and fixes.",
    ].join("\n"),
    capabilities: { logging: {} },
  },
);

// --- Full Audit ---

server.registerTool(
  "audit_site",
  {
    title: "Full Site Health Audit",
    description:
      "Run a comprehensive website health audit — SSL, DNS, DMARC/SPF/DKIM, page performance, " +
      "uptime, and broken links. Returns a 0-100 health score with letter grade, critical issues, " +
      "warnings, and actionable recommendations. All checks run in parallel for speed.",
    inputSchema: z.object({
      url: z.string().describe("Website URL or domain to audit (e.g. 'https://example.com' or 'example.com')"),
      checkLinks: z.boolean().optional().describe("Include broken link check (adds ~10-20s). Default: true"),
      maxLinks: z.number().optional().describe("Max links to check for broken links. Default: 50"),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ url, checkLinks: doLinks, maxLinks }) => {
    const shouldCheckLinks = doLinks !== false;
    const linkLimit = maxLinks ?? 50;

    // Run all checks in parallel
    const [ssl, dns, emailAuth, perf, uptime, links] = await Promise.all([
      checkSsl(url),
      checkDns(url),
      checkEmailAuth(url),
      checkPerformance(url),
      checkUptime(url),
      shouldCheckLinks
        ? checkLinks(url, linkLimit)
        : Promise.resolve({
            url,
            totalLinks: 0,
            checkedLinks: 0,
            brokenLinks: [],
            brokenCount: 0,
            grade: "A" as const,
          }),
    ]);

    const report = buildReport(url, ssl, dns, emailAuth, perf, uptime, links);

    return {
      content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }],
    };
  },
);

// --- Individual Checks ---

server.registerTool(
  "check_ssl",
  {
    title: "SSL Certificate Check",
    description:
      "Check SSL/TLS certificate validity, expiry date, issuer, protocol version, and SANs. " +
      "Returns a grade (A-F) based on days until expiry and cert validity.",
    inputSchema: z.object({
      url: z.string().describe("Website URL or domain to check"),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ url }) => {
    const result = await checkSsl(url);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.registerTool(
  "check_dns",
  {
    title: "DNS Health Check",
    description:
      "Resolve all DNS records (A, AAAA, MX, NS, CNAME, TXT, SOA) and check for " +
      "IPv6 support, MX records, nameserver redundancy, and resolution time.",
    inputSchema: z.object({
      url: z.string().describe("Website URL or domain to check"),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ url }) => {
    const result = await checkDns(url);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.registerTool(
  "check_email_auth",
  {
    title: "Email Authentication Check",
    description:
      "Validate DMARC, SPF, and DKIM records for a domain. Checks for common misconfigurations, " +
      "missing records, and provides fix recommendations. DMARC is now mandatory for Gmail/Yahoo/Microsoft.",
    inputSchema: z.object({
      url: z.string().describe("Website URL or domain to check"),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ url }) => {
    const result = await checkEmailAuth(url);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.registerTool(
  "check_performance",
  {
    title: "Page Performance Check",
    description:
      "Measure TTFB, total load time, page weight, redirect chain, compression, and cache headers. " +
      "Returns performance grade with specific optimization recommendations.",
    inputSchema: z.object({
      url: z.string().describe("Website URL to check"),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ url }) => {
    const result = await checkPerformance(url);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.registerTool(
  "check_uptime",
  {
    title: "Uptime Check",
    description: "HTTP ping to check if a site is reachable and measure response time.",
    inputSchema: z.object({
      url: z.string().describe("Website URL to ping"),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ url }) => {
    const result = await checkUptime(url);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.registerTool(
  "check_links",
  {
    title: "Broken Link Check",
    description:
      "Extract links from a page and check each for broken responses (4xx/5xx). " +
      "Returns broken links with status codes and the page they were found on.",
    inputSchema: z.object({
      url: z.string().describe("Website URL to check for broken links"),
      maxLinks: z.number().optional().describe("Maximum links to check. Default: 50"),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ url, maxLinks }) => {
    const result = await checkLinks(url, maxLinks ?? 50);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  },
);

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SiteHealth MCP server started");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

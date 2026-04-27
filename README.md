# SiteHealth MCP

[![npm](https://img.shields.io/npm/v/sitehealth-mcp)](https://www.npmjs.com/package/sitehealth-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCPize](https://img.shields.io/badge/MCPize-Install-22c55e)](https://mcpize.com/mcp/sitehealth-mcp?ref=YHCCR&utm_source=github&utm_medium=readme)

Full website health audit in one MCP tool call. Zero API keys required.

**One call. Six checks. Scored report.**

> **One-click install:** [Install on MCPize](https://mcpize.com/mcp/sitehealth-mcp?ref=YHCCR&utm_source=github&utm_medium=readme) | `npx sitehealth-mcp`

## Features

- **SSL Certificate** — validity, expiry, issuer, protocol, SANs
- **DNS Health** — A/AAAA/MX/NS/CNAME/TXT/SOA, IPv6, resolution time
- **Email Auth** — DMARC, SPF, DKIM validation with fix recommendations
- **Page Performance** — TTFB, load time, page weight, compression, caching
- **Uptime** — HTTP ping with response time
- **Broken Links** — extract and check page links for 4xx/5xx responses
- **Health Score** — weighted 0-100 score with letter grade (A-F)

## Quick Start

```json
{
  "mcpServers": {
    "sitehealth": {
      "command": "npx",
      "args": ["-y", "sitehealth-mcp"]
    }
  }
}
```

Then ask your AI agent:

> "Audit the health of example.com"

## Tools

| Tool | Description |
|------|-------------|
| `audit_site` | Full audit — all 6 checks, scored report |
| `check_ssl` | SSL cert validity and expiry |
| `check_dns` | DNS records and resolution |
| `check_email_auth` | DMARC/SPF/DKIM validation |
| `check_performance` | TTFB, load time, page weight |
| `check_uptime` | HTTP ping + response time |
| `check_links` | Broken link detection |

## Free vs Pro

| Tool | Free | Pro ($19/mo) |
|------|------|-------------|
| `check_ssl` | Yes | Yes |
| `check_dns` | Yes | Yes |
| `audit_site` | - | Yes |
| `check_email_auth` | - | Yes |
| `check_performance` | - | Yes |
| `check_uptime` | - | Yes |
| `check_links` | - | Yes |

Free tier gives you SSL and DNS checks. Pro unlocks the full 6-check audit with A-F scoring, email authentication, performance, uptime, and broken link detection.

**[Upgrade to Pro on MCPize](https://mcpize.com/mcp/sitehealth-mcp?ref=YHCCR&utm_source=github&utm_medium=readme)** — $19/mo or $190/yr.

## Example Output

```json
{
  "url": "https://example.com",
  "overallScore": 82,
  "overallGrade": "B",
  "criticalIssues": [
    "No DMARC record — required by Gmail/Yahoo/Microsoft for deliverability"
  ],
  "warnings": [
    "SSL certificate expires in 28 days — renew soon",
    "2 broken links found out of 47 checked"
  ],
  "recommendations": [
    "Add a DMARC record: v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com",
    "Enable gzip/brotli compression to reduce transfer size"
  ]
}
```

## How It Works

All checks use Node.js builtins (`tls`, `dns/promises`, `fetch`) — no external API keys, no costs, no rate limits.

```
audit_site("example.com")
  ├── SSL check     (tls socket)      → cert validity, expiry
  ├── DNS check     (dns/promises)    → record resolution
  ├── Email auth    (DNS TXT lookups) → DMARC, SPF, DKIM
  ├── Performance   (timed fetch)     → TTFB, page weight
  ├── Uptime        (HEAD request)    → reachability
  └── Broken links  (page crawl)     → link validation
        ↓
  Weighted score (0-100) + grade (A-F) + recommendations
```

## Scoring Weights

| Check | Weight |
|-------|--------|
| SSL | 20% |
| Performance | 20% |
| Uptime | 20% |
| Email Auth | 15% |
| Links | 15% |
| DNS | 10% |

## Install

### MCPize (Recommended)

One-click install with managed hosting: **[Install on MCPize](https://mcpize.com/mcp/sitehealth-mcp?ref=YHCCR&utm_source=github&utm_medium=readme)**

### npm

```bash
npx sitehealth-mcp
```

## License

MIT — Built by [Freedom Engineers](https://freedomengineers.tech)

## Related

- [SelfHeal MCP](https://mcpize.com/mcp/selfheal-mcp?ref=YHCCR&utm_source=github&utm_medium=readme) — Self-healing proxy for MCP servers
- [LeadEnrich MCP](https://mcpize.com/mcp/leadenrich-mcp?ref=YHCCR&utm_source=github&utm_medium=readme) — Waterfall lead enrichment

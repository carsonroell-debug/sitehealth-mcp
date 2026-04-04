/**
 * DNS health checker — resolves records and checks propagation.
 */

import dns from "node:dns/promises";
import { URL } from "node:url";

export interface DnsResult {
  hostname: string;
  a: string[];
  aaaa: string[];
  mx: { priority: number; exchange: string }[];
  ns: string[];
  cname: string[];
  txt: string[];
  soa: { nsname: string; hostmaster: string; serial: number; refresh: number; retry: number; expire: number; minttl: number } | null;
  resolutionTimeMs: number;
  hasIpv6: boolean;
  hasMx: boolean;
  grade: string;
  error?: string;
}

export async function checkDns(urlStr: string): Promise<DnsResult> {
  const hostname = extractHostname(urlStr);
  const start = Date.now();

  const result: DnsResult = {
    hostname,
    a: [],
    aaaa: [],
    mx: [],
    ns: [],
    cname: [],
    txt: [],
    soa: null,
    resolutionTimeMs: 0,
    hasIpv6: false,
    hasMx: false,
    grade: "A",
  };

  try {
    // Run all lookups concurrently
    const [a, aaaa, mx, ns, txt, soa, cname] = await Promise.allSettled([
      dns.resolve4(hostname),
      dns.resolve6(hostname),
      dns.resolveMx(hostname),
      dns.resolveNs(hostname),
      dns.resolveTxt(hostname),
      dns.resolveSoa(hostname),
      dns.resolveCname(hostname),
    ]);

    result.resolutionTimeMs = Date.now() - start;

    if (a.status === "fulfilled") result.a = a.value;
    if (aaaa.status === "fulfilled") {
      result.aaaa = aaaa.value;
      result.hasIpv6 = aaaa.value.length > 0;
    }
    if (mx.status === "fulfilled") {
      result.mx = mx.value.map((r) => ({ priority: r.priority, exchange: r.exchange }));
      result.hasMx = mx.value.length > 0;
    }
    if (ns.status === "fulfilled") result.ns = ns.value;
    if (txt.status === "fulfilled") result.txt = txt.value.map((r) => r.join(""));
    if (soa.status === "fulfilled") result.soa = soa.value;
    if (cname.status === "fulfilled") result.cname = cname.value;

    // Grade
    if (result.a.length === 0) {
      result.grade = "F";
    } else if (!result.hasMx) {
      result.grade = "B";
    } else if (result.ns.length < 2) {
      result.grade = "C";
    } else {
      result.grade = "A";
    }
  } catch (err) {
    result.resolutionTimeMs = Date.now() - start;
    result.grade = "F";
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

function extractHostname(urlStr: string): string {
  try {
    return new URL(urlStr.startsWith("http") ? urlStr : `https://${urlStr}`).hostname;
  } catch {
    return urlStr.replace(/^https?:\/\//, "").split("/")[0];
  }
}

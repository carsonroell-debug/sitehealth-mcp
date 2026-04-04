/**
 * Page performance checker — measures TTFB, load time, page weight, redirect chain.
 */

export interface PerformanceResult {
  url: string;
  finalUrl: string;
  ttfbMs: number;
  totalLoadMs: number;
  pageSizeBytes: number;
  pageSizeKb: number;
  statusCode: number;
  redirectChain: { url: string; status: number }[];
  redirectCount: number;
  headers: {
    server?: string;
    contentType?: string;
    cacheControl?: string;
    contentEncoding?: string;
    xPoweredBy?: string;
  };
  hasCompression: boolean;
  hasCaching: boolean;
  grade: string;
  error?: string;
}

export async function checkPerformance(urlStr: string): Promise<PerformanceResult> {
  const url = urlStr.startsWith("http") ? urlStr : `https://${urlStr}`;

  const result: PerformanceResult = {
    url,
    finalUrl: url,
    ttfbMs: 0,
    totalLoadMs: 0,
    pageSizeBytes: 0,
    pageSizeKb: 0,
    statusCode: 0,
    redirectChain: [],
    redirectCount: 0,
    headers: {},
    hasCompression: false,
    hasCaching: false,
    grade: "F",
  };

  try {
    // First: follow redirects manually to build chain
    let currentUrl = url;
    for (let i = 0; i < 10; i++) {
      const resp = await fetch(currentUrl, {
        method: "HEAD",
        redirect: "manual",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; SiteHealthBot/1.0; +https://freedomengineers.tech)",
        },
        signal: AbortSignal.timeout(15_000),
      });

      if ([301, 302, 303, 307, 308].includes(resp.status)) {
        const location = resp.headers.get("location");
        if (!location) break;
        const nextUrl = location.startsWith("http")
          ? location
          : new URL(location, currentUrl).href;
        result.redirectChain.push({ url: currentUrl, status: resp.status });
        currentUrl = nextUrl;
      } else {
        break;
      }
    }
    result.redirectCount = result.redirectChain.length;
    result.finalUrl = currentUrl;

    // Full GET to measure performance
    const start = performance.now();
    const resp = await fetch(currentUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SiteHealthBot/1.0; +https://freedomengineers.tech)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
      },
      signal: AbortSignal.timeout(30_000),
    });

    // TTFB is approximated by time to headers
    const ttfb = performance.now();
    result.ttfbMs = Math.round(ttfb - start);

    const body = await resp.arrayBuffer();
    const totalLoad = performance.now();

    result.totalLoadMs = Math.round(totalLoad - start);
    result.pageSizeBytes = body.byteLength;
    result.pageSizeKb = Math.round(body.byteLength / 1024);
    result.statusCode = resp.status;

    // Headers
    result.headers = {
      server: resp.headers.get("server") ?? undefined,
      contentType: resp.headers.get("content-type") ?? undefined,
      cacheControl: resp.headers.get("cache-control") ?? undefined,
      contentEncoding: resp.headers.get("content-encoding") ?? undefined,
      xPoweredBy: resp.headers.get("x-powered-by") ?? undefined,
    };

    result.hasCompression = !!resp.headers.get("content-encoding");
    result.hasCaching = !!resp.headers.get("cache-control") &&
      !resp.headers.get("cache-control")?.includes("no-store");

    // Grade
    result.grade = gradePerformance(result);
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    result.grade = "F";
  }

  return result;
}

function gradePerformance(r: PerformanceResult): string {
  let score = 100;

  // TTFB
  if (r.ttfbMs > 2000) score -= 30;
  else if (r.ttfbMs > 1000) score -= 15;
  else if (r.ttfbMs > 500) score -= 5;

  // Total load
  if (r.totalLoadMs > 5000) score -= 25;
  else if (r.totalLoadMs > 3000) score -= 10;

  // Page size
  if (r.pageSizeKb > 3000) score -= 20;
  else if (r.pageSizeKb > 1000) score -= 10;

  // Compression
  if (!r.hasCompression) score -= 10;

  // Caching
  if (!r.hasCaching) score -= 5;

  // Redirects
  if (r.redirectCount > 2) score -= 10;
  else if (r.redirectCount > 0) score -= 5;

  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  if (score >= 30) return "D";
  return "F";
}

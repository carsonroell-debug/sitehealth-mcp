/**
 * Uptime checker — HTTP ping with response time measurement.
 */

export interface UptimeResult {
  url: string;
  reachable: boolean;
  statusCode: number;
  responseTimeMs: number;
  grade: string;
  error?: string;
}

export async function checkUptime(urlStr: string): Promise<UptimeResult> {
  const url = urlStr.startsWith("http") ? urlStr : `https://${urlStr}`;

  const result: UptimeResult = {
    url,
    reachable: false,
    statusCode: 0,
    responseTimeMs: 0,
    grade: "F",
  };

  try {
    const start = performance.now();
    const resp = await fetch(url, {
      method: "HEAD",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SiteHealthBot/1.0; +https://freedomengineers.tech)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    const elapsed = performance.now() - start;

    result.reachable = resp.status < 500;
    result.statusCode = resp.status;
    result.responseTimeMs = Math.round(elapsed);

    if (!result.reachable) {
      result.grade = "F";
    } else if (elapsed < 300) {
      result.grade = "A";
    } else if (elapsed < 800) {
      result.grade = "B";
    } else if (elapsed < 2000) {
      result.grade = "C";
    } else {
      result.grade = "D";
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    result.grade = "F";
  }

  return result;
}

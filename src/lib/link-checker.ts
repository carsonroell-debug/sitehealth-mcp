/**
 * Lightweight inline link checker.
 * Extracts links from a page and HEAD-checks them.
 * Used as fallback when LinkRescue API is not available.
 */

export interface LinkCheckResult {
  url: string;
  totalLinks: number;
  checkedLinks: number;
  brokenLinks: BrokenLink[];
  brokenCount: number;
  grade: string;
  error?: string;
}

export interface BrokenLink {
  url: string;
  statusCode: number;
  foundOn: string;
  error?: string;
}

export async function checkLinks(
  urlStr: string,
  maxLinks = 50,
): Promise<LinkCheckResult> {
  const url = urlStr.startsWith("http") ? urlStr : `https://${urlStr}`;

  const result: LinkCheckResult = {
    url,
    totalLinks: 0,
    checkedLinks: 0,
    brokenLinks: [],
    brokenCount: 0,
    grade: "A",
  };

  try {
    // Fetch the page
    const resp = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SiteHealthBot/1.0; +https://freedomengineers.tech)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!resp.ok) {
      result.error = `Page returned ${resp.status}`;
      result.grade = "F";
      return result;
    }

    const html = await resp.text();

    // Extract unique href links
    const linkRegex = /href=["']([^"']+)["']/gi;
    const links = new Set<string>();
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      if (
        href.startsWith("http") &&
        !href.includes("javascript:") &&
        !href.includes("mailto:") &&
        !href.includes("tel:")
      ) {
        links.add(href);
      }
    }

    result.totalLinks = links.size;
    const toCheck = Array.from(links).slice(0, maxLinks);

    // Check links concurrently (batches of 10)
    const batchSize = 10;
    for (let i = 0; i < toCheck.length; i += batchSize) {
      const batch = toCheck.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((link) => checkSingleLink(link, url)),
      );

      for (const r of results) {
        result.checkedLinks++;
        if (r.status === "fulfilled" && r.value) {
          result.brokenLinks.push(r.value);
        }
      }
    }

    result.brokenCount = result.brokenLinks.length;

    // Grade based on broken percentage
    if (result.checkedLinks === 0) {
      result.grade = "A";
    } else {
      const brokenPct = result.brokenCount / result.checkedLinks;
      if (brokenPct === 0) result.grade = "A";
      else if (brokenPct < 0.02) result.grade = "B";
      else if (brokenPct < 0.05) result.grade = "C";
      else if (brokenPct < 0.1) result.grade = "D";
      else result.grade = "F";
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    result.grade = "F";
  }

  return result;
}

async function checkSingleLink(
  linkUrl: string,
  foundOn: string,
): Promise<BrokenLink | null> {
  try {
    const resp = await fetch(linkUrl, {
      method: "HEAD",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SiteHealthBot/1.0; +https://freedomengineers.tech)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });

    if (resp.status >= 400) {
      return { url: linkUrl, statusCode: resp.status, foundOn };
    }
    return null;
  } catch (err) {
    return {
      url: linkUrl,
      statusCode: 0,
      foundOn,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

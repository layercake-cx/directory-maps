/**
 * Entity-agnostic pieces of the static-publish pipeline, extracted out of
 * generate_directory_pages/index.ts (Epic 3) so a second generator
 * (generate_directory_site, for the Directory entity — DIR-E2/Phase 3b of
 * the Directories build-out) can reuse the same mechanism without
 * duplicating it or coupling to generate_directory_pages' map/listing-
 * specific logic.
 *
 * Extracted verbatim, no behaviour change: generate_directory_pages now
 * imports these instead of defining them locally. Verify byte-identical
 * output before/after this refactor for any existing map before adding a
 * Directory-specific caller.
 */

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escapeAttr(s: unknown): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Runs fn over items with at most `limit` calls in flight at once — a
 * worker-pool concurrency limiter, not fixed-size batching, so a slow item
 * doesn't stall workers that could be picking up the next one. Built for
 * uploadToBlob call sites where each item's upload is independent of every
 * other and a plain sequential loop was the dominant cost of a full
 * directory/map republish (measured: ~120s for 177 entries, essentially all
 * of it this loop).
 */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableBlobStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

/** Upload a file to Vercel Blob at a deterministic (non-random-suffixed) path.
 * Retries transient 5xx/429/network failures — a directory republish of
 * hundreds of pages otherwise fails the whole run on a single Blob 503. */
export async function uploadToBlob(pathname: string, body: string, contentType: string): Promise<string> {
  const token = Deno.env.get("BLOB_READ_WRITE_TOKEN");
  if (!token) throw new Error("Missing BLOB_READ_WRITE_TOKEN");

  const maxAttempts = 6;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(`https://blob.vercel-storage.com/${pathname}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-api-version": "7",
          "Content-Type": contentType,
          "x-access": "public",
          "x-add-random-suffix": "0",
          // No CDN caching — overwriting the same deterministic path doesn't
          // purge edge caches otherwise.
          "x-cache-control": "max-age=0, s-maxage=0, must-revalidate",
        },
        body,
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === maxAttempts) throw lastError;
      await sleep(400 * 2 ** (attempt - 1) + Math.floor(Math.random() * 200));
      continue;
    }

    if (res.ok) {
      const result = await res.json();
      return result.url as string;
    }

    const text = await res.text().catch(() => "(no body)");
    lastError = new Error(`Blob upload failed ${res.status}: ${text}`);
    if (!isRetryableBlobStatus(res.status) || attempt === maxAttempts) throw lastError;
    await sleep(400 * 2 ** (attempt - 1) + Math.floor(Math.random() * 200));
  }

  throw lastError ?? new Error("Blob upload failed");
}

/**
 * A minimal, generic HTML document shell for a single-entity page
 * (title/description/canonical/JSON-LD/body). Byte-identical to
 * generate_directory_pages' original inline definition — verified before
 * this extraction. A caller needing different styling should build its own
 * shell rather than parameterising this one, to keep it a stable, exact
 * contract for the existing map feature.
 */
export function pageShell(opts: { title: string; description: string; canonicalUrl: string; jsonLd: Record<string, unknown>; body: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
<meta name="description" content="${escapeAttr(opts.description)}">
<link rel="canonical" href="${escapeAttr(opts.canonicalUrl)}">
<script type="application/ld+json">${JSON.stringify(opts.jsonLd)}</script>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; max-width: 720px; margin: 0 auto; padding: 24px 16px; line-height: 1.5; color: #111827; }
  a { color: #2563eb; }
  dt { font-weight: 600; margin-top: 10px; }
  dd { margin-left: 0; }
  .back-link { font-size: 14px; margin-bottom: 16px; display: inline-block; }
  .listing-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; }
</style>
</head>
<body>
${opts.body}
</body>
</html>`;
}

/** One sitemap URL: a loc string, or loc plus an optional last-modified timestamp. */
export type SitemapUrl = string | { loc: string; lastmod?: string | Date | null };

/**
 * Sitemap lastmod as W3C date (YYYY-MM-DD). Crawlers treat this as the
 * content-change date, not the republish time.
 */
export function formatSitemapLastmod(value: string | Date | null | undefined): string | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** A minimal sitemap.xml for a flat list of absolute URLs, with optional lastmod. */
export function buildSitemapXml(urls: SitemapUrl[]): string {
  const body = urls
    .map((item) => {
      const loc = typeof item === "string" ? item : item.loc;
      const lastmod = typeof item === "string" ? null : formatSitemapLastmod(item.lastmod);
      const lastmodXml = lastmod ? `\n    <lastmod>${escapeXml(lastmod)}</lastmod>` : "";
      return `  <url>\n    <loc>${escapeXml(loc)}</loc>${lastmodXml}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`;
}

/**
 * AI crawlers explicitly named so directories signal AI-search/citation
 * eligibility rather than relying on silent inclusion under `User-agent: *`
 * (some AI providers' bots are blocked by default elsewhere on the web).
 */
const AI_CRAWLER_USER_AGENTS = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"];

/**
 * A minimal robots.txt gating an entire site on/off, per the Settings tab's
 * single "let search engines index this" switch — not a per-path rules
 * engine, since there's no per-path UI driving one. Named AI crawlers get
 * their own block mirroring the same site-wide policy.
 */
export function buildRobotsTxt(indexable: boolean, sitemapUrl: string): string {
  const rule = indexable ? "Allow: /" : "Disallow: /";
  const blocks = ["*", ...AI_CRAWLER_USER_AGENTS].map((ua) => `User-agent: ${ua}\n${rule}`).join("\n\n");
  return indexable ? `${blocks}\n\nSitemap: ${sitemapUrl}\n` : `${blocks}\n`;
}

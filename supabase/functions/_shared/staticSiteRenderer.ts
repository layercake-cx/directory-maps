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

export function humanizeKey(key: string): string {
  return key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Renders arbitrary admin-defined research JSON (or any nested plain-object
 * data) as a readable nested definition list. Never assumes specific field
 * names.
 */
export function renderResearchAsHtml(value: unknown, depth = 0): string {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) {
    const items = value.map((v) => renderResearchAsHtml(v, depth + 1)).filter(Boolean);
    if (items.length === 0) return "";
    return `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => {
        const rendered = renderResearchAsHtml(v, depth + 1);
        if (!rendered) return "";
        return `<dt>${escapeHtml(humanizeKey(k))}</dt><dd>${rendered}</dd>`;
      })
      .filter(Boolean);
    if (entries.length === 0) return "";
    return `<dl>${entries.join("")}</dl>`;
  }
  return escapeHtml(value);
}

/** Upload a file to Vercel Blob at a deterministic (non-random-suffixed) path. */
export async function uploadToBlob(pathname: string, body: string, contentType: string): Promise<string> {
  const token = Deno.env.get("BLOB_READ_WRITE_TOKEN");
  if (!token) throw new Error("Missing BLOB_READ_WRITE_TOKEN");

  const res = await fetch(`https://blob.vercel-storage.com/${pathname}`, {
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

  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`Blob upload failed ${res.status}: ${text}`);
  }
  const result = await res.json();
  return result.url as string;
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

/** A minimal sitemap.xml for a flat list of absolute URLs. */
export function buildSitemapXml(urls: string[]): string {
  const body = urls.map((u) => `<url><loc>${escapeXml(u)}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`;
}

/**
 * generate_directory_pages (Epic 3 — Directory & LLM/Search Discoverability)
 *
 * Generates crawlable static HTML — a directory landing page plus one page
 * per listing, each with schema.org JSON-LD — and uploads them to Vercel
 * Blob at deterministic paths:
 *
 *   directory/<client_slug>/<map_slug>/index.html
 *   directory/<client_slug>/<map_slug>/<listing_slug>.html
 *   directory/<client_slug>/<map_slug>/sitemap.xml
 *
 * A Vercel Edge Middleware (`middleware.js`, repo root) serves these
 * directly at /<clientSlug>/<mapSlug>/directory[/<listingSlug>] — before
 * the request ever reaches the SPA's index.html fallback. Every other path
 * on the site is untouched.
 *
 * Gated on both the `directory_pages` beta feature flag (per-client rollout
 * control) and the `maps.directory_pages` commercial entitlement — unlike
 * ai_search's enrichment, there's no per-map "prompt configured" opt-in
 * step here, since there's no LLM cost to generating these pages: any
 * entitled, flag-enabled client's published maps get them automatically.
 *
 * Content: listing_research (Epic 2 enrichment) when present, falling back
 * to notes_html. Research is admin-defined free-form JSON (whatever their
 * enrichment prompt asked for), so it's rendered generically as a
 * definition list rather than assuming any specific field names.
 *
 * Called:
 *   - After every successful publish (fire-and-forget from the dashboard)
 *   - Via nightly cron for all published maps (body: { all: true })
 *
 * Body (JSON): { map_id: string } or { all: true }
 * Auth: service-role only (called server-side / from cron).
 */

import { createServiceClient } from "../_shared/supabase.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: unknown): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

function humanizeKey(key: string): string {
  return key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Renders arbitrary admin-defined research JSON as a readable nested
 * definition list. Never assumes specific field names, since the shape is
 * whatever that map's enrichment prompt asked the model to produce.
 */
function renderResearchAsHtml(value: unknown, depth = 0): string {
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
async function uploadToBlob(pathname: string, body: string, contentType: string): Promise<string> {
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
      // No CDN caching, same reasoning as generate_map_snapshot — overwriting
      // the same deterministic path doesn't purge edge caches otherwise.
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

type Listing = {
  id: string;
  name: string;
  slug: string;
  group_id: string | null;
  address: string | null;
  postcode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website_url: string | null;
  notes_html: string | null;
  allow_html: boolean;
  lat: number | null;
  lng: number | null;
};

type Group = { id: string; name: string; color: string | null };

function listingSchemaOrg(listing: Listing, canonicalUrl: string): Record<string, unknown> {
  const address =
    listing.address || listing.postcode || listing.country
      ? {
          "@type": "PostalAddress",
          streetAddress: listing.address ?? undefined,
          postalCode: listing.postcode ?? undefined,
          addressCountry: listing.country ?? undefined,
        }
      : undefined;
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: listing.name,
    url: canonicalUrl,
    ...(address ? { address } : {}),
    ...(listing.phone ? { telephone: listing.phone } : {}),
    ...(listing.email ? { email: listing.email } : {}),
    ...(listing.website_url ? { sameAs: [listing.website_url] } : {}),
    ...(typeof listing.lat === "number" && typeof listing.lng === "number"
      ? { geo: { "@type": "GeoCoordinates", latitude: listing.lat, longitude: listing.lng } }
      : {}),
  };
}

function pageShell(opts: { title: string; description: string; canonicalUrl: string; jsonLd: Record<string, unknown>; body: string }): string {
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

function buildListingPage(opts: {
  clientSlug: string;
  mapSlug: string;
  mapName: string;
  listing: Listing;
  research: Record<string, unknown> | null;
}): string {
  const { clientSlug, mapSlug, mapName, listing, research } = opts;
  const canonicalUrl = `https://maps.layercake-cx.biz/${clientSlug}/${mapSlug}/directory/${listing.slug}`;
  const landingUrl = `/${clientSlug}/${mapSlug}/directory`;
  const interactiveUrl = `/${clientSlug}/${mapSlug}`;

  const location = [listing.address, listing.postcode, listing.country].filter(Boolean).join(", ");
  const researchHtml = research ? renderResearchAsHtml(research) : "";
  // Fall back to notes_html whenever research didn't actually render anything —
  // not just when no research row exists. An empty/incomplete research row
  // (e.g. {}) should still fall back, not silently produce a blank page.
  const fallbackNotes = !researchHtml && listing.notes_html
    ? listing.allow_html
      ? listing.notes_html
      : `<p>${escapeHtml(listing.notes_html)}</p>`
    : "";

  const description = location
    ? `${listing.name} — ${location}`
    : listing.name;

  const body = `
<a class="back-link" href="${escapeAttr(landingUrl)}">&larr; Back to ${escapeHtml(mapName)}</a>
<h1>${escapeHtml(listing.name)}</h1>
${location ? `<p>${escapeHtml(location)}</p>` : ""}
${listing.phone ? `<p>Phone: ${escapeHtml(listing.phone)}</p>` : ""}
${listing.email ? `<p>Email: <a href="mailto:${escapeAttr(listing.email)}">${escapeHtml(listing.email)}</a></p>` : ""}
${listing.website_url ? `<p><a href="${escapeAttr(listing.website_url)}" rel="noopener noreferrer">Visit website</a></p>` : ""}
${researchHtml || fallbackNotes}
<p><a href="${escapeAttr(interactiveUrl)}">View on the interactive map</a></p>
`.trim();

  return pageShell({
    title: `${listing.name} — ${mapName}`,
    description,
    canonicalUrl,
    jsonLd: listingSchemaOrg(listing, canonicalUrl),
    body,
  });
}

function buildLandingPage(opts: {
  clientSlug: string;
  mapSlug: string;
  mapId: string;
  mapName: string;
  logoUrl: string | null;
  listings: Listing[];
  groups: Group[];
}): string {
  const { clientSlug, mapSlug, mapId, mapName, logoUrl, listings, groups } = opts;
  const canonicalUrl = `https://maps.layercake-cx.biz/${clientSlug}/${mapSlug}/directory`;
  const interactiveUrl = `/${clientSlug}/${mapSlug}`;
  const embedUrl = `/embed?map=${encodeURIComponent(mapId)}`;

  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
  const groupsWithListings = groups.filter((g) => listings.some((l) => l.group_id === g.id));

  const filterBadges = groupsWithListings
    .map((g) => `<span class="filter-badge">${escapeHtml(g.name)}</span>`)
    .join("");

  const items = listings
    .map((l) => {
      const location = [l.address, l.postcode, l.country].filter(Boolean).join(", ");
      const groupName = l.group_id ? groupNameById.get(l.group_id) : null;
      return `<div class="listing-card"><a href="${escapeAttr(`/${clientSlug}/${mapSlug}/directory/${l.slug}`)}"><strong>${escapeHtml(l.name)}</strong></a>${groupName ? `<span class="listing-card__group">${escapeHtml(groupName)}</span>` : ""}${location ? `<div>${escapeHtml(location)}</div>` : ""}</div>`;
    })
    .join("\n");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: mapName,
    itemListElement: listings.map((l, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `https://maps.layercake-cx.biz/${clientSlug}/${mapSlug}/directory/${l.slug}`,
      name: l.name,
    })),
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(mapName)}</title>
<meta name="description" content="${escapeAttr(`${mapName} — ${listings.length} listing${listings.length === 1 ? "" : "s"}`)}">
<link rel="canonical" href="${escapeAttr(canonicalUrl)}">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; margin: 0; color: #111827; }
  header { display: flex; align-items: center; gap: 12px; padding: 10px 20px; border-bottom: 1px solid #e5e7eb; }
  header img { height: 32px; width: auto; }
  header h1 { font-size: 18px; margin: 0; font-weight: 600; }
  .map-frame { width: 100%; height: 60vh; min-height: 360px; border: 0; display: block; }
  main { max-width: 900px; margin: 0 auto; padding: 20px 16px 40px; }
  .filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
  .filter-badge { background: #f3f4f6; border-radius: 999px; padding: 4px 12px; font-size: 13px; }
  .listing-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; }
  .listing-card__group { display: inline-block; margin-left: 8px; font-size: 12px; color: #6b7280; }
  a { color: #2563eb; }
</style>
</head>
<body>
<header>
${logoUrl ? `<img src="${escapeAttr(logoUrl)}" alt="${escapeAttr(mapName)} logo">` : ""}
<h1>${escapeHtml(mapName)}</h1>
</header>
<iframe class="map-frame" src="${escapeAttr(embedUrl)}" loading="lazy" title="${escapeAttr(mapName)} interactive map"></iframe>
<main>
<p>${listings.length} listing${listings.length === 1 ? "" : "s"}. <a href="${escapeAttr(interactiveUrl)}">Open the full interactive map</a>.</p>
${filterBadges ? `<div class="filters">${filterBadges}</div>` : ""}
${items}
</main>
</body>
</html>`;
}

function buildSitemap(opts: { clientSlug: string; mapSlug: string; listings: Listing[] }): string {
  const { clientSlug, mapSlug, listings } = opts;
  const base = `https://maps.layercake-cx.biz/${clientSlug}/${mapSlug}/directory`;
  const urls = [base, ...listings.map((l) => `${base}/${l.slug}`)]
    .map((u) => `<url><loc>${escapeXml(u)}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function resolveDirectoryPagesFlag(
  db: ReturnType<typeof createServiceClient>,
  clientId: string,
): Promise<boolean> {
  const { data: override } = await db
    .from("feature_flag_overrides")
    .select("enabled")
    .eq("client_id", clientId)
    .eq("flag_key", "directory_pages")
    .maybeSingle();
  if (override) return override.enabled === true;

  const { data: flag } = await db
    .from("feature_flags")
    .select("default_enabled")
    .eq("key", "directory_pages")
    .maybeSingle();
  return flag?.default_enabled === true;
}

async function generateForMap(mapId: string): Promise<{ map_id: string; skipped?: string; count?: number }> {
  const db = createServiceClient();

  const { data: mapRow, error: mapErr } = await db
    .from("maps")
    .select("id, client_id, name, slug, current_publication_id")
    .eq("id", mapId)
    .single();
  if (mapErr) throw new Error(`Map query failed: ${mapErr.message}`);
  if (!mapRow?.current_publication_id) throw new Error(`Map ${mapId} has no current publication — publish it first`);

  let logoUrl: string | null = null;
  const { data: pubRow } = await db
    .from("map_publications")
    .select("config")
    .eq("id", mapRow.current_publication_id)
    .maybeSingle();
  const publishedTheme = (pubRow?.config as { map?: { theme_json?: { logoUrl?: string } } } | null)?.map?.theme_json;
  if (publishedTheme?.logoUrl) logoUrl = publishedTheme.logoUrl;

  const { data: groupRows, error: groupErr } = await db
    .from("groups")
    .select("id, name, color")
    .eq("map_id", mapId);
  if (groupErr) throw new Error(`Groups query failed: ${groupErr.message}`);
  const groups = (groupRows ?? []) as Group[];

  const { data: client, error: clientErr } = await db
    .from("clients")
    .select("id, slug")
    .eq("id", mapRow.client_id)
    .single();
  if (clientErr) throw new Error(`Client query failed: ${clientErr.message}`);

  const flagEnabled = await resolveDirectoryPagesFlag(db, client.id);
  if (!flagEnabled) return { map_id: mapId, skipped: "flag_disabled" };

  const { data: entitled, error: entErr } = await db.rpc("resolve_directory_pages_entitlement", {
    p_client_id: client.id,
  });
  if (entErr) throw new Error(`Entitlement check failed: ${entErr.message}`);
  if (!entitled) return { map_id: mapId, skipped: "not_entitled" };

  const { data: listings, error: listErr } = await db
    .from("listings")
    .select("id, name, slug, group_id, address, postcode, country, phone, email, website_url, notes_html, allow_html, lat, lng")
    .eq("map_id", mapId)
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (listErr) throw new Error(`Listings query failed: ${listErr.message}`);
  const activeListing = (listings ?? []) as Listing[];

  const ids = activeListing.map((l) => l.id);
  let researchByListing = new Map<string, Record<string, unknown>>();
  if (ids.length > 0) {
    const { data: research, error: researchErr } = await db
      .from("listing_research")
      .select("listing_id, data")
      .in("listing_id", ids);
    if (researchErr) throw new Error(`Research query failed: ${researchErr.message}`);
    researchByListing = new Map((research ?? []).map((r) => [r.listing_id, r.data as Record<string, unknown>]));
  }

  const basePath = `directory/${client.slug}/${mapRow.slug}`;

  for (const listing of activeListing) {
    const html = buildListingPage({
      clientSlug: client.slug,
      mapSlug: mapRow.slug,
      mapName: mapRow.name,
      listing,
      research: researchByListing.get(listing.id) ?? null,
    });
    await uploadToBlob(`${basePath}/${listing.slug}.html`, html, "text/html; charset=utf-8");
  }

  const landingHtml = buildLandingPage({
    clientSlug: client.slug,
    mapSlug: mapRow.slug,
    mapId: mapRow.id,
    mapName: mapRow.name,
    logoUrl,
    groups,
    listings: activeListing,
  });
  await uploadToBlob(`${basePath}/index.html`, landingHtml, "text/html; charset=utf-8");

  const sitemap = buildSitemap({ clientSlug: client.slug, mapSlug: mapRow.slug, listings: activeListing });
  await uploadToBlob(`${basePath}/sitemap.xml`, sitemap, "application/xml; charset=utf-8");

  return { map_id: mapId, count: activeListing.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const { map_id, all } = body as { map_id?: string; all?: boolean };

    if (all) {
      const db = createServiceClient();
      const { data: maps, error } = await db.from("maps").select("id").not("current_publication_id", "is", null);
      if (error) throw new Error(`Maps query failed: ${error.message}`);

      const results = await Promise.allSettled((maps ?? []).map((m) => generateForMap(m.id)));
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results
        .filter((r) => r.status === "rejected")
        .map((r) => (r as PromiseRejectedResult).reason?.message ?? "unknown");

      return json({ ok: true, total: results.length, succeeded, failed });
    }

    if (!map_id) return json({ error: "Provide map_id or all: true" }, 400);

    const result = await generateForMap(map_id);
    return json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("generate_directory_pages error:", msg);
    return json({ error: msg }, 500);
  }
});

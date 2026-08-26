/**
 * generate_directory_site (DIR-E2 — Directories build-out, Phase 3b)
 *
 * The Directory entity's own static-publish generator — NOT to be confused
 * with generate_directory_pages (Epic 3), which generates SEO pages from an
 * existing Map's listings. This one generates pages for a Directory
 * (directories/directory_entries), a separate, newer product entity. Kept
 * as its own function rather than folded into generate_directory_pages: the
 * two entities have unrelated gating (feature flag vs. a paid map
 * entitlement) and mixing that into one function body risked exactly the
 * naming confusion this comment exists to avoid. Both share the
 * entity-agnostic rendering mechanics via _shared/staticSiteRenderer.ts.
 *
 * Generates a directory landing page plus one page per active entry, each
 * with schema.org JSON-LD, and uploads them to Vercel Blob at deterministic
 * paths — a distinct top-level prefix ("directories/", plural) from
 * generate_directory_pages' ("directory/", singular) so the two can never
 * collide even if a client's map slug and directory slug happen to match:
 *
 *   directories/<client_slug>/<directory_slug>/index.html
 *   directories/<client_slug>/<directory_slug>/<entry_slug>.html
 *   directories/<client_slug>/<directory_slug>/sitemap.xml
 *
 * middleware.js serves these at /directories/:clientSlug/:directorySlug
 * [/:entrySlug] on the branded domain — a path shape chosen specifically to
 * never collide with the existing /:clientSlug/:mapSlug interactive-map
 * route (which is exactly 2 segments, client-side routed, and must not pay
 * for an extra lookup on every load). Custom-domain serving for directories
 * is a later phase (DIR-E3/Phase 4), not built here.
 *
 * Gated on the `directories` feature flag only — this entity has no
 * separate commercial entitlement yet (unlike directory_pages, which is a
 * paid map add-on); if a client can use Directories at all, they can
 * publish one.
 *
 * A directory must already be published (directories.current_publication_id
 * set, via the publish_directory RPC) before this runs — there is no
 * Publish UI yet to call that RPC from, so this function can only be
 * exercised today via a direct RPC call. Entries and their tags/extras are
 * read live at generation time, never snapshotted (see
 * 20260827120000_directory_publish_foundation.sql's header comment for why
 * this mirrors map_publications/EmbedMap.jsx's existing split).
 *
 * Body (JSON): { directory_id: string } or { all: true }
 * Auth: service-role only (called server-side).
 */

import { createServiceClient } from "../_shared/supabase.ts";
import {
  CORS,
  json,
  escapeHtml,
  escapeAttr,
  uploadToBlob,
  pageShell,
  buildSitemapXml,
} from "../_shared/staticSiteRenderer.ts";

const SITE_ORIGIN = "https://maps.layercake-cx.biz";

type Entry = {
  id: string;
  name: string;
  slug: string;
  directory_group_id: string | null;
  address: string | null;
  postcode: string | null;
  country: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  website_url: string | null;
  notes_html: string | null;
  allow_html: boolean;
  lat: number | null;
  lng: number | null;
  show_phone: boolean;
  show_email: boolean;
  show_website: boolean;
  show_address: boolean;
  meta_title: string | null;
  meta_description: string | null;
  noindex: boolean | null;
  structured_data_type: string | null;
};

type EvidenceItem = { entry_id: string; claim: string; value: string | null; source_url: string | null; confidence: string | null };
type MediaAsset = { entry_id: string; url: string; alt_text: string; caption: string | null; is_hero: boolean };
type AccreditationHeld = { entry_id: string; name: string; issuing_body: string | null; badge_image_url: string | null };
type EntryLink = { entry_id: string | null; directory_id: string | null; label: string; url: string; style: string; open_in_new: boolean; tracking: boolean };
type ProductTile = { entry_id: string; title: string; image_url: string | null; price: number | null; currency: string | null; rating: number | null; provider: string | null; destination_url: string };

async function resolveDirectoriesFlag(db: ReturnType<typeof createServiceClient>, clientId: string): Promise<boolean> {
  const { data: override } = await db
    .from("feature_flag_overrides")
    .select("enabled")
    .eq("client_id", clientId)
    .eq("flag_key", "directories")
    .maybeSingle();
  if (override) return override.enabled === true;

  const { data: flag } = await db
    .from("feature_flags")
    .select("default_enabled")
    .eq("key", "directories")
    .maybeSingle();
  return flag?.default_enabled === true;
}

function linkTiles(links: EntryLink[]): string {
  if (links.length === 0) return "";
  const items = links
    .map((l) => {
      const rel = [l.open_in_new ? "noopener noreferrer" : null, l.tracking ? "sponsored nofollow" : null].filter(Boolean).join(" ");
      const target = l.open_in_new ? ' target="_blank"' : "";
      return `<a class="link-tile link-tile--${l.style === "primary" ? "primary" : "secondary"}" href="${escapeAttr(l.url)}"${target}${rel ? ` rel="${escapeAttr(rel)}"` : ""}>${escapeHtml(l.label)}</a>`;
    })
    .join("");
  return `<div class="link-tiles">${items}</div>`;
}

function entrySchemaOrg(entry: Entry, canonicalUrl: string): Record<string, unknown> {
  const address =
    entry.show_address && (entry.address || entry.postcode || entry.country)
      ? {
          "@type": "PostalAddress",
          streetAddress: entry.address ?? undefined,
          addressLocality: entry.city ?? undefined,
          postalCode: entry.postcode ?? undefined,
          addressCountry: entry.country ?? undefined,
        }
      : undefined;
  return {
    "@context": "https://schema.org",
    "@type": entry.structured_data_type || "LocalBusiness",
    name: entry.name,
    url: canonicalUrl,
    ...(address ? { address } : {}),
    ...(entry.show_phone && entry.phone ? { telephone: entry.phone } : {}),
    ...(entry.show_email && entry.email ? { email: entry.email } : {}),
    ...(entry.show_website && entry.website_url ? { sameAs: [entry.website_url] } : {}),
    ...(typeof entry.lat === "number" && typeof entry.lng === "number"
      ? { geo: { "@type": "GeoCoordinates", latitude: entry.lat, longitude: entry.lng } }
      : {}),
  };
}

function buildEntryPage(opts: {
  clientSlug: string;
  directorySlug: string;
  directoryName: string;
  entry: Entry;
  evidence: EvidenceItem[];
  media: MediaAsset[];
  accreditations: AccreditationHeld[];
  links: EntryLink[];
  tiles: ProductTile[];
}): string {
  const { clientSlug, directorySlug, directoryName, entry, evidence, media, accreditations, links, tiles } = opts;
  const canonicalUrl = `${SITE_ORIGIN}/directories/${clientSlug}/${directorySlug}/${entry.slug}`;
  const landingUrl = `/directories/${clientSlug}/${directorySlug}`;

  const location = entry.show_address ? [entry.address, entry.city, entry.postcode, entry.country].filter(Boolean).join(", ") : "";
  const notes = entry.notes_html
    ? entry.allow_html
      ? entry.notes_html
      : `<p>${escapeHtml(entry.notes_html)}</p>`
    : "";

  const hero = media.find((m) => m.is_hero) ?? null;
  const gallery = media.filter((m) => m !== hero);
  const heroHtml = hero ? `<img class="hero" src="${escapeAttr(hero.url)}" alt="${escapeAttr(hero.alt_text)}">` : "";
  const galleryHtml = gallery.length
    ? `<div class="gallery">${gallery.map((m) => `<img src="${escapeAttr(m.url)}" alt="${escapeAttr(m.alt_text)}">`).join("")}</div>`
    : "";

  const accreditationsHtml = accreditations.length
    ? `<div class="badges">${accreditations
        .map((a) => `<span class="badge" title="${escapeAttr(a.issuing_body || "")}">${a.badge_image_url ? `<img src="${escapeAttr(a.badge_image_url)}" alt="${escapeAttr(a.name)}">` : escapeHtml(a.name)}</span>`)
        .join("")}</div>`
    : "";

  const evidenceHtml = evidence.length
    ? `<h2>Evidence</h2><dl>${evidence
        .map((e) => `<dt>${escapeHtml(e.claim)}${e.confidence ? ` <span class="confidence">(${escapeHtml(e.confidence)})</span>` : ""}</dt><dd>${escapeHtml(e.value || "")}${e.source_url ? ` — <a href="${escapeAttr(e.source_url)}" rel="noopener noreferrer">source</a>` : ""}</dd>`)
        .join("")}</dl>`
    : "";

  const tilesHtml = tiles.length
    ? `<div class="product-tiles">${tiles
        .map(
          (t) =>
            `<a class="product-tile" href="${escapeAttr(t.destination_url)}" target="_blank" rel="noopener noreferrer sponsored">${t.image_url ? `<img src="${escapeAttr(t.image_url)}" alt="${escapeAttr(t.title)}">` : ""}<div><strong>${escapeHtml(t.title)}</strong>${t.price != null ? `<div>${escapeHtml(t.currency || "")} ${escapeHtml(String(t.price))}</div>` : ""}${t.provider ? `<div class="provider">via ${escapeHtml(t.provider)}</div>` : ""}</div></a>`,
        )
        .join("")}</div>`
    : "";

  const description = entry.meta_description || (location ? `${entry.name} — ${location}` : entry.name);
  const noindexTag = entry.noindex ? '<meta name="robots" content="noindex">' : "";

  const body = `
<a class="back-link" href="${escapeAttr(landingUrl)}">&larr; Back to ${escapeHtml(directoryName)}</a>
${heroHtml}
<h1>${escapeHtml(entry.name)}</h1>
${location ? `<p>${escapeHtml(location)}</p>` : ""}
${entry.show_phone && entry.phone ? `<p>Phone: ${escapeHtml(entry.phone)}</p>` : ""}
${entry.show_email && entry.email ? `<p>Email: <a href="mailto:${escapeAttr(entry.email)}">${escapeHtml(entry.email)}</a></p>` : ""}
${entry.show_website && entry.website_url ? `<p><a href="${escapeAttr(entry.website_url)}" rel="noopener noreferrer">Visit website</a></p>` : ""}
${accreditationsHtml}
${notes}
${galleryHtml}
${evidenceHtml}
${tilesHtml}
${linkTiles(links)}
`.trim();

  return noindexTag + pageShell({
    title: entry.meta_title || `${entry.name} — ${directoryName}`,
    description,
    canonicalUrl,
    jsonLd: entrySchemaOrg(entry, canonicalUrl),
    body,
  });
}

function buildDirectoryLandingPage(opts: {
  clientSlug: string;
  directorySlug: string;
  directoryName: string;
  directoryDescription: string | null;
  entries: Entry[];
  directoryLinks: EntryLink[];
}): string {
  const { clientSlug, directorySlug, directoryName, directoryDescription, entries, directoryLinks } = opts;
  const canonicalUrl = `${SITE_ORIGIN}/directories/${clientSlug}/${directorySlug}`;

  const items = entries
    .filter((e) => !e.noindex)
    .map((e) => {
      const location = e.show_address ? [e.address, e.city, e.country].filter(Boolean).join(", ") : "";
      return `<div class="listing-card"><a href="${escapeAttr(`/directories/${clientSlug}/${directorySlug}/${e.slug}`)}"><strong>${escapeHtml(e.name)}</strong></a>${location ? `<div>${escapeHtml(location)}</div>` : ""}</div>`;
    })
    .join("\n");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: directoryName,
    itemListElement: entries
      .filter((e) => !e.noindex)
      .map((e, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE_ORIGIN}/directories/${clientSlug}/${directorySlug}/${e.slug}`,
        name: e.name,
      })),
  };

  const body = `
<header><h1>${escapeHtml(directoryName)}</h1>${directoryDescription ? `<p>${escapeHtml(directoryDescription)}</p>` : ""}</header>
${linkTiles(directoryLinks)}
<p>${entries.length} entr${entries.length === 1 ? "y" : "ies"}.</p>
${items}
`.trim();

  return pageShell({
    title: directoryName,
    description: directoryDescription || `${directoryName} — ${entries.length} entr${entries.length === 1 ? "y" : "ies"}`,
    canonicalUrl,
    jsonLd,
    body,
  });
}

async function generateForDirectory(directoryId: string): Promise<{ directory_id: string; skipped?: string; count?: number }> {
  const db = createServiceClient();

  const { data: directory, error: dirErr } = await db
    .from("directories")
    .select("id, client_id, name, slug, description, current_publication_id, seo_defaults_json")
    .eq("id", directoryId)
    .single();
  if (dirErr) throw new Error(`Directory query failed: ${dirErr.message}`);
  if (!directory?.current_publication_id) throw new Error(`Directory ${directoryId} has no current publication — publish it first`);

  const { data: client, error: clientErr } = await db.from("clients").select("id, slug").eq("id", directory.client_id).single();
  if (clientErr) throw new Error(`Client query failed: ${clientErr.message}`);

  const flagEnabled = await resolveDirectoriesFlag(db, client.id);
  if (!flagEnabled) return { directory_id: directoryId, skipped: "flag_disabled" };

  const { data: entryRows, error: entryErr } = await db
    .from("directory_entries")
    .select(
      "id, name, slug, directory_group_id, address, postcode, country, city, phone, email, website_url, notes_html, allow_html, lat, lng, show_phone, show_email, show_website, show_address, meta_title, meta_description, noindex, structured_data_type",
    )
    .eq("directory_id", directoryId)
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (entryErr) throw new Error(`Entries query failed: ${entryErr.message}`);
  const entries = (entryRows ?? []) as Entry[];
  const entryIds = entries.map((e) => e.id);

  let evidenceByEntry = new Map<string, EvidenceItem[]>();
  let mediaByEntry = new Map<string, MediaAsset[]>();
  let accreditationsByEntry = new Map<string, AccreditationHeld[]>();
  let linksByEntry = new Map<string, EntryLink[]>();
  let tilesByEntry = new Map<string, ProductTile[]>();
  let directoryLinks: EntryLink[] = [];

  if (entryIds.length > 0) {
    const [evidenceRes, mediaRes, accRes, entryLinksRes, tilesRes] = await Promise.all([
      db.from("entry_evidence_items").select("entry_id, claim, value, source_url, confidence").in("entry_id", entryIds).order("sort_order", { ascending: true }),
      db.from("entry_media_assets").select("entry_id, url, alt_text, caption, is_hero").in("entry_id", entryIds).order("sort_order", { ascending: true }),
      db
        .from("entry_accreditations")
        .select("entry_id, directory_accreditation_schemes(name, issuing_body, badge_image_url)")
        .in("entry_id", entryIds),
      db.from("prominent_links").select("entry_id, directory_id, label, url, style, open_in_new, tracking").in("entry_id", entryIds).order("sort_order", { ascending: true }),
      db.from("product_tiles").select("entry_id, title, image_url, price, currency, rating, provider, destination_url").in("entry_id", entryIds).order("sort_order", { ascending: true }),
    ]);
    if (evidenceRes.error) throw new Error(`Evidence query failed: ${evidenceRes.error.message}`);
    if (mediaRes.error) throw new Error(`Media query failed: ${mediaRes.error.message}`);
    if (accRes.error) throw new Error(`Accreditations query failed: ${accRes.error.message}`);
    if (entryLinksRes.error) throw new Error(`Prominent links query failed: ${entryLinksRes.error.message}`);
    if (tilesRes.error) throw new Error(`Product tiles query failed: ${tilesRes.error.message}`);

    for (const row of (evidenceRes.data ?? []) as EvidenceItem[]) {
      const list = evidenceByEntry.get(row.entry_id) ?? [];
      list.push(row);
      evidenceByEntry.set(row.entry_id, list);
    }
    for (const row of (mediaRes.data ?? []) as MediaAsset[]) {
      const list = mediaByEntry.get(row.entry_id) ?? [];
      list.push(row);
      mediaByEntry.set(row.entry_id, list);
    }
    for (const row of (accRes.data ?? []) as { entry_id: string; directory_accreditation_schemes: AccreditationHeld | AccreditationHeld[] | null }[]) {
      const scheme = Array.isArray(row.directory_accreditation_schemes) ? row.directory_accreditation_schemes[0] : row.directory_accreditation_schemes;
      if (!scheme) continue;
      const list = accreditationsByEntry.get(row.entry_id) ?? [];
      list.push({ entry_id: row.entry_id, name: scheme.name, issuing_body: scheme.issuing_body, badge_image_url: scheme.badge_image_url });
      accreditationsByEntry.set(row.entry_id, list);
    }
    for (const row of (entryLinksRes.data ?? []) as EntryLink[]) {
      if (!row.entry_id) continue;
      const list = linksByEntry.get(row.entry_id) ?? [];
      list.push(row);
      linksByEntry.set(row.entry_id, list);
    }
    for (const row of (tilesRes.data ?? []) as ProductTile[]) {
      const list = tilesByEntry.get(row.entry_id) ?? [];
      list.push(row);
      tilesByEntry.set(row.entry_id, list);
    }
  }

  {
    const { data: dirLinkRows, error: dirLinkErr } = await db
      .from("prominent_links")
      .select("entry_id, directory_id, label, url, style, open_in_new, tracking")
      .eq("directory_id", directoryId)
      .order("sort_order", { ascending: true });
    if (dirLinkErr) throw new Error(`Directory prominent links query failed: ${dirLinkErr.message}`);
    directoryLinks = (dirLinkRows ?? []) as EntryLink[];
  }

  const basePath = `directories/${client.slug}/${directory.slug}`;

  for (const entry of entries) {
    const html = buildEntryPage({
      clientSlug: client.slug,
      directorySlug: directory.slug,
      directoryName: directory.name,
      entry,
      evidence: evidenceByEntry.get(entry.id) ?? [],
      media: mediaByEntry.get(entry.id) ?? [],
      accreditations: accreditationsByEntry.get(entry.id) ?? [],
      links: linksByEntry.get(entry.id) ?? [],
      tiles: tilesByEntry.get(entry.id) ?? [],
    });
    await uploadToBlob(`${basePath}/${entry.slug}.html`, html, "text/html; charset=utf-8");
  }

  const landingHtml = buildDirectoryLandingPage({
    clientSlug: client.slug,
    directorySlug: directory.slug,
    directoryName: directory.name,
    directoryDescription: directory.description,
    entries,
    directoryLinks,
  });
  await uploadToBlob(`${basePath}/index.html`, landingHtml, "text/html; charset=utf-8");

  const sitemapUrls = [
    `${SITE_ORIGIN}/directories/${client.slug}/${directory.slug}`,
    ...entries.filter((e) => !e.noindex).map((e) => `${SITE_ORIGIN}/directories/${client.slug}/${directory.slug}/${e.slug}`),
  ];
  await uploadToBlob(`${basePath}/sitemap.xml`, buildSitemapXml(sitemapUrls), "application/xml; charset=utf-8");

  return { directory_id: directoryId, count: entries.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const { directory_id, all } = body as { directory_id?: string; all?: boolean };

    if (all) {
      const db = createServiceClient();
      const { data: directories, error } = await db.from("directories").select("id").not("current_publication_id", "is", null);
      if (error) throw new Error(`Directories query failed: ${error.message}`);

      const results = await Promise.allSettled((directories ?? []).map((d) => generateForDirectory(d.id)));
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results
        .filter((r) => r.status === "rejected")
        .map((r) => (r as PromiseRejectedResult).reason?.message ?? "unknown");

      return json({ ok: true, total: results.length, succeeded, failed });
    }

    if (!directory_id) return json({ error: "Provide directory_id or all: true" }, 400);

    const result = await generateForDirectory(directory_id);
    return json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("generate_directory_site error:", msg);
    return json({ error: msg }, 500);
  }
});

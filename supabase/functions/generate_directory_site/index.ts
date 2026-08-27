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
import { resolveFeatureFlag } from "../_shared/featureFlags.ts";
import {
  CORS,
  json,
  escapeHtml,
  escapeAttr,
  uploadToBlob,
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

type DirectoryTheme = { primaryColor?: string; headerBg?: string; headerText?: string; logoUrl?: string };

type EvidenceItem = { entry_id: string; claim: string; value: string | null; source_url: string | null; confidence: string | null };
type MediaAsset = { entry_id: string; url: string; alt_text: string; caption: string | null; is_hero: boolean };
type AccreditationHeld = { entry_id: string; name: string; issuing_body: string | null; badge_image_url: string | null };
type EntryLink = { entry_id: string | null; directory_id: string | null; label: string; url: string; style: string; open_in_new: boolean; tracking: boolean };
type ProductTile = { entry_id: string; title: string; image_url: string | null; price: number | null; currency: string | null; rating: number | null; provider: string | null; destination_url: string };

const EXTRA_STYLE = `
  .hero { width: 100%; max-height: 320px; object-fit: cover; border-radius: 10px; margin-bottom: 12px; }
  .gallery { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
  .gallery img { width: 100px; height: 80px; object-fit: cover; border-radius: 6px; }
  .badges { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
  .badge { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; background: #f3f4f6; border-radius: 999px; padding: 4px 10px; }
  .badge img { height: 20px; }
  .link-tiles { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
  .link-tile { padding: 8px 14px; border-radius: 8px; text-decoration: none; font-size: 14px; }
  .link-tile--primary { background: var(--brand-primary, #2563eb); color: #fff; }
  .link-tile--secondary { background: #f3f4f6; color: #111827; }
  .product-tiles { display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 0; }
  .product-tile { display: flex; gap: 10px; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px; text-decoration: none; color: inherit; width: 220px; }
  .product-tile img { width: 64px; height: 64px; object-fit: cover; border-radius: 6px; }
  .provider { font-size: 12px; opacity: 0.65; }
`;

/**
 * Directory entity page shell — NOT the shared _shared/staticSiteRenderer.ts
 * pageShell(), deliberately: that one is kept byte-stable for the existing
 * map feature. This local variant adds Open Graph/Twitter Card tags (absent
 * from the map feature's own pages — a known, documented gap there) and the
 * extra CSS classes buildEntryPage/buildDirectoryLandingPage actually use
 * for media/badges/links/tiles.
 */
// Loose but real validation — a raw hex colour only. theme_json is written
// via a <input type="color"> plus a paired text field, but it's still a
// jsonb column reachable by direct API/RPC access, and this value gets
// interpolated straight into a <style> block below, so a non-hex value
// (e.g. containing "}" ) could break out of its declaration. Falling back
// to the default is preferable to rejecting generation entirely over a bad
// theme value.
function sanitizeHexColor(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : fallback;
}

function themeStyleBlock(theme: DirectoryTheme): string {
  const primary = sanitizeHexColor(theme.primaryColor, "#2563eb");
  const headerBg = sanitizeHexColor(theme.headerBg, "#111827");
  const headerText = sanitizeHexColor(theme.headerText, "#ffffff");
  return `:root { --brand-primary: ${primary}; --brand-header-bg: ${headerBg}; --brand-header-text: ${headerText}; }`;
}

function directoryPageShell(opts: {
  title: string;
  description: string;
  canonicalUrl: string;
  jsonLd: Record<string, unknown>;
  body: string;
  imageUrl?: string | null;
  noindex?: boolean;
  theme?: DirectoryTheme;
}): string {
  const ogImage = opts.imageUrl
    ? `<meta property="og:image" content="${escapeAttr(opts.imageUrl)}">\n<meta name="twitter:card" content="summary_large_image">`
    : `<meta name="twitter:card" content="summary">`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
<meta name="description" content="${escapeAttr(opts.description)}">
<link rel="canonical" href="${escapeAttr(opts.canonicalUrl)}">
${opts.noindex ? '<meta name="robots" content="noindex">\n' : ""}<meta property="og:type" content="website">
<meta property="og:title" content="${escapeAttr(opts.title)}">
<meta property="og:description" content="${escapeAttr(opts.description)}">
<meta property="og:url" content="${escapeAttr(opts.canonicalUrl)}">
${ogImage}
<script type="application/ld+json">${JSON.stringify(opts.jsonLd)}</script>
<style>
  ${themeStyleBlock(opts.theme ?? {})}
  body { font-family: system-ui, -apple-system, sans-serif; max-width: 720px; margin: 0 auto; padding: 24px 16px; line-height: 1.5; color: #111827; }
  a { color: var(--brand-primary); }
  dt { font-weight: 600; margin-top: 10px; }
  dd { margin-left: 0; }
  .back-link { font-size: 14px; margin-bottom: 16px; display: inline-block; }
  .listing-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; }
  .site-header { display: flex; align-items: center; gap: 12px; background: var(--brand-header-bg); color: var(--brand-header-text); margin: -24px -16px 20px; padding: 20px 16px; }
  .site-header h1 { margin: 0; color: inherit; }
  .site-header p { margin: 4px 0 0; color: inherit; opacity: 0.85; }
  .site-header__logo { height: 40px; width: auto; }
  ${EXTRA_STYLE}
</style>
</head>
<body>
${opts.body}
</body>
</html>`;
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
  theme: DirectoryTheme;
}): string {
  const { clientSlug, directorySlug, directoryName, entry, evidence, media, accreditations, links, tiles, theme } = opts;
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

  return directoryPageShell({
    title: entry.meta_title || `${entry.name} — ${directoryName}`,
    description,
    canonicalUrl,
    jsonLd: entrySchemaOrg(entry, canonicalUrl),
    body,
    imageUrl: hero?.url ?? null,
    noindex: !!entry.noindex,
    theme,
  });
}

function buildDirectoryLandingPage(opts: {
  clientSlug: string;
  directorySlug: string;
  directoryName: string;
  directoryDescription: string | null;
  entries: Entry[];
  directoryLinks: EntryLink[];
  theme: DirectoryTheme;
}): string {
  const { clientSlug, directorySlug, directoryName, directoryDescription, entries, directoryLinks, theme } = opts;
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

  const logoHtml = theme.logoUrl ? `<img class="site-header__logo" src="${escapeAttr(theme.logoUrl)}" alt="${escapeAttr(directoryName)} logo">` : "";
  const body = `
<header class="site-header">${logoHtml}<div><h1>${escapeHtml(directoryName)}</h1>${directoryDescription ? `<p>${escapeHtml(directoryDescription)}</p>` : ""}</div></header>
${linkTiles(directoryLinks)}
<p>${entries.length} entr${entries.length === 1 ? "y" : "ies"}.</p>
${items}
`.trim();

  return directoryPageShell({
    title: directoryName,
    description: directoryDescription || `${directoryName} — ${entries.length} entr${entries.length === 1 ? "y" : "ies"}`,
    canonicalUrl,
    jsonLd,
    body,
    theme,
  });
}

function buildLlmsTxt(opts: {
  clientSlug: string;
  directorySlug: string;
  directoryName: string;
  directoryDescription: string | null;
  entries: Entry[];
  extra: string | null;
}): string {
  const { clientSlug, directorySlug, directoryName, directoryDescription, entries, extra } = opts;
  const lines = [`# ${directoryName}`, ""];
  if (directoryDescription) lines.push(directoryDescription, "");
  lines.push(`${entries.length} entr${entries.length === 1 ? "y" : "ies"}:`, "");
  for (const e of entries.filter((e) => !e.noindex)) {
    lines.push(`- [${e.name}](${SITE_ORIGIN}/directories/${clientSlug}/${directorySlug}/${e.slug})`);
  }
  if (extra) lines.push("", extra);
  return lines.join("\n");
}

async function generateForDirectory(directoryId: string): Promise<{ directory_id: string; skipped?: string; count?: number }> {
  const db = createServiceClient();

  const { data: directory, error: dirErr } = await db
    .from("directories")
    .select("id, client_id, name, slug, description, current_publication_id, seo_defaults_json, theme_json")
    .eq("id", directoryId)
    .single();
  if (dirErr) throw new Error(`Directory query failed: ${dirErr.message}`);
  if (!directory?.current_publication_id) throw new Error(`Directory ${directoryId} has no current publication — publish it first`);

  const theme: DirectoryTheme =
    directory.theme_json && typeof directory.theme_json === "object" ? (directory.theme_json as DirectoryTheme) : {};

  const { data: client, error: clientErr } = await db.from("clients").select("id, slug").eq("id", directory.client_id).single();
  if (clientErr) throw new Error(`Client query failed: ${clientErr.message}`);

  const flagEnabled = await resolveFeatureFlag(db, client.id, "directories");
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
      theme,
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
    theme,
  });
  await uploadToBlob(`${basePath}/index.html`, landingHtml, "text/html; charset=utf-8");

  const sitemapUrls = [
    `${SITE_ORIGIN}/directories/${client.slug}/${directory.slug}`,
    ...entries.filter((e) => !e.noindex).map((e) => `${SITE_ORIGIN}/directories/${client.slug}/${directory.slug}/${e.slug}`),
  ];
  await uploadToBlob(`${basePath}/sitemap.xml`, buildSitemapXml(sitemapUrls), "application/xml; charset=utf-8");

  const llmsExtra = (directory.seo_defaults_json as { llms_txt_extra?: string } | null)?.llms_txt_extra ?? null;
  const llmsTxt = buildLlmsTxt({
    clientSlug: client.slug,
    directorySlug: directory.slug,
    directoryName: directory.name,
    directoryDescription: directory.description,
    entries,
    extra: llmsExtra,
  });
  await uploadToBlob(`${basePath}/llms.txt`, llmsTxt, "text/plain; charset=utf-8");

  // Redirects (docs/DIRECTORIES.md §5.11): old slug -> current slug of
  // whichever entry now holds it, so a renamed entry's previous public URL
  // keeps working. Only entries generated above (active, in `entries`) are
  // valid targets — a redirect to an archived/deleted entry is dropped
  // rather than pointed at a page that doesn't exist.
  const { data: redirectRows, error: redirectErr } = await db
    .from("directory_redirects")
    .select("old_slug, entry_id")
    .eq("directory_id", directoryId);
  if (redirectErr) throw new Error(`Redirects query failed: ${redirectErr.message}`);
  const entrySlugById = new Map(entries.map((e) => [e.id, e.slug]));
  const currentSlugs = new Set(entries.map((e) => e.slug));
  const redirectMap: Record<string, string> = {};
  for (const r of (redirectRows ?? []) as { old_slug: string; entry_id: string }[]) {
    const targetSlug = entrySlugById.get(r.entry_id);
    // A redirect old_slug that collides with a *current* entry's own slug
    // must not override that entry's real page — drop it rather than shadow
    // the live entry (can happen if a slug is reused a second time).
    if (targetSlug && !currentSlugs.has(r.old_slug)) redirectMap[r.old_slug] = targetSlug;
  }
  await uploadToBlob(`${basePath}/redirects.json`, JSON.stringify(redirectMap), "application/json; charset=utf-8");

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

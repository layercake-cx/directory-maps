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
  logo_url: string | null;
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
  panel_image_url: string | null;
  panel_background_color: string | null;
};

// Full DIR-E3 branding token set (docs/DIRECTORIES.md §4.1) — kept in sync
// by hand with src/lib/directoryThemePresets.js's field list (JS/TS
// runtimes can't share a module here). A directory that has never opened
// the Branding panel has none of these set — see NATURAL_DEFAULTS below.
type DirectoryTheme = {
  primaryColor?: string;
  primaryDarkColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  surfaceColor?: string;
  surfaceAltColor?: string;
  inkColor?: string;
  mutedColor?: string;
  lineColor?: string;
  sageColor?: string;
  sageInkColor?: string;
  goldColor?: string;
  tealColor?: string;
  fontHeading?: string;
  fontBody?: string;
  logoUrl?: string;
};

type BlockDescriptor = { type: string; key?: string };
type EntryTemplateRow = {
  id: string;
  is_default: boolean;
  applies_to_group_id: string | null;
  applies_to_term_id: string | null;
  layout_json: BlockDescriptor[];
};
type CategorisationTerm = { id: string; categorisation_id: string; label: string; slug: string; sort_order: number };
type Categorisation = { id: string; key: string; label: string; applies_to: string };

// DIR-E6 (docs/DIRECTORIES.md §4.4) — the block order generate_directory_site
// used before entry_templates existed. A directory with no entry_templates
// rows at all (the common case until an Owner/Manager opens the layout
// designer) renders with exactly this order — kept in sync by hand with
// src/lib/entryTemplates.js's IMPLICIT_DEFAULT_LAYOUT (JS/TS runtimes can't
// share a module here). `logo` (entry.logo_url) is deliberately absent —
// that field was never rendered before this feature, so including it by
// default would be a real behaviour change for every existing directory.
const IMPLICIT_DEFAULT_LAYOUT: BlockDescriptor[] = [
  { type: "hero" },
  { type: "heading" },
  { type: "address_map" },
  { type: "contact_details" },
  { type: "accreditations" },
  { type: "notes_html" },
  { type: "gallery" },
  { type: "evidence" },
  { type: "product_tiles" },
  { type: "links" },
];

/**
 * Resolves which entry_templates row applies to a given entry, per the
 * order decided in §4.4: a template targeting one of the entry's category
 * terms > a template targeting the entry's group > the directory's default
 * > (no entry_templates rows at all) the implicit pre-DIR-E6 order.
 */
function resolveLayout(
  entry: Entry,
  templates: EntryTemplateRow[],
  entryTermIds: Set<string>,
  termSortOrder: Map<string, number>,
): BlockDescriptor[] {
  if (templates.length === 0) return IMPLICIT_DEFAULT_LAYOUT;

  const termMatches = templates
    .filter((t) => t.applies_to_term_id && entryTermIds.has(t.applies_to_term_id))
    .sort((a, b) => (termSortOrder.get(a.applies_to_term_id!) ?? 0) - (termSortOrder.get(b.applies_to_term_id!) ?? 0));
  if (termMatches.length > 0) return termMatches[0].layout_json;

  const groupMatch = templates.find((t) => t.applies_to_group_id && t.applies_to_group_id === entry.directory_group_id);
  if (groupMatch) return groupMatch.layout_json;

  const defaultTemplate = templates.find((t) => t.is_default);
  return defaultTemplate ? defaultTemplate.layout_json : IMPLICIT_DEFAULT_LAYOUT;
}

type EvidenceItem = { entry_id: string; claim: string; value: string | null; source_url: string | null; confidence: string | null };
type MediaAsset = { entry_id: string; url: string; alt_text: string; caption: string | null; is_hero: boolean };
type AccreditationHeld = { entry_id: string; name: string; issuing_body: string | null; badge_image_url: string | null };
type EntryLink = { entry_id: string | null; directory_id: string | null; label: string; url: string; style: string; open_in_new: boolean; tracking: boolean };
type ProductTile = { entry_id: string; title: string; image_url: string | null; price: number | null; currency: string | null; rating: number | null; provider: string | null; destination_url: string };

// Design system ported from the "Ethical Elephant Directory" companion
// design canvas (see docs/DEPLOYMENTS.md's DIR-E3 visual-rebuild entry for
// how it was sourced) — class names and structure match that canvas
// directly so the site actually looks like the design, not a generic
// template. `.wrap` is the full-bleed-background/centered-content pattern
// that makes the header/footer span 100% of the viewport while their
// content stays a readable width.
const BASE_STYLE = `
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--font-body); -webkit-font-smoothing: antialiased; }
  h1, h2, h3, h4 { font-family: var(--font-heading); font-weight: 600; margin: 0; letter-spacing: -0.01em; }
  a { color: var(--primary); text-decoration: none; }
  a:hover { color: var(--primary-2); }
  .wrap { max-width: 1200px; margin: 0 auto; padding: 0 40px; }
  .btn { display: inline-flex; align-items: center; gap: 8px; border: 0; cursor: pointer; font-family: inherit; font-weight: 600; font-size: 15px; border-radius: 11px; padding: 13px 20px; }
  .btn-primary { background: var(--primary); color: #fff; }
  .btn-ghost { background: transparent; color: var(--ink); border: 1px solid var(--line); }
  .chip { display: inline-flex; align-items: center; gap: 7px; background: var(--surface); border: 1px solid var(--line); border-radius: 999px; padding: 8px 14px; font-size: 13.5px; color: var(--ink); font-weight: 500; }
  .facet { display: inline-flex; align-items: center; gap: 8px; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; font-size: 14px; font-weight: 600; color: var(--ink); }
  .badge { display: inline-flex; align-items: center; gap: 6px; background: var(--sage); color: var(--sage-ink); border-radius: 999px; padding: 5px 11px; font-size: 12px; font-weight: 700; letter-spacing: .01em; }
  .badge img { height: 16px; }
  .tag { display: inline-flex; align-items: center; gap: 5px; background: var(--surface-2); color: var(--ink); border-radius: 7px; padding: 5px 9px; font-size: 12px; font-weight: 600; }
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
  .card-logo-box { height: 158px; background: var(--surface-2); display: flex; align-items: center; justify-content: center; }
  .card-logo-box img { max-width: 70%; max-height: 70%; object-fit: contain; }
  .eyebrow { font-size: 12.5px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: var(--accent); }
  .muted { color: var(--muted); }
  .prose p { font-size: 16.5px; line-height: 1.7; margin: 0 0 16px; }
  .prose h2 { font-size: 24px; margin: 24px 0 14px; }
  @media (max-width: 900px) { .wrap { padding: 0 20px; } }
`;

const EXTRA_STYLE = `
  .entry-logo { height: 40px; width: auto; display: block; margin-bottom: 10px; }
  .hero { width: 100%; max-height: 380px; object-fit: cover; border-radius: 16px; margin-bottom: 16px; }
  .gallery { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
  .gallery img { width: 110px; height: 84px; object-fit: cover; border-radius: 8px; }
  .badges { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
  .category-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }
  .category-chip { display: inline-block; font-size: 12px; background: var(--surface-2); border-radius: 999px; padding: 5px 11px; text-decoration: none; color: var(--ink); font-weight: 600; }
  .link-tiles { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
  .link-tile { padding: 8px 14px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600; }
  .link-tile--primary { background: var(--primary); color: #fff; }
  .link-tile--secondary { background: var(--surface-2); color: var(--ink); }
  .product-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; margin: 12px 0; }
  .product-tile { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; text-decoration: none; color: inherit; display: flex; flex-direction: column; }
  .product-tile__img { height: 130px; object-fit: cover; width: 100%; }
  .product-tile__body { padding: 14px 15px; display: flex; flex-direction: column; gap: 8px; flex-grow: 1; }
  .product-tile__price { font-size: 18px; font-weight: 800; }
  .provider { font-size: 12px; opacity: .65; }
  .contact-card { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 12px; margin: 16px 0; }
  .contact-card p { margin: 0; font-size: 14.5px; }
  .evidence-list dt { font-weight: 700; margin-top: 12px; font-size: 15.5px; }
  .evidence-list dd { margin: 0 0 4px; font-size: 15px; color: var(--muted); }
`;

/**
 * Directory entity page shell — NOT the shared _shared/staticSiteRenderer.ts
 * pageShell(), deliberately: that one is kept byte-stable for the existing
 * map feature. This local variant adds Open Graph/Twitter Card tags (absent
 * from the map feature's own pages — a known, documented gap there) and the
 * design-system CSS above.
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

// The "Natural" preset (src/lib/directoryThemePresets.js) — also the
// default look for any directory that has never opened the Branding panel.
// This is a deliberate design change from the plain generic template this
// generator used before DIR-E3's visual rebuild; unlike every prior phase,
// this is NOT "zero behaviour change" for existing directories.
const NATURAL_DEFAULTS: Required<Omit<DirectoryTheme, "logoUrl">> = {
  primaryColor: "#2E5A39",
  primaryDarkColor: "#24462D",
  accentColor: "#C06B37",
  backgroundColor: "#FAF6EE",
  surfaceColor: "#FFFFFF",
  surfaceAltColor: "#F1ECDF",
  inkColor: "#232820",
  mutedColor: "#6F7567",
  lineColor: "#E6DFCF",
  sageColor: "#E9EEDD",
  sageInkColor: "#3C5733",
  goldColor: "#D6A23E",
  tealColor: "#0E6F68",
  fontHeading: "Spectral",
  fontBody: "Hanken Grotesk",
};

// Google Fonts CSS2 family+weight query segment per font name — kept in
// sync by hand with src/lib/directoryThemePresets.js's FONT_CATALOG.
const FONT_CATALOG: Record<string, string> = {
  Spectral: "Spectral:wght@400;500;600;700",
  "Playfair Display": "Playfair+Display:wght@400;500;600;700",
  Fraunces: "Fraunces:wght@400;500;600;700",
  Inter: "Inter:wght@400;500;600;700;800",
  "Hanken Grotesk": "Hanken+Grotesk:wght@400;500;600;700;800",
};

function resolvedTheme(theme: DirectoryTheme) {
  return {
    primaryColor: sanitizeHexColor(theme.primaryColor, NATURAL_DEFAULTS.primaryColor),
    primaryDarkColor: sanitizeHexColor(theme.primaryDarkColor, NATURAL_DEFAULTS.primaryDarkColor),
    accentColor: sanitizeHexColor(theme.accentColor, NATURAL_DEFAULTS.accentColor),
    backgroundColor: sanitizeHexColor(theme.backgroundColor, NATURAL_DEFAULTS.backgroundColor),
    surfaceColor: sanitizeHexColor(theme.surfaceColor, NATURAL_DEFAULTS.surfaceColor),
    surfaceAltColor: sanitizeHexColor(theme.surfaceAltColor, NATURAL_DEFAULTS.surfaceAltColor),
    inkColor: sanitizeHexColor(theme.inkColor, NATURAL_DEFAULTS.inkColor),
    mutedColor: sanitizeHexColor(theme.mutedColor, NATURAL_DEFAULTS.mutedColor),
    lineColor: sanitizeHexColor(theme.lineColor, NATURAL_DEFAULTS.lineColor),
    sageColor: sanitizeHexColor(theme.sageColor, NATURAL_DEFAULTS.sageColor),
    sageInkColor: sanitizeHexColor(theme.sageInkColor, NATURAL_DEFAULTS.sageInkColor),
    goldColor: sanitizeHexColor(theme.goldColor, NATURAL_DEFAULTS.goldColor),
    tealColor: sanitizeHexColor(theme.tealColor, NATURAL_DEFAULTS.tealColor),
    fontHeading: FONT_CATALOG[theme.fontHeading ?? ""] ? theme.fontHeading! : NATURAL_DEFAULTS.fontHeading,
    fontBody: FONT_CATALOG[theme.fontBody ?? ""] ? theme.fontBody! : NATURAL_DEFAULTS.fontBody,
  };
}

function themeStyleBlock(theme: DirectoryTheme): string {
  const t = resolvedTheme(theme);
  return `:root {
    --bg: ${t.backgroundColor}; --surface: ${t.surfaceColor}; --surface-2: ${t.surfaceAltColor};
    --ink: ${t.inkColor}; --muted: ${t.mutedColor}; --line: ${t.lineColor};
    --primary: ${t.primaryColor}; --primary-2: ${t.primaryDarkColor}; --accent: ${t.accentColor};
    --sage: ${t.sageColor}; --sage-ink: ${t.sageInkColor}; --gold: ${t.goldColor}; --teal: ${t.tealColor};
    --font-heading: "${t.fontHeading}", Georgia, serif; --font-body: "${t.fontBody}", system-ui, sans-serif;
  }`;
}

/** <link> for exactly the Google Fonts families this theme actually uses —
 * never a fixed Spectral+Hanken Grotesk pair, since presets vary fonts. */
function fontLinkTag(theme: DirectoryTheme): string {
  const t = resolvedTheme(theme);
  const families = [...new Set([t.fontHeading, t.fontBody])].map((f) => FONT_CATALOG[f]).filter(Boolean);
  const query = families.map((f) => `family=${f}`).join("&");
  return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${query}&display=swap">`;
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
${fontLinkTag(opts.theme ?? {})}
<style>
  ${themeStyleBlock(opts.theme ?? {})}
  ${BASE_STYLE}
  ${EXTRA_STYLE}
</style>
</head>
<body>
${opts.body}
</body>
</html>`;
}

/** Full-bleed header — background spans the viewport, content stays inside
 * `.wrap`. Used on every page (landing + entry), matching the canvas's own
 * consistent-header-everywhere pattern. */
function siteHeader(opts: { directoryName: string; tagline: string | null; homeUrl: string; logoUrl?: string | null }): string {
  const logo = opts.logoUrl
    ? `<img src="${escapeAttr(opts.logoUrl)}" alt="${escapeAttr(opts.directoryName)} logo" style="width:42px;height:42px;border-radius:12px;object-fit:cover;">`
    : `<div style="width:42px;height:42px;border-radius:12px;background:var(--primary);"></div>`;
  return `<div style="border-bottom:1px solid var(--line);background:rgba(255,255,255,.6);backdrop-filter:blur(6px);">
  <div class="wrap" style="display:flex;align-items:center;justify-content:space-between;height:76px;">
    <a href="${escapeAttr(opts.homeUrl)}" style="display:flex;align-items:center;gap:12px;color:inherit;">
      ${logo}
      <div style="line-height:1.05;">
        <div style="font-family:var(--font-heading);font-size:19px;font-weight:600;color:var(--ink);">${escapeHtml(opts.directoryName)}</div>
        ${opts.tagline ? `<div class="muted" style="font-size:12.5px;font-weight:600;">${escapeHtml(opts.tagline)}</div>` : ""}
      </div>
    </a>
    <span class="chip" style="font-size:12px;color:var(--muted);">Powered by Layercake&nbsp;Maps</span>
  </div>
</div>`;
}

/** Full-bleed dark footer, identical on every page. */
function siteFooter(opts: { directoryName: string; homeUrl: string }): string {
  return `<div style="margin-top:56px;background:#0E3A34;color:#CFE3DE;">
  <div class="wrap" style="padding-top:40px;padding-bottom:28px;display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;">
    <div>
      <div style="font-family:var(--font-heading);font-size:17px;font-weight:600;color:#fff;">${escapeHtml(opts.directoryName)}</div>
      <a href="${escapeAttr(opts.homeUrl)}" style="color:#CFE3DE;font-size:13.5px;">Browse all entries</a>
    </div>
    <span style="font-size:12.5px;color:#8FB4AD;">Published with Layercake Maps · content is editorial, commercial links never affect inclusion.</span>
  </div>
</div>`;
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
  layout: BlockDescriptor[];
  entryTerms: Map<string, CategorisationTerm[]>; // categorisation.key -> this entry's terms for it
}): string {
  const { clientSlug, directorySlug, directoryName, entry, evidence, media, accreditations, links, tiles, theme, layout, entryTerms } = opts;
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

  // One HTML fragment per DIR-E6 block type (docs/DIRECTORIES.md §4.4) —
  // rendered in whatever order `layout` specifies rather than a fixed
  // sequence. Each returns "" when it has nothing to show, so an empty
  // section never leaves a gap. Styling matches the design canvas per
  // block (hero image, quick-facts-style tag chips via the categorisation
  // block, Viator-style product tiles, a bordered "at-a-glance" contact
  // card) rather than the mockup's fixed 2-column sticky-aside layout —
  // see docs/DEPLOYMENTS.md's DIR-E3 visual-rebuild entry for why: this
  // keeps every block independently reorderable, which the aside's fixed
  // structural split wouldn't allow.
  const contactParts = [
    entry.show_phone && entry.phone ? `<p>Phone: ${escapeHtml(entry.phone)}</p>` : "",
    entry.show_email && entry.email ? `<p>Email: <a href="mailto:${escapeAttr(entry.email)}">${escapeHtml(entry.email)}</a></p>` : "",
    entry.show_website && entry.website_url ? `<p><a href="${escapeAttr(entry.website_url)}" rel="noopener noreferrer">Visit website</a></p>` : "",
  ].filter(Boolean);

  const blockHtml: Record<string, string> = {
    logo: entry.logo_url ? `<img class="entry-logo" src="${escapeAttr(entry.logo_url)}" alt="${escapeAttr(entry.name)} logo">` : "",
    heading: `<h1 style="font-size:36px;margin:8px 0;">${escapeHtml(entry.name)}</h1>`,
    address_map: location
      ? `<p class="muted" style="font-size:15px;font-weight:600;display:flex;align-items:center;gap:6px;">${escapeHtml(location)}</p>`
      : "",
    contact_details: contactParts.length ? `<div class="contact-card">${contactParts.join("")}</div>` : "",
    hero: hero ? `<img class="hero" src="${escapeAttr(hero.url)}" alt="${escapeAttr(hero.alt_text)}">` : "",
    gallery: gallery.length
      ? `<div class="gallery">${gallery.map((m) => `<img src="${escapeAttr(m.url)}" alt="${escapeAttr(m.alt_text)}">`).join("")}</div>`
      : "",
    accreditations: accreditations.length
      ? `<div class="badges">${accreditations
          .map((a) => `<span class="badge" title="${escapeAttr(a.issuing_body || "")}">${a.badge_image_url ? `<img src="${escapeAttr(a.badge_image_url)}" alt="${escapeAttr(a.name)}">` : escapeHtml(a.name)}</span>`)
          .join("")}</div>`
      : "",
    notes_html: notes ? `<div class="prose">${notes}</div>` : "",
    evidence: evidence.length
      ? `<h2>Evidence</h2><dl class="evidence-list">${evidence
          .map((e) => `<dt>${escapeHtml(e.claim)}${e.confidence ? ` <span class="tag">${escapeHtml(e.confidence)}</span>` : ""}</dt><dd>${escapeHtml(e.value || "")}${e.source_url ? ` — <a href="${escapeAttr(e.source_url)}" rel="noopener noreferrer">source</a>` : ""}</dd>`)
          .join("")}</dl>`
      : "",
    product_tiles: tiles.length
      ? `<div class="product-tiles">${tiles
          .map(
            (t) =>
              `<a class="product-tile" href="${escapeAttr(t.destination_url)}" target="_blank" rel="noopener noreferrer sponsored">${t.image_url ? `<img class="product-tile__img" src="${escapeAttr(t.image_url)}" alt="${escapeAttr(t.title)}">` : ""}<div class="product-tile__body">${t.rating != null ? `<span class="muted" style="font-size:12.5px;font-weight:600;">★ ${escapeHtml(String(t.rating))}</span>` : ""}<strong>${escapeHtml(t.title)}</strong>${t.price != null ? `<span class="product-tile__price">${escapeHtml(t.currency || "")} ${escapeHtml(String(t.price))}</span>` : ""}${t.provider ? `<span class="provider">via ${escapeHtml(t.provider)}</span>` : ""}</div></a>`,
          )
          .join("")}</div>`
      : "",
    links: linkTiles(links),
  };

  function renderBlock(block: BlockDescriptor): string {
    if (block.type === "categorisation") {
      const terms = (block.key && entryTerms.get(block.key)) || [];
      if (terms.length === 0) return "";
      const chips = terms
        .map((t) => `<a class="category-chip" href="${escapeAttr(`${landingUrl}?${encodeURIComponent(block.key!)}=${encodeURIComponent(t.slug)}`)}">${escapeHtml(t.label)}</a>`)
        .join("");
      return `<div class="category-chips">${chips}</div>`;
    }
    return blockHtml[block.type] ?? "";
  }

  const description = entry.meta_description || (location ? `${entry.name} — ${location}` : entry.name);

  const breadcrumb = `<a href="${escapeAttr(landingUrl)}" style="display:inline-flex;align-items:center;gap:7px;font-size:14px;font-weight:600;color:var(--muted);margin:20px 0;">&larr; All entries in ${escapeHtml(directoryName)}</a>`;

  const body = `
${siteHeader({ directoryName, tagline: null, homeUrl: landingUrl, logoUrl: theme.logoUrl })}
<div class="wrap" style="padding-bottom:40px;">
${breadcrumb}
${layout.map(renderBlock).join("\n")}
</div>
${siteFooter({ directoryName, homeUrl: landingUrl })}
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

/** Inert (this phase) filter-bar chips above the map — visual placeholders
 * for the categorisation-driven faceted filtering DIR-E5-S4 will wire up.
 * Real, working search on this page is the keyword script below. */
function exploreFilterBar(categorisationLabels: string[]): string {
  if (categorisationLabels.length === 0) return "";
  const chips = categorisationLabels
    .map((label) => `<span class="facet">${escapeHtml(label)} <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span>`)
    .join("");
  return `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:14px 16px;background:var(--surface-2);border:1px solid var(--line);border-radius:14px;margin-bottom:18px;">${chips}</div>`;
}

/** Simple client-side keyword search over the already-rendered result
 * cards — no new backend, no LLM call (DIR-E7 replaces this later). Reads
 * data-search attributes baked into each card at generation time. */
const SEARCH_SCRIPT = `
<script>
(function () {
  var form = document.getElementById('dir-search-form');
  var input = document.getElementById('dir-search-input');
  var cards = document.querySelectorAll('[data-search]');
  var countEl = document.getElementById('dir-result-count');
  if (!form || !input) return;
  function apply() {
    var q = input.value.trim().toLowerCase();
    var shown = 0;
    cards.forEach(function (card) {
      var match = !q || card.getAttribute('data-search').indexOf(q) !== -1;
      card.style.display = match ? '' : 'none';
      if (match) shown++;
    });
    if (countEl) countEl.textContent = shown + (shown === 1 ? ' entry' : ' entries');
  }
  form.addEventListener('submit', function (e) { e.preventDefault(); apply(); });
  input.addEventListener('input', apply);
})();
</script>`;

function buildDirectoryLandingPage(opts: {
  clientSlug: string;
  directorySlug: string;
  directoryName: string;
  directoryDescription: string | null;
  entries: Entry[];
  directoryLinks: EntryLink[];
  theme: DirectoryTheme;
  attachedMapEmbedSrc: string | null;
  categorisationLabels: string[];
}): string {
  const { clientSlug, directorySlug, directoryName, directoryDescription, entries, directoryLinks, theme, attachedMapEmbedSrc, categorisationLabels } = opts;
  const canonicalUrl = `${SITE_ORIGIN}/directories/${clientSlug}/${directorySlug}`;
  const visibleEntries = entries.filter((e) => !e.noindex);

  const cards = visibleEntries
    .map((e) => {
      const location = e.show_address ? [e.address, e.city, e.country].filter(Boolean).join(", ") : "";
      const searchText = escapeAttr(`${e.name} ${location}`.toLowerCase());
      const panelImageUrl = e.panel_image_url || e.logo_url;
      const logo = panelImageUrl
        ? `<img src="${escapeAttr(panelImageUrl)}" alt="${escapeAttr(e.name)} logo" loading="lazy">`
        : "";
      const panelBoxStyle = e.panel_background_color ? ` style="background:${escapeAttr(e.panel_background_color)};"` : "";
      return `<div class="card" data-search="${searchText}">
  <div class="card-logo-box"${panelBoxStyle}>${logo}</div>
  <div style="padding:18px;display:flex;flex-direction:column;gap:10px;flex-grow:1;">
    ${location ? `<div class="muted" style="font-size:13px;font-weight:600;">${escapeHtml(location)}</div>` : ""}
    <h3 style="font-size:19px;line-height:1.2;"><a href="${escapeAttr(`/directories/${clientSlug}/${directorySlug}/${e.slug}`)}">${escapeHtml(e.name)}</a></h3>
    <a href="${escapeAttr(`/directories/${clientSlug}/${directorySlug}/${e.slug}`)}" style="margin-top:auto;padding-top:8px;font-size:14.5px;font-weight:700;">View &rarr;</a>
  </div>
</div>`;
    })
    .join("\n");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: directoryName,
    itemListElement: visibleEntries.map((e, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_ORIGIN}/directories/${clientSlug}/${directorySlug}/${e.slug}`,
      name: e.name,
    })),
  };

  // Decision (2026-08-28): a directory's homepage map is exclusively the
  // Map product attached to it via DIR-E4 — never a second, homegrown map
  // implementation built from directory_entries. Maps and Directories are
  // two separate Layercake products that compose through this attachment;
  // a directory doesn't reimplement map rendering when one isn't attached,
  // it simply has no map section. This isn't the abandoned DIR-E8
  // "directory links to a map" feature (docs/DIRECTORIES.md §4.7's note):
  // it's the existing map→directory attachment used bidirectionally, only
  // ever showing a map that has *already* chosen this directory as its
  // datasource — a directory still can't pick an arbitrary map.
  const mapEmbed = attachedMapEmbedSrc
    ? `<iframe src="${escapeAttr(attachedMapEmbedSrc)}" loading="lazy" title="${escapeAttr(directoryName)} map" style="width:100%;height:440px;border:0;border-radius:18px;overflow:hidden;"></iframe>`
    : "";

  const body = `
${siteHeader({ directoryName, tagline: null, homeUrl: ".", logoUrl: theme.logoUrl })}
<div style="position:relative;overflow:hidden;background:linear-gradient(180deg,var(--sage) 0%,var(--bg) 60%);">
  <div class="wrap" style="padding-top:56px;padding-bottom:56px;text-align:center;">
    <div class="eyebrow" style="margin-bottom:14px;">${visibleEntries.length} entr${visibleEntries.length === 1 ? "y" : "ies"}</div>
    <h1 style="font-size:44px;line-height:1.08;max-width:760px;margin:0 auto 16px;">${escapeHtml(directoryName)}</h1>
    ${directoryDescription ? `<p class="muted" style="font-size:18px;max-width:600px;margin:0 auto 28px;">${escapeHtml(directoryDescription)}</p>` : ""}
    <form id="dir-search-form" style="max-width:640px;margin:0 auto;display:flex;gap:10px;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:10px 10px 10px 18px;box-shadow:0 12px 32px -18px rgba(0,0,0,.35);">
      <input id="dir-search-input" type="text" placeholder="Search by name or location…" style="flex-grow:1;border:0;outline:0;font-size:16px;font-family:inherit;background:transparent;color:var(--ink);">
      <button type="submit" class="btn btn-primary">Search</button>
    </form>
  </div>
</div>
<div class="wrap" style="padding-top:48px;">
  <div class="eyebrow" style="margin-bottom:8px;">Explore</div>
  <h2 style="font-size:26px;margin-bottom:16px;">${attachedMapEmbedSrc ? "The map &amp; the directory" : "Filter the directory"}</h2>
  ${exploreFilterBar(categorisationLabels)}
  ${mapEmbed}
</div>
<div class="wrap" style="padding-top:48px;padding-bottom:20px;">
  <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:20px;">
    <h2 style="font-size:26px;"><span id="dir-result-count">${visibleEntries.length}${visibleEntries.length === 1 ? " entry" : " entries"}</span></h2>
  </div>
  ${linkTiles(directoryLinks)}
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:24px;">
    ${cards}
  </div>
</div>
${siteFooter({ directoryName, homeUrl: "." })}
${SEARCH_SCRIPT}
`.trim();

  return directoryPageShell({
    title: directoryName,
    description: directoryDescription || `${directoryName} — ${visibleEntries.length} entr${visibleEntries.length === 1 ? "y" : "ies"}`,
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

/**
 * Records generate_directory_site's outcome on directories.site_generation_*
 * so the Publish panel can show live status regardless of whether the
 * browser tab that triggered it is still open (see
 * 20260828120000_directory_site_generation_status.sql).
 */
async function generateForDirectory(directoryId: string): Promise<{ directory_id: string; skipped?: string; count?: number }> {
  const db = createServiceClient();
  try {
    const result = await generateForDirectoryInner(db, directoryId);
    if (!result.skipped) {
      await db
        .from("directories")
        .update({ site_generation_status: "succeeded", site_generated_at: new Date().toISOString(), site_generation_error: null })
        .eq("id", directoryId);
    }
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("directories").update({ site_generation_status: "failed", site_generation_error: msg }).eq("id", directoryId);
    throw e;
  }
}

async function generateForDirectoryInner(
  db: ReturnType<typeof createServiceClient>,
  directoryId: string,
): Promise<{ directory_id: string; skipped?: string; count?: number }> {
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

  await db
    .from("directories")
    .update({ site_generation_status: "running", site_generation_started_at: new Date().toISOString() })
    .eq("id", directoryId);

  const { data: entryRows, error: entryErr } = await db
    .from("directory_entries")
    .select(
      "id, name, slug, directory_group_id, address, postcode, country, city, phone, email, website_url, logo_url, notes_html, allow_html, lat, lng, show_phone, show_email, show_website, show_address, meta_title, meta_description, noindex, structured_data_type, panel_image_url, panel_background_color",
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

  // DIR-E6 — entry_templates (block order) and the entry-scoped
  // categorisation terms needed both to resolve which template applies per
  // entry (term match takes precedence) and to render "categorisation"
  // blocks. Client-scoped, not directory-scoped, same as categorisations
  // generally (docs/DIRECTORIES.md §4.3) — filtered to this directory's
  // actual usage via entry_category_terms below.
  //
  // Tolerant of the table not existing at all: the migration and this
  // deploy are two independent, non-atomic operations (same class of risk
  // as the custom-domain RPC shape in 20260827130000), and unlike that
  // change, this query runs on EVERY directory's publish, not just ones
  // using the new feature — a hard failure here during any deploy-ordering
  // gap, or after a rollback that hasn't also reverted this code, would
  // break publishing entirely rather than just degrading to the pre-DIR-E6
  // block order. A real permissions/schema problem still surfaces via the
  // downstream queries below, which are not given this same tolerance.
  let templates: EntryTemplateRow[] = [];
  {
    const { data: templateRows, error: templateErr } = await db
      .from("entry_templates")
      .select("id, is_default, applies_to_group_id, applies_to_term_id, layout_json")
      .eq("directory_id", directoryId);
    if (templateErr) {
      console.error(`entry_templates query failed, falling back to the implicit default layout: ${templateErr.message}`);
    } else {
      templates = (templateRows ?? []) as EntryTemplateRow[];
    }
  }

  const entryTermIdsByEntry = new Map<string, Set<string>>();
  const entryTermsByEntry = new Map<string, Map<string, CategorisationTerm[]>>();
  const termSortOrder = new Map<string, number>();
  const categorisationLabelByKey = new Map<string, string>();

  if (entryIds.length > 0) {
    const { data: ectRows, error: ectErr } = await db
      .from("entry_category_terms")
      .select("entry_id, category_terms(id, categorisation_id, label, slug, sort_order, categorisations(key, label))")
      .in("entry_id", entryIds);
    if (ectErr) throw new Error(`Entry category terms query failed: ${ectErr.message}`);

    type TermEmbed = CategorisationTerm & { categorisations: { key: string; label: string } | { key: string; label: string }[] | null };
    for (const row of (ectRows ?? []) as unknown as { entry_id: string; category_terms: TermEmbed | TermEmbed[] | null }[]) {
      const term = Array.isArray(row.category_terms) ? row.category_terms[0] : row.category_terms;
      if (!term) continue;
      const cat = Array.isArray(term.categorisations) ? term.categorisations[0] : term.categorisations;
      if (!cat) continue;

      termSortOrder.set(term.id, term.sort_order);
      categorisationLabelByKey.set(cat.key, cat.label);

      const idSet = entryTermIdsByEntry.get(row.entry_id) ?? new Set<string>();
      idSet.add(term.id);
      entryTermIdsByEntry.set(row.entry_id, idSet);

      const byKey = entryTermsByEntry.get(row.entry_id) ?? new Map<string, CategorisationTerm[]>();
      const list = byKey.get(cat.key) ?? [];
      list.push({ id: term.id, categorisation_id: term.categorisation_id, label: term.label, slug: term.slug, sort_order: term.sort_order });
      byKey.set(cat.key, list);
      entryTermsByEntry.set(row.entry_id, byKey);
    }
  }

  const basePath = `directories/${client.slug}/${directory.slug}`;

  for (const entry of entries) {
    const layout = resolveLayout(entry, templates, entryTermIdsByEntry.get(entry.id) ?? new Set(), termSortOrder);
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
      layout,
      entryTerms: entryTermsByEntry.get(entry.id) ?? new Map(),
    });
    await uploadToBlob(`${basePath}/${entry.slug}.html`, html, "text/html; charset=utf-8");
  }

  // Decision (2026-08-28): a directory's homepage map is exclusively the
  // Map product attached to it via DIR-E4 — Maps and Directories are two
  // separate Layercake products that compose through this attachment, not
  // two independent map implementations. No attached map means no map
  // section on the homepage, not a homegrown fallback built from
  // directory_entries (that fallback existed before this decision and has
  // been removed, along with the /directory-embed route it fed).
  let attachedMapEmbedSrc: string | null = null;
  const { data: mapAssoc } = await db
    .from("directory_map_associations")
    .select("map_id")
    .eq("directory_id", directory.id)
    .limit(1)
    .maybeSingle();
  if (mapAssoc?.map_id) {
    const { data: attachedMap } = await db.from("maps").select("slug").eq("id", mapAssoc.map_id).maybeSingle();
    attachedMapEmbedSrc = attachedMap?.slug
      ? `${SITE_ORIGIN}/${client.slug}/${attachedMap.slug}`
      : `${SITE_ORIGIN}/embed?map=${encodeURIComponent(mapAssoc.map_id)}`;
  }

  const landingHtml = buildDirectoryLandingPage({
    clientSlug: client.slug,
    directorySlug: directory.slug,
    directoryName: directory.name,
    directoryDescription: directory.description,
    entries,
    directoryLinks,
    theme,
    attachedMapEmbedSrc,
    categorisationLabels: [...categorisationLabelByKey.values()],
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

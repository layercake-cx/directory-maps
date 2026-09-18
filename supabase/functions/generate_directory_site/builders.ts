/**
 * generate_directory_site — pure HTML/CSS/JS string builders.
 *
 * Split out of index.ts (2026-09-14, directory browse/entry redesign) so
 * these functions can be imported by a local preview script (preview.ts)
 * without pulling in Deno.serve or any Supabase/DB call — importing index.ts
 * directly would start an HTTP listener as a side effect of the module load.
 * Everything in this file is side-effect-free: given the same inputs, same
 * HTML out, no network/DB access. index.ts still owns all data fetching
 * (generateForDirectory/generateForDirectoryInner) and the Deno.serve handler.
 */

import { escapeHtml, escapeAttr } from "../_shared/staticSiteRenderer.ts";

export const SITE_ORIGIN = "https://maps.layercake-cx.biz";

export type Entry = {
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
export type DirectoryTheme = {
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

export type BlockDescriptor = { type: string; key?: string; label?: string };
export type EntryTemplateRow = {
  id: string;
  is_default: boolean;
  applies_to_group_id: string | null;
  applies_to_term_id: string | null;
  layout_json: BlockDescriptor[];
};
export type CategorisationTerm = { id: string; categorisation_id: string; label: string; slug: string; sort_order: number };
export type Categorisation = { id: string; key: string; label: string; applies_to: string };

// DIR-E6 (docs/DIRECTORIES.md §4.4) — the block order generate_directory_site
// used before entry_templates existed. A directory with no entry_templates
// rows at all (the common case until an Owner/Manager opens the layout
// designer) renders with exactly this order — kept in sync by hand with
// src/lib/entryTemplates.js's IMPLICIT_DEFAULT_LAYOUT (JS/TS runtimes can't
// share a module here). `logo` (entry.logo_url) is deliberately absent —
// that field was never rendered before this feature, so including it by
// default would be a real behaviour change for every existing directory.
export const IMPLICIT_DEFAULT_LAYOUT: BlockDescriptor[] = [
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
export function resolveLayout(
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

export type EvidenceItem = { entry_id: string; claim: string; value: string | null; source_url: string | null; confidence: string | null };
export type MediaAsset = { entry_id: string; url: string; alt_text: string; caption: string | null; is_hero: boolean };
export type AccreditationHeld = { entry_id: string; name: string; issuing_body: string | null; badge_image_url: string | null };
export type EntryLink = { entry_id: string | null; directory_id: string | null; label: string; url: string; style: string; open_in_new: boolean; tracking: boolean };
export type ProductTile = { entry_id: string; title: string; image_url: string | null; price: number | null; currency: string | null; rating: number | null; provider: string | null; destination_url: string };

// Design system ported from the "Ethical Elephant Directory" companion
// design canvas (see docs/DEPLOYMENTS.md's DIR-E3 visual-rebuild entry for
// how it was sourced) — class names and structure match that canvas
// directly so the site actually looks like the design, not a generic
// template. `.wrap` is the full-bleed-background/centered-content pattern
// that makes the header/footer span 100% of the viewport while their
// content stays a readable width.
export const BASE_STYLE = `
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
  .facet-group { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .facet-group-label { font-size: 12.5px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; margin-right: 2px; }
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

export const EXTRA_STYLE = `
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

// Directory browse layout — intent search, filter rail, result bar with
// removable chips, list/map toggle (2026-09, directory browse/entry
// redesign). Deliberately reuses only the theme variables above (no new
// colour/font/radius tokens) so every existing preset keeps its own look;
// only the page structure is new. Radius/shadow values match the existing
// .card/.btn scale rather than the flat/zero-radius aesthetic of the
// source design concept — that concept's colour system was explicitly not
// adopted (see docs/DEPLOYMENTS.md's 2026-09-14 "Phase 0" entry).
const LAYOUT_STYLE = `
  .dir-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
  .dir-toolbar__left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .dir-count { font-family: var(--font-heading); font-size: 21px; font-weight: 600; margin: 0; }
  .dir-active-chip { display: inline-flex; align-items: center; gap: 6px; background: var(--surface-2); border-radius: 999px; padding: 6px 8px 6px 12px; font-size: 12.5px; font-weight: 600; color: var(--ink); }
  .dir-active-chip button { border: 0; background: transparent; cursor: pointer; color: var(--muted); font-size: 14px; line-height: 1; padding: 2px; }
  .dir-clear-all { background: transparent; border: 0; color: var(--muted); font-size: 12.5px; font-weight: 600; text-decoration: underline; cursor: pointer; padding: 0; }
  .dir-seg { display: inline-flex; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; flex: none; }
  .dir-seg button { border: 0; background: var(--surface); color: var(--ink); font-family: inherit; font-weight: 600; font-size: 13px; padding: 8px 16px; cursor: pointer; }
  .dir-seg button.active { background: var(--primary); color: #fff; }
  .dir-body { display: flex; align-items: flex-start; gap: 28px; }
  .dir-rail { width: 250px; flex: none; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; }
  .dir-rail__group { padding: 14px 16px; border-bottom: 1px solid var(--line); }
  .dir-rail__group:last-child { border-bottom: 0; }
  .dir-rail__label { display: block; font-size: 11.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
  .dir-select { width: 100%; padding: 9px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); font-family: inherit; font-size: 13.5px; }
  .dir-msel { position: relative; }
  .dir-msel__trigger { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 9px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); font-family: inherit; font-size: 13.5px; font-weight: 500; cursor: pointer; text-align: left; }
  .dir-msel__trigger:hover { border-color: var(--primary); }
  .dir-msel__trigger--active { border-color: var(--primary); color: var(--primary); font-weight: 700; }
  .dir-msel__trigger-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dir-msel__chevron { flex: none; color: var(--muted); transition: transform .12s; }
  .dir-msel__trigger[aria-expanded="true"] .dir-msel__chevron { transform: rotate(180deg); }
  .dir-msel__panel { position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 6; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.14); padding: 8px; }
  .dir-msel__search { width: 100%; padding: 7px 9px; margin-bottom: 6px; border-radius: 7px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); font-family: inherit; font-size: 13px; }
  .dir-msel__options { display: flex; flex-direction: column; max-height: 240px; overflow-y: auto; }
  .dir-msel__option { display: flex; align-items: center; gap: 8px; padding: 6px; border-radius: 6px; font-size: 13.5px; cursor: pointer; }
  .dir-msel__option:hover { background: var(--surface-2); }
  .dir-msel__option input { flex: none; width: 15px; height: 15px; accent-color: var(--primary); cursor: pointer; }
  .dir-msel__option--hidden { display: none; }
  .dir-switch-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .dir-switch-label { font-size: 13.5px; font-weight: 500; }
  .dir-switch { width: 38px; height: 21px; border-radius: 999px; background: var(--line); position: relative; border: 0; cursor: pointer; flex: none; padding: 0; }
  .dir-switch.active { background: var(--primary); }
  .dir-switch__knob { position: absolute; top: 2px; left: 2px; width: 17px; height: 17px; border-radius: 50%; background: #fff; transition: left .12s; }
  .dir-switch.active .dir-switch__knob { left: 19px; }
  .dir-results { flex: 1; min-width: 0; }
  .dir-rows { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 16px; overflow: hidden; background: var(--surface); }
  .dir-row { display: flex; gap: 20px; padding: 20px; border-bottom: 1px solid var(--line); align-items: flex-start; text-decoration: none; color: inherit; }
  .dir-row:last-child { border-bottom: 0; }
  .dir-row:hover { background: var(--surface-2); }
  .dir-row__logo { width: 64px; height: 64px; border-radius: 12px; background: var(--surface-2); flex: none; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .dir-row__logo img { max-width: 70%; max-height: 70%; object-fit: contain; }
  .dir-row__body { flex: 1; min-width: 0; }
  .dir-row__body h3 { font-size: 18px; margin: 0 0 6px; color: var(--ink); }
  .dir-row__desc { font-size: 14px; line-height: 1.55; color: var(--muted); margin: 0 0 8px; max-width: 66ch; }
  .dir-row__tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .dir-row__aside { width: 170px; flex: none; padding-left: 16px; border-left: 1px solid var(--line); font-size: 12.5px; line-height: 1.7; color: var(--muted); }
  .dir-row__aside strong { display: block; font-weight: 700; color: var(--primary); margin-top: 6px; }
  .dir-empty { padding: 48px 24px; text-align: center; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
  .dir-map-pane { flex: 1; min-width: 0; position: relative; }
  .dir-map-count { position: absolute; top: 16px; left: 16px; z-index: 2; }

  /* Desktop: results and map render permanently side by side (the List/Map
     segmented control is mobile-only, see below) — .dir-pane-hidden is only
     given effect under the 900px stacked-layout breakpoint. */
  @media (min-width: 901px) {
    #dir-view-toggle { display: none; }
  }

  .dir-filters-trigger { display: none; }
  .dir-rail__drawer-header { display: none; }
  .dir-rail-backdrop { display: none; }
  @media (max-width: 640px) {
    .dir-filters-trigger { display: inline-flex; align-items: center; gap: 6px; }
    .dir-rail {
      display: none;
      position: fixed; left: 0; right: 0; bottom: 0; top: auto; z-index: 21;
      max-height: 78vh; width: auto; border-radius: 18px 18px 0 0;
      box-shadow: var(--shadow-lg, 0 -10px 34px rgba(0,0,0,.25));
      overflow-y: auto; border-bottom: 0;
    }
    .dir-rail.dir-rail--open { display: block; }
    .dir-rail__drawer-header {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      position: sticky; top: 0; background: var(--surface); z-index: 1;
      padding: 14px 16px; border-bottom: 1px solid var(--line);
    }
    .dir-rail__drawer-header span:first-child { font-family: var(--font-heading); font-weight: 600; font-size: 15px; }
    .dir-rail-backdrop.dir-rail-backdrop--open {
      display: block; position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 20;
    }
  }

  a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible {
    outline: 2px solid var(--primary); outline-offset: 2px;
  }

  .dir-entry-header { display: flex; gap: 24px; align-items: flex-start; padding: 32px 0 24px; flex-wrap: wrap; }
  .dir-entry-header__logo { width: 96px; height: 96px; border-radius: 16px; background: var(--surface-2); flex: none; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .dir-entry-header__logo img { max-width: 70%; max-height: 70%; object-fit: contain; }
  .dir-entry-header__body { flex: 1; min-width: 240px; }
  .dir-entry-header__desc { font-size: 16px; color: var(--muted); line-height: 1.6; margin: 10px 0 14px; max-width: 64ch; }
  .dir-entry-header__tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
  .dir-entry-header__actions { display: flex; gap: 10px; flex-wrap: wrap; }
  .dir-jumpbar-outer { position: sticky; top: 0; z-index: 5; background: var(--bg); border-bottom: 1px solid var(--line); }
  .dir-jumpbar { display: flex; gap: 8px; overflow-x: auto; padding: 12px 0; }
  .dir-jumpchip { flex: none; font-size: 12.5px; font-weight: 600; padding: 6px 12px; border-radius: 999px; background: var(--surface-2); color: var(--ink); text-decoration: none; white-space: nowrap; }
  .dir-jumpchip:hover { background: var(--surface); }
  .dir-entry-section { scroll-margin-top: 62px; padding-top: 28px; }
  .dir-entry-body { display: flex; align-items: flex-start; gap: 32px; padding-top: 8px; padding-bottom: 48px; }
  .dir-entry-main { flex: 1; min-width: 0; }
  .dir-aside { width: 300px; flex: none; display: flex; flex-direction: column; gap: 24px; }
  .dir-static-map { width: 100%; height: 160px; object-fit: cover; border-radius: 14px; border: 1px solid var(--line); display: block; margin-bottom: 8px; }
  .dir-aside-location-text { font-size: 13px; color: var(--muted); margin-bottom: 6px; }
  .dir-attrs { display: flex; flex-direction: column; }
  .dir-attr-row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
  .dir-attr-row:last-child { border-bottom: 0; }
  .dir-attr-row span:first-child { color: var(--muted); }
  .dir-attr-row span:last-child { font-weight: 600; text-align: right; }
  .dir-related-list { display: flex; flex-direction: column; gap: 10px; }
  .dir-related-row { display: flex; gap: 10px; align-items: center; text-decoration: none; color: inherit; }
  .dir-related-row__logo { width: 36px; height: 36px; border-radius: 8px; background: var(--surface-2); flex: none; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .dir-related-row__logo img { max-width: 70%; max-height: 70%; object-fit: contain; }
  .dir-related-row__body strong { display: block; font-size: 13px; }
  .dir-related-row__body span { font-size: 12px; color: var(--muted); }

  @media (max-width: 900px) {
    .dir-body { flex-direction: column; }
    .dir-rail { width: 100%; }
    .dir-entry-body { flex-direction: column; }
    .dir-aside { width: 100%; }
    /* Below the side-by-side breakpoint, results/map fall back to the
       List/Map toggle (#dir-view-toggle) instead of stacking both in full. */
    .dir-pane-hidden { display: none; }
  }
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
export function sanitizeHexColor(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : fallback;
}

// The "Natural" preset (src/lib/directoryThemePresets.js) — also the
// default look for any directory that has never opened the Branding panel.
// This is a deliberate design change from the plain generic template this
// generator used before DIR-E3's visual rebuild; unlike every prior phase,
// this is NOT "zero behaviour change" for existing directories.
export const NATURAL_DEFAULTS: Required<Omit<DirectoryTheme, "logoUrl">> = {
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
export const FONT_CATALOG: Record<string, string> = {
  Spectral: "Spectral:wght@400;500;600;700",
  "Playfair Display": "Playfair+Display:wght@400;500;600;700",
  Fraunces: "Fraunces:wght@400;500;600;700",
  Inter: "Inter:wght@400;500;600;700;800",
  "Hanken Grotesk": "Hanken+Grotesk:wght@400;500;600;700;800",
};

export function resolvedTheme(theme: DirectoryTheme) {
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

export function themeStyleBlock(theme: DirectoryTheme): string {
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
export function fontLinkTag(theme: DirectoryTheme): string {
  const t = resolvedTheme(theme);
  const families = [...new Set([t.fontHeading, t.fontBody])].map((f) => FONT_CATALOG[f]).filter(Boolean);
  const query = families.map((f) => `family=${f}`).join("&");
  return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${query}&display=swap">`;
}

export function directoryPageShell(opts: {
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
  ${LAYOUT_STYLE}
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
export function siteHeader(opts: { directoryName: string; tagline: string | null; homeUrl: string; logoUrl?: string | null }): string {
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
export function siteFooter(opts: { directoryName: string; homeUrl: string }): string {
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

export function linkTiles(links: EntryLink[]): string {
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

export function entrySchemaOrg(entry: Entry, canonicalUrl: string): Record<string, unknown> {
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

/** Anchor id for a jump-chip section — stable, URL-safe, and unique even
 * across two blocks with the same admin-entered label (index suffix). */
function sectionAnchorId(label: string, index: number): string {
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `s${index}-${slug || "section"}`;
}

export function buildEntryPage(opts: {
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
  /** Every categorisation attached to this directory (not just ones this entry holds terms for) — needed so "Directory attributes" can show a row even for a value this entry doesn't have (e.g. a boolean's "No"). */
  categorisations: FilterBarCategorisation[];
  /** This entry's own held term ids. */
  entryTermIds: string[];
  /** The directory's attached map, if any — for "Show on map" / "Open in directory map". Same source as buildDirectoryLandingPage's map pane (DIR-E4), not a second map implementation. */
  attachedMapEmbedSrc: string | null;
  /** Google Static Maps API key for the Location aside's thumbnail. Omitted (block still renders, just without the image) if not configured — additive, never blocks generation. */
  staticMapsApiKey: string | null;
  /** Up to 4 other entries sharing at least one categorisation term, already ranked by shared-term count — computed once per directory in generateForDirectoryInner (all the data it needs is already in memory there) rather than re-queried per entry. */
  related: Entry[];
}): string {
  const { clientSlug, directorySlug, directoryName, entry, evidence, media, accreditations, links, tiles, theme, layout, categorisations, entryTermIds, attachedMapEmbedSrc, staticMapsApiKey, related } = opts;
  const canonicalUrl = `${SITE_ORIGIN}/directories/${clientSlug}/${directorySlug}/${entry.slug}`;
  const landingUrl = `/directories/${clientSlug}/${directorySlug}`;
  const entryUrl = (e: Entry) => `/directories/${clientSlug}/${directorySlug}/${e.slug}`;
  const filterLink = (catKey: string, slug: string) => `${landingUrl}?${encodeURIComponent(catKey)}=${encodeURIComponent(slug)}`;

  const location = entry.show_address ? [entry.address, entry.city, entry.postcode, entry.country].filter(Boolean).join(", ") : "";
  const notes = entry.notes_html
    ? entry.allow_html
      ? entry.notes_html
      : `<p>${escapeHtml(entry.notes_html)}</p>`
    : "";

  const hero = media.find((m) => m.is_hero) ?? null;
  const gallery = media.filter((m) => m !== hero);

  const heldIds = new Set(entryTermIds);
  const termMeta = buildTermMetaIndex(categorisations);
  const heldTerms = entryTermIds.map((id) => termMeta.get(id)).filter((t): t is TermMeta => !!t);
  // categorisation.key -> this entry's terms for it, for the "categorisation" block type below.
  const entryTermsByKey = new Map<string, CategorisationTerm[]>();
  for (const t of heldTerms) {
    const list = entryTermsByKey.get(t.catKey) ?? [];
    list.push({ id: "", categorisation_id: t.catId, label: t.label, slug: t.slug, sort_order: 0 });
    entryTermsByKey.set(t.catKey, list);
  }

  // ---- Fixed header band (logo, name, description, tag row, actions) ----
  // Deliberately NOT one of the reorderable DIR-E6 blocks below — the
  // design's header is structurally fixed above the body, so `logo` and
  // `heading` blocks (still valid entries in an existing directory's
  // layout_json for backward compatibility) are simply not repeated here;
  // admin-configured order continues to control everything else.
  const headerTagLabels = heldTerms
    .filter((t) => t.catFieldType !== "single_select")
    .map((t) => (t.catFieldType === "boolean" ? t.catLabel : t.label))
    .slice(0, 4);
  const websiteButton = entry.show_website && entry.website_url
    ? `<a class="btn btn-primary" href="${escapeAttr(entry.website_url)}" rel="noopener noreferrer">Visit website</a>`
    : "";
  const showOnMapButton = attachedMapEmbedSrc
    ? `<a class="btn btn-ghost" href="${escapeAttr(attachedMapEmbedSrc)}">Show on map</a>`
    : "";

  const header = `<div class="dir-entry-header">
  ${entry.logo_url ? `<div class="dir-entry-header__logo"><img src="${escapeAttr(entry.logo_url)}" alt="${escapeAttr(entry.name)} logo"></div>` : ""}
  <div class="dir-entry-header__body">
    <h1 style="font-size:34px;line-height:1.1;">${escapeHtml(entry.name)}</h1>
    ${entry.meta_description ? `<p class="dir-entry-header__desc">${escapeHtml(entry.meta_description)}</p>` : ""}
    ${headerTagLabels.length ? `<div class="dir-entry-header__tags">${headerTagLabels.map((l) => `<span class="tag">${escapeHtml(l)}</span>`).join("")}</div>` : ""}
    ${websiteButton || showOnMapButton ? `<div class="dir-entry-header__actions">${websiteButton}${showOnMapButton}</div>` : ""}
  </div>
</div>`;

  // ---- Body blocks (admin-ordered, DIR-E6 §4.4) ----
  const contactParts = [
    entry.show_phone && entry.phone ? `<p>Phone: ${escapeHtml(entry.phone)}</p>` : "",
    entry.show_email && entry.email ? `<p>Email: <a href="mailto:${escapeAttr(entry.email)}">${escapeHtml(entry.email)}</a></p>` : "",
    entry.show_website && entry.website_url ? `<p><a href="${escapeAttr(entry.website_url)}" rel="noopener noreferrer">Visit website</a></p>` : "",
  ].filter(Boolean);

  // logo/heading render "" here — they're in the fixed header above, but
  // stay valid block types so an existing directory's layout_json (which
  // may still list them) doesn't error; harmless no-ops going forward.
  const blockHtml: Record<string, string> = {
    logo: "",
    heading: "",
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
    // No internal heading — every block relies on the admin-set section
    // label (below) for one now; evidence used to hardcode "<h2>Evidence</h2>"
    // here, which double-rendered once a label was added. A directory using
    // this block without labeling it loses that heading; label it "Evidence"
    // in Entry Layout to get one back (and a jump-chip alongside it).
    evidence: evidence.length
      ? `<dl class="evidence-list">${evidence
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

  function renderBlockContent(block: BlockDescriptor): string {
    if (block.type === "categorisation") {
      const terms = (block.key && entryTermsByKey.get(block.key)) || [];
      if (terms.length === 0) return "";
      const chips = terms
        .map((t) => `<a class="category-chip" href="${escapeAttr(filterLink(block.key!, t.slug))}">${escapeHtml(t.label)}</a>`)
        .join("");
      return `<div class="category-chips">${chips}</div>`;
    }
    return blockHtml[block.type] ?? "";
  }

  // Sticky jump-chip bar (design's "On this page") — one chip per block
  // that carries an admin-set section label (EntryLayoutDesigner.jsx,
  // Phase 0). A block with no label renders inline with no chip/anchor, so
  // existing configured layouts are unaffected until an admin opts in.
  const jumpChips: string[] = [];
  const sections = layout.map((block, i) => {
    const content = renderBlockContent(block);
    if (!content) return "";
    if (!block.label) return content;
    const id = sectionAnchorId(block.label, i);
    jumpChips.push(`<a class="dir-jumpchip" href="#${id}">${escapeHtml(block.label)}</a>`);
    return `<div class="dir-entry-section" id="${id}"><h2 style="font-size:22px;margin-bottom:12px;">${escapeHtml(block.label)}</h2>${content}</div>`;
  }).join("\n");
  const jumpBar = jumpChips.length
    ? `<div class="dir-jumpbar-outer"><nav class="wrap dir-jumpbar" aria-label="On this page">${jumpChips.join("")}</nav></div>`
    : "";

  // ---- Right aside ----
  const primaryHex = resolvedTheme(theme).primaryColor.replace(/^#/, "");
  const staticMap =
    staticMapsApiKey && typeof entry.lat === "number" && typeof entry.lng === "number"
      ? `<img class="dir-static-map" loading="lazy" alt="Map showing ${escapeAttr(entry.name)}'s location" src="${escapeAttr(
          `https://maps.googleapis.com/maps/api/staticmap?center=${entry.lat},${entry.lng}&zoom=14&size=600x300&scale=2&markers=color:0x${primaryHex}%7C${entry.lat},${entry.lng}&key=${staticMapsApiKey}`,
        )}">`
      : "";
  const locationBlock = location || attachedMapEmbedSrc
    ? `<div class="dir-aside-block">
  <span class="dir-rail__label">Location</span>
  ${staticMap}
  ${location ? `<div class="dir-aside-location-text">${escapeHtml(location)}</div>` : ""}
  ${attachedMapEmbedSrc ? `<a href="${escapeAttr(attachedMapEmbedSrc)}">Open in directory map &rarr;</a>` : ""}
</div>`
    : "";

  // Directory attributes: every single_select/boolean categorisation gets
  // a row, even ones this entry has no value for ("—" / "No") — a
  // consistent at-a-glance table, not just "whatever happens to be set".
  const attrRows = categorisations
    .filter((c) => c.field_type !== "multi_select")
    .map((c) => {
      if (c.field_type === "boolean") {
        const term = c.terms[0];
        const on = !!term && heldIds.has(term.id);
        const value = on && term ? `<a href="${escapeAttr(filterLink(c.key, term.slug))}">Yes</a>` : "No";
        return `<div class="dir-attr-row"><span>${escapeHtml(c.label)}</span><span>${value}</span></div>`;
      }
      const held = c.terms.find((t) => heldIds.has(t.id));
      const value = held ? `<a href="${escapeAttr(filterLink(c.key, held.slug))}">${escapeHtml(held.label)}</a>` : "—";
      return `<div class="dir-attr-row"><span>${escapeHtml(c.label)}</span><span>${value}</span></div>`;
    })
    .join("");
  const attrsBlock = attrRows
    ? `<div class="dir-aside-block"><span class="dir-rail__label">Directory attributes</span><div class="dir-attrs">${attrRows}</div></div>`
    : "";

  // One chip-list block per multi_select categorisation this entry holds
  // terms for (e.g. "Sector", or an admin-defined "Audience") — generic
  // equivalent of the design's single hardcoded "Who it is for" block.
  const tagBlocks = categorisations
    .filter((c) => c.field_type === "multi_select")
    .map((c) => {
      const held = c.terms.filter((t) => heldIds.has(t.id));
      if (held.length === 0) return "";
      const chips = held.map((t) => `<a class="category-chip" href="${escapeAttr(filterLink(c.key, t.slug))}">${escapeHtml(t.label)}</a>`).join("");
      return `<div class="dir-aside-block"><span class="dir-rail__label">${escapeHtml(c.label)}</span><div class="category-chips" style="margin:0;">${chips}</div></div>`;
    })
    .join("");

  const relatedBlock = related.length
    ? `<div class="dir-aside-block">
  <span class="dir-rail__label">Related entries</span>
  <div class="dir-related-list">
    ${related
      .map((r) => {
        const rLogo = r.panel_image_url || r.logo_url;
        return `<a class="dir-related-row" href="${escapeAttr(entryUrl(r))}">
      <div class="dir-related-row__logo">${rLogo ? `<img src="${escapeAttr(rLogo)}" alt="">` : ""}</div>
      <div class="dir-related-row__body"><strong>${escapeHtml(r.name)}</strong>${r.city ? `<span>${escapeHtml(r.city)}</span>` : ""}</div>
    </a>`;
      })
      .join("\n")}
  </div>
</div>`
    : "";

  const aside = [locationBlock, attrsBlock, tagBlocks, relatedBlock].filter(Boolean).join("\n");

  const description = entry.meta_description || (location ? `${entry.name} — ${location}` : entry.name);

  const breadcrumb = `<a href="${escapeAttr(landingUrl)}" style="display:inline-flex;align-items:center;gap:7px;font-size:14px;font-weight:600;color:var(--muted);margin:20px 0;">&larr; All entries in ${escapeHtml(directoryName)}</a>`;

  const body = `
${siteHeader({ directoryName, tagline: null, homeUrl: landingUrl, logoUrl: theme.logoUrl })}
<div class="wrap">
${breadcrumb}
${header}
</div>
${jumpBar}
<div class="wrap dir-entry-body">
  <div class="dir-entry-main">${sections}</div>
  ${aside ? `<div class="dir-aside">${aside}</div>` : ""}
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

/** One categorisation's terms as they'll appear in the filter bar, grouped
 * under the categorisation's label. `id` is categorisations.id (the uuid)
 * — kept, not just `key`, because it doubles as the field_id the embedded
 * map's postMessage listener expects (see loadCategorisationFiltersForEntries
 * in src/lib/categorisations.js, which the live app's PublishedMapView.jsx
 * uses the same way for the in-app filter bar). */
export type FilterBarCategorisation = {
  id: string;
  key: string;
  label: string;
  /** Facet kind (categorisations.field_type, 20260914170000) — drives which control the filter rail renders: tag chips (multi_select), a single-select control (single_select), or a switch (boolean, always exactly one term). */
  field_type: "multi_select" | "single_select" | "boolean";
  terms: CategorisationTerm[];
};

/** Filter rail — DIR-E5-S4, restructured for the directory browse/entry
 * redesign (2026-09) into a sidebar instead of a horizontal chip bar, with
 * a control per categorisation.field_type: multi_select renders tag
 * chips (unchanged behaviour), single_select a native <select> (replaces
 * rather than adds to the selection), boolean a single on/off switch bound
 * to its one system-managed term. Toggling narrows the entry rows below
 * (via data-term-ids baked into each row) and, when a map is attached,
 * posts the same selection into its <iframe> so one filter action drives
 * both (see buildFilterAndSearchScript below). */
export function filterRail(categorisations: FilterBarCategorisation[]): string {
  if (categorisations.length === 0) return "";
  const groups = categorisations
    .map((cat) => {
      if (cat.field_type === "boolean") {
        const t = cat.terms[0];
        if (!t) return "";
        return `<div class="dir-rail__group">
  <div class="dir-switch-row">
    <span class="dir-switch-label">${escapeHtml(cat.label)}</span>
    <button type="button" class="dir-switch" data-cat-id="${escapeAttr(cat.id)}" data-term-id="${escapeAttr(t.id)}" data-kind="boolean" aria-pressed="false"><span class="dir-switch__knob"></span></button>
  </div>
</div>`;
      }
      if (cat.field_type === "single_select") {
        const options = cat.terms.map((t) => `<option value="${escapeAttr(t.id)}">${escapeHtml(t.label)}</option>`).join("");
        return `<div class="dir-rail__group">
  <span class="dir-rail__label">${escapeHtml(cat.label)}</span>
  <select class="dir-select" data-cat-id="${escapeAttr(cat.id)}" data-kind="single_select">
    <option value="">Any</option>
    ${options}
  </select>
</div>`;
      }
      // Dropdown (not a pill wall) so a field's footprint stays one row tall
      // regardless of term count — needed once a directory has more than a
      // couple of multi_select categorisations stacked in the rail. A
      // search box inside the panel only appears once there are enough
      // terms that scanning them is slower than typing (matches the
      // combobox convention: no point searching 3-4 options).
      const useSearch = cat.terms.length > 8;
      const options = cat.terms
        .map(
          (t) =>
            `<label class="dir-msel__option"><input type="checkbox" class="dir-msel__checkbox" data-cat-id="${escapeAttr(cat.id)}" data-term-id="${escapeAttr(t.id)}" data-kind="multi_select"><span>${escapeHtml(t.label)}</span></label>`,
        )
        .join("");
      return `<div class="dir-rail__group">
  <span class="dir-rail__label">${escapeHtml(cat.label)}</span>
  <div class="dir-msel" data-cat-id="${escapeAttr(cat.id)}">
    <button type="button" class="dir-msel__trigger" data-msel-trigger aria-expanded="false" aria-haspopup="listbox">
      <span class="dir-msel__trigger-text" data-msel-text>Any</span>
      <svg class="dir-msel__chevron" width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <div class="dir-msel__panel" data-msel-panel hidden>
      ${useSearch ? `<input type="text" class="dir-msel__search" data-msel-search placeholder="Search ${escapeAttr(cat.label)}...">` : ""}
      <div class="dir-msel__options" data-msel-options>${options}</div>
    </div>
  </div>
</div>`;
    })
    .join("");
  // The drawer header (mobile only, CSS-gated) turns this same element into
  // a bottom sheet on narrow screens instead of a second, duplicate copy of
  // the filter controls — one set of controls, one set of listeners.
  const drawerHeader = `<div class="dir-rail__drawer-header">
  <span id="dir-drawer-title">Filters</span>
  <button type="button" class="dir-clear-all" id="dir-drawer-clear">Clear</button>
  <button type="button" class="btn btn-primary" id="dir-drawer-show">Show <span id="dir-drawer-count"></span></button>
</div>`;
  return `<aside id="dir-filter-rail" class="dir-rail">${drawerHeader}${groups}</aside>`;
}

// Ported from the Claude Design concept's own logic class (design doc:
// "the filter/search algorithms in it are directly portable") — tokenize,
// drop stopwords, score by distinct-token presence, sort by score.
const SEARCH_STOPWORDS = [
  "find", "for", "an", "the", "and", "with", "who", "that", "are",
  "association", "associations", "body", "bodies", "organisation", "organisations",
  "working", "looking", "need", "want", "professionals", "professional",
  "uk", "member", "members", "membership", "near", "me", "in", "of", "a",
];

/** Embeds a JSON value as a JS literal inside an inline <script> — escapes
 * "</" so a label/slug containing "</script>" can't break out of the tag. */
function embedJson(value: unknown): string {
  return JSON.stringify(value).replace(/<\//g, "<\\/");
}

/** Combined client-side intent search + categorisation-facet filtering over
 * the already-rendered result rows — no new backend, no LLM call (DIR-E7
 * replaces the search half later, with true NL query parsing). Reads
 * data-search / data-term-ids attributes baked into each row at generation
 * time. AND across categorisations, OR within one categorisation's
 * selected terms (matches the in-app map filter bar's semantics,
 * PublishedMapView.jsx) — single_select and boolean facets simply never
 * hold more than one selected term, so the same AND/OR logic covers all
 * three field_types with no extra branching. When hasMap is true, also
 * posts the active selection to the attached map's <iframe> so both stay
 * in sync (EmbedMap.jsx's `message` listener), and mirrors state into the
 * URL (?q=&<facetKey>=<slug,slug>&view=) so a filtered view is shareable/
 * bookmarkable (closes docs/DIRECTORIES.md's DIR-E7-S3 gap). */
export function buildFilterAndSearchScript(hasMap: boolean, categorisations: FilterBarCategorisation[]): string {
  const catsMeta = categorisations.map((c) => ({
    id: c.id,
    key: c.key,
    label: c.label,
    field_type: c.field_type,
    terms: c.terms.map((t) => ({ id: t.id, slug: t.slug, label: t.label })),
  }));

  return `
<script>
(function () {
  var CATS = ${embedJson(catsMeta)};
  var STOPWORDS = ${embedJson(SEARCH_STOPWORDS)};
  var stopwordSet = {};
  STOPWORDS.forEach(function (w) { stopwordSet[w] = true; });

  var form = document.getElementById('dir-search-form');
  var input = document.getElementById('dir-search-input');
  var rows = Array.prototype.slice.call(document.querySelectorAll('[data-search]'));
  var totalCount = rows.length;
  var countEl = document.getElementById('dir-result-count');
  var chipsEl = document.getElementById('dir-active-chips');
  var clearAllBtn = document.getElementById('dir-clear-all');
  var emptyClearBtn = document.getElementById('dir-empty-clear');
  var emptyEl = document.getElementById('dir-empty');
  var rowsWrap = document.getElementById('dir-rows');
  var mapFrame = document.querySelector('#dir-map-embed iframe');
  var mapCountEl = document.getElementById('dir-map-count');
  var segButtons = Array.prototype.slice.call(document.querySelectorAll('#dir-view-toggle button'));
  var resultsCol = document.getElementById('dir-results-col');
  var mapPane = document.getElementById('dir-map-pane');
  var railEl = document.getElementById('dir-filter-rail');
  var railBackdrop = document.getElementById('dir-rail-backdrop');
  var filtersTriggerBtn = document.getElementById('dir-filters-trigger');
  var filtersBadgeEl = document.getElementById('dir-filters-badge');
  var drawerClearBtn = document.getElementById('dir-drawer-clear');
  var drawerShowBtn = document.getElementById('dir-drawer-show');
  var drawerCountEl = document.getElementById('dir-drawer-count');

  var active = {}; // catId -> string[] of selected term ids
  var view = 'list';

  function catById(catId) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].id === catId) return CATS[i];
    return null;
  }
  function termById(cat, termId) {
    if (!cat) return null;
    for (var i = 0; i < cat.terms.length; i++) if (cat.terms[i].id === termId) return cat.terms[i];
    return null;
  }
  function termBySlug(cat, slug) {
    if (!cat) return null;
    for (var i = 0; i < cat.terms.length; i++) if (cat.terms[i].slug === slug) return cat.terms[i];
    return null;
  }

  function tokens(q) {
    var m = q.toLowerCase().match(/[a-z]{3,}/g) || [];
    return m.filter(function (t) { return !stopwordSet[t]; });
  }

  function rowTermIds(row) {
    var raw = row.getAttribute('data-term-ids') || '';
    return raw ? raw.split(',') : [];
  }

  function setRowControlState() {
    document.querySelectorAll('.dir-msel[data-cat-id]').forEach(function (msel) {
      var catId = msel.getAttribute('data-cat-id');
      var cat = catById(catId);
      var selected = active[catId] || [];
      msel.querySelectorAll('.dir-msel__checkbox').forEach(function (cb) {
        cb.checked = selected.indexOf(cb.getAttribute('data-term-id')) !== -1;
      });
      var textEl = msel.querySelector('[data-msel-text]');
      if (textEl) {
        if (!selected.length) textEl.textContent = 'Any';
        else if (selected.length === 1) {
          var t = termById(cat, selected[0]);
          textEl.textContent = t ? t.label : 'Any';
        } else {
          textEl.textContent = selected.length + ' selected';
        }
      }
      var trigger = msel.querySelector('[data-msel-trigger]');
      if (trigger) trigger.classList.toggle('dir-msel__trigger--active', selected.length > 0);
    });
    document.querySelectorAll('.dir-switch[data-cat-id]').forEach(function (sw) {
      var selected = active[sw.getAttribute('data-cat-id')] || [];
      var on = selected.indexOf(sw.getAttribute('data-term-id')) !== -1;
      sw.classList.toggle('active', on);
      sw.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    document.querySelectorAll('select.dir-select[data-cat-id]').forEach(function (sel) {
      var selected = active[sel.getAttribute('data-cat-id')] || [];
      sel.value = selected[0] || '';
    });
  }

  function renderChips() {
    var activeFacetCount = Object.keys(active).filter(function (catId) { return (active[catId] || []).length > 0; }).length;
    if (filtersBadgeEl) filtersBadgeEl.textContent = activeFacetCount ? '(' + activeFacetCount + ')' : '';
    if (!chipsEl) return;
    chipsEl.innerHTML = '';
    var any = false;
    Object.keys(active).forEach(function (catId) {
      var cat = catById(catId);
      if (!cat) return;
      (active[catId] || []).forEach(function (termId) {
        var term = termById(cat, termId);
        if (!term) return;
        any = true;
        var label = cat.field_type === 'boolean' ? cat.label : cat.field_type === 'single_select' ? (cat.label + ': ' + term.label) : term.label;
        var chip = document.createElement('span');
        chip.className = 'dir-active-chip';
        var text = document.createElement('span');
        text.textContent = label;
        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.setAttribute('aria-label', 'Remove ' + label);
        removeBtn.textContent = '\\u00d7';
        removeBtn.addEventListener('click', function () {
          active[catId] = (active[catId] || []).filter(function (id) { return id !== termId; });
          setRowControlState();
          apply();
        });
        chip.appendChild(text);
        chip.appendChild(removeBtn);
        chipsEl.appendChild(chip);
      });
    });
    if (clearAllBtn) clearAllBtn.hidden = !any && !(input && input.value.trim());
  }

  function syncUrl() {
    // Best-effort only — some embedding contexts (opaque-origin documents,
    // sandboxed iframes without allow-same-origin) throw on replaceState.
    // Losing URL shareability there is fine; breaking filtering itself
    // because of it is not, so this never lets an error escape and stop
    // whatever called it (apply() runs postToMap() right after).
    try {
      if (!window.history || !window.history.replaceState) return;
      var params = new URLSearchParams();
      var q = input ? input.value.trim() : '';
      if (q) params.set('q', q);
      CATS.forEach(function (cat) {
        var ids = active[cat.id] || [];
        if (!ids.length) return;
        var slugs = ids.map(function (id) { var t = termById(cat, id); return t ? t.slug : null; }).filter(Boolean);
        if (slugs.length) params.set(cat.key, slugs.join(','));
      });
      if (view !== 'list') params.set('view', view);
      var qs = params.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
    } catch (err) {
      // ignore — see comment above
    }
  }

  function apply() {
    var q = input ? input.value.trim() : '';
    var toks = tokens(q);
    var shown = 0;

    rows.forEach(function (row) {
      var terms = rowTermIds(row);
      var categoryMatch = Object.keys(active).every(function (catId) {
        var selected = active[catId];
        if (!selected || !selected.length) return true;
        return terms.some(function (t) { return selected.indexOf(t) !== -1; });
      });
      var searchMatch = true;
      var order = 0;
      if (toks.length) {
        var hay = (row.getAttribute('data-search') || '');
        var score = 0;
        toks.forEach(function (t) { if (hay.indexOf(t) !== -1) score++; });
        searchMatch = score > 0;
        order = -score;
      }
      var match = searchMatch && categoryMatch;
      row.style.display = match ? '' : 'none';
      row.style.order = match ? String(order) : '';
      if (match) shown++;
    });

    if (countEl) {
      var line;
      if (q) {
        line = shown + (shown === 1 ? ' entry matches \\u201c' + q + '\\u201d' : ' entries match \\u201c' + q + '\\u201d');
      } else if (shown === totalCount) {
        line = 'All ' + shown + (shown === 1 ? ' entry' : ' entries');
      } else {
        line = shown + (shown === 1 ? ' entry' : ' entries');
      }
      countEl.textContent = line;
    }
    if (mapCountEl) mapCountEl.textContent = shown + (shown === 1 ? ' entry' : ' entries') + ' \\u00b7 same filters';
    if (drawerCountEl) drawerCountEl.textContent = String(shown);
    if (rowsWrap) rowsWrap.hidden = shown === 0;
    if (emptyEl) emptyEl.hidden = shown !== 0;

    renderChips();
    syncUrl();
    ${hasMap ? "postToMap();" : ""}
  }

  ${hasMap ? `
  function postToMap() {
    if (!mapFrame || !mapFrame.contentWindow) return;
    mapFrame.contentWindow.postMessage({ type: 'directory-filter-change', activeFilters: active }, '*');
  }
  ` : ""}

  function setView(next) {
    view = next;
    segButtons.forEach(function (btn) { btn.classList.toggle('active', btn.getAttribute('data-view') === next); });
    // .dir-pane-hidden only takes effect below the 900px side-by-side
    // breakpoint (see LAYOUT_STYLE) — above it, both panes stay visible
    // regardless of the "view" state.
    if (resultsCol) resultsCol.classList.toggle('dir-pane-hidden', next !== 'list');
    if (mapPane) mapPane.classList.toggle('dir-pane-hidden', next !== 'map');
    syncUrl();
  }

  // Mobile filter drawer (≤640px, CSS-gated — see LAYOUT_STYLE). Same
  // #dir-filter-rail element as the desktop rail, just repositioned; no
  // second copy of the controls to keep in sync.
  function openDrawer() {
    if (railEl) railEl.classList.add('dir-rail--open');
    if (railBackdrop) railBackdrop.classList.add('dir-rail-backdrop--open');
    document.body.style.overflow = 'hidden';
  }
  function closeDrawer() {
    if (railEl) railEl.classList.remove('dir-rail--open');
    if (railBackdrop) railBackdrop.classList.remove('dir-rail-backdrop--open');
    document.body.style.overflow = '';
  }
  if (filtersTriggerBtn) filtersTriggerBtn.addEventListener('click', openDrawer);
  if (railBackdrop) railBackdrop.addEventListener('click', closeDrawer);
  if (drawerShowBtn) drawerShowBtn.addEventListener('click', closeDrawer);
  if (drawerClearBtn) drawerClearBtn.addEventListener('click', clearAll);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && railEl && railEl.classList.contains('dir-rail--open')) closeDrawer();
  });

  if (form && input) {
    form.addEventListener('submit', function (e) { e.preventDefault(); apply(); });
    input.addEventListener('input', apply);
  }

  document.querySelectorAll('.dir-msel__checkbox[data-cat-id][data-kind="multi_select"]').forEach(function (cb) {
    cb.addEventListener('change', function () {
      var catId = cb.getAttribute('data-cat-id');
      var termId = cb.getAttribute('data-term-id');
      var selected = active[catId] || [];
      var idx = selected.indexOf(termId);
      if (cb.checked && idx === -1) selected = selected.concat([termId]);
      else if (!cb.checked && idx !== -1) selected = selected.slice(0, idx).concat(selected.slice(idx + 1));
      active[catId] = selected;
      setRowControlState();
      apply();
    });
  });

  // Multi-select dropdown open/close — one panel open at a time, closed on
  // an outside click, an Escape press, or picking another dropdown.
  var openMselPanel = null;
  function closeAllMselPanels() {
    document.querySelectorAll('.dir-msel__panel').forEach(function (p) { p.hidden = true; });
    document.querySelectorAll('[data-msel-trigger]').forEach(function (t) { t.setAttribute('aria-expanded', 'false'); });
    openMselPanel = null;
  }
  document.querySelectorAll('[data-msel-trigger]').forEach(function (trigger) {
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      var panel = trigger.parentElement.querySelector('[data-msel-panel]');
      var wasOpen = panel && !panel.hidden;
      closeAllMselPanels();
      if (panel && !wasOpen) {
        panel.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        openMselPanel = panel;
        var searchInput = panel.querySelector('[data-msel-search]');
        if (searchInput) searchInput.focus();
      }
    });
  });
  document.addEventListener('click', function (e) {
    if (openMselPanel && !openMselPanel.parentElement.contains(e.target)) closeAllMselPanels();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && openMselPanel) closeAllMselPanels();
  });
  document.querySelectorAll('[data-msel-search]').forEach(function (input) {
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      var options = input.parentElement.querySelectorAll('.dir-msel__option');
      options.forEach(function (opt) {
        opt.classList.toggle('dir-msel__option--hidden', q.length > 0 && opt.textContent.toLowerCase().indexOf(q) === -1);
      });
    });
  });

  document.querySelectorAll('.dir-switch[data-cat-id]').forEach(function (sw) {
    sw.addEventListener('click', function () {
      var catId = sw.getAttribute('data-cat-id');
      var termId = sw.getAttribute('data-term-id');
      var on = (active[catId] || []).indexOf(termId) !== -1;
      active[catId] = on ? [] : [termId];
      setRowControlState();
      apply();
    });
  });

  document.querySelectorAll('select.dir-select[data-cat-id]').forEach(function (sel) {
    sel.addEventListener('change', function () {
      active[sel.getAttribute('data-cat-id')] = sel.value ? [sel.value] : [];
      apply();
    });
  });

  function clearAll() {
    active = {};
    if (input) input.value = '';
    setRowControlState();
    apply();
  }
  if (clearAllBtn) clearAllBtn.addEventListener('click', clearAll);
  if (emptyClearBtn) emptyClearBtn.addEventListener('click', clearAll);

  segButtons.forEach(function (btn) {
    btn.addEventListener('click', function () { setView(btn.getAttribute('data-view')); });
  });

  // Restore state from the URL (shareable/bookmarkable filtered views).
  (function restoreFromUrl() {
    var params = new URLSearchParams(location.search);
    var q = params.get('q');
    if (q && input) input.value = q;
    CATS.forEach(function (cat) {
      var raw = params.get(cat.key);
      if (!raw) return;
      var ids = raw.split(',').map(function (slug) { var t = termBySlug(cat, slug); return t ? t.id : null; }).filter(Boolean);
      if (ids.length) active[cat.id] = ids;
    });
    setRowControlState();
    var v = params.get('view');
    if (v === 'map' && mapPane) setView('map');
  })();

  apply();
})();
</script>`;
}

/** One term's rendering metadata, resolved once per page build (landing or
 * entry) so a row/section can look up its own terms' labels without
 * re-scanning `categorisations` per entry. Shared between
 * buildDirectoryLandingPage and buildEntryPage. */
type TermMeta = {
  label: string;
  slug: string;
  catId: string;
  catKey: string;
  catLabel: string;
  catFieldType: FilterBarCategorisation["field_type"];
};

function buildTermMetaIndex(categorisations: FilterBarCategorisation[]): Map<string, TermMeta> {
  const termMeta = new Map<string, TermMeta>();
  for (const cat of categorisations) {
    for (const t of cat.terms) {
      termMeta.set(t.id, { label: t.label, slug: t.slug, catId: cat.id, catKey: cat.key, catLabel: cat.label, catFieldType: cat.field_type });
    }
  }
  return termMeta;
}

export function buildDirectoryLandingPage(opts: {
  clientSlug: string;
  directorySlug: string;
  directoryName: string;
  directoryDescription: string | null;
  entries: Entry[];
  directoryLinks: EntryLink[];
  theme: DirectoryTheme;
  attachedMapEmbedSrc: string | null;
  categorisations: FilterBarCategorisation[];
  entryTermIds: Map<string, string[]>;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoImageUrl?: string | null;
  seoNoindex?: boolean;
}): string {
  const { clientSlug, directorySlug, directoryName, directoryDescription, entries, directoryLinks, theme, attachedMapEmbedSrc, categorisations, entryTermIds, seoTitle, seoDescription, seoImageUrl, seoNoindex } = opts;
  const canonicalUrl = `${SITE_ORIGIN}/directories/${clientSlug}/${directorySlug}`;
  const visibleEntries = entries.filter((e) => !e.noindex);

  const termMeta = buildTermMetaIndex(categorisations);

  const rows = visibleEntries
    .map((e) => {
      const location = e.show_address ? [e.address, e.city, e.country].filter(Boolean).join(", ") : "";
      const termIds = entryTermIds.get(e.id) ?? [];
      const terms = termIds.map((id) => termMeta.get(id)).filter((t): t is TermMeta => !!t);

      // Chip labels: multi_select terms show their own label; a present
      // boolean term shows its categorisation's label instead of "Yes"
      // (matches the design's "switch chips read the switch label" rule).
      // single_select terms are shown in the aside instead, not repeated
      // here, to avoid saying the same thing twice in one row.
      const tagLabels = terms
        .filter((t) => t.catFieldType !== "single_select")
        .map((t) => (t.catFieldType === "boolean" ? t.catLabel : t.label))
        .slice(0, 3);
      const asideTerm = terms.find((t) => t.catFieldType === "single_select");

      const searchHaystack = [e.name, location, e.meta_description, ...terms.map((t) => t.label)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const searchText = escapeAttr(searchHaystack);
      const termIdsAttr = escapeAttr(termIds.join(","));
      const panelImageUrl = e.panel_image_url || e.logo_url;
      const logo = panelImageUrl
        ? `<img src="${escapeAttr(panelImageUrl)}" alt="${escapeAttr(e.name)} logo" loading="lazy">`
        : "";
      const panelBoxStyle = e.panel_background_color ? ` style="background:${escapeAttr(e.panel_background_color)};"` : "";
      const entryUrl = `/directories/${clientSlug}/${directorySlug}/${e.slug}`;

      return `<a class="dir-row" href="${escapeAttr(entryUrl)}" data-search="${searchText}" data-term-ids="${termIdsAttr}">
  <div class="dir-row__logo"${panelBoxStyle}>${logo}</div>
  <div class="dir-row__body">
    <h3>${escapeHtml(e.name)}</h3>
    ${e.meta_description ? `<p class="dir-row__desc">${escapeHtml(e.meta_description)}</p>` : ""}
    ${tagLabels.length ? `<div class="dir-row__tags">${tagLabels.map((l) => `<span class="tag">${escapeHtml(l)}</span>`).join("")}</div>` : ""}
  </div>
  <div class="dir-row__aside">
    ${location ? escapeHtml(location) : ""}
    ${asideTerm ? `<strong>${escapeHtml(asideTerm.label)}</strong>` : ""}
  </div>
</a>`;
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
  // it simply has no map section (no List/Map toggle either — there's
  // nothing to switch to). This isn't the abandoned DIR-E8 "directory
  // links to a map" feature (docs/DIRECTORIES.md §4.7's note): it's the
  // existing map→directory attachment used bidirectionally, only ever
  // showing a map that has *already* chosen this directory as its
  // datasource — a directory still can't pick an arbitrary map.
  // This page owns the filter rail (filterRail below) and the results list
  // (dir-results-col below) — tell the embedded map not to render its own
  // duplicate filter bar or results sidebar; filtering is driven via
  // postMessage instead (buildFilterAndSearchScript's postToMap()), and the
  // map keeps just its own controls (zoom, clustering, etc).
  const mapEmbedSrcWithFlag = attachedMapEmbedSrc
    ? `${attachedMapEmbedSrc}${attachedMapEmbedSrc.includes("?") ? "&" : "?"}hideFilterBar=1&hideListPanel=1`
    : null;
  const hasMap = !!mapEmbedSrcWithFlag;
  const rail = filterRail(categorisations);

  const viewToggle = hasMap
    ? `<div class="dir-seg" id="dir-view-toggle">
    <button type="button" class="active" data-view="list">List</button>
    <button type="button" data-view="map">Map</button>
  </div>`
    : "";

  // Mobile-only (CSS-gated, ≤640px) trigger that turns the filter rail into
  // a bottom-sheet drawer — see LAYOUT_STYLE and filterRail()'s drawer header.
  const filtersTrigger = rail
    ? `<button type="button" class="btn btn-ghost dir-filters-trigger" id="dir-filters-trigger">Filters <span id="dir-filters-badge"></span></button>`
    : "";

  // Renders permanently alongside dir-results-col on desktop (side by side,
  // see .dir-body/.dir-map-pane in LAYOUT_STYLE); dir-pane-hidden only takes
  // effect below the 900px breakpoint, where the List/Map toggle applies.
  const mapPane = hasMap
    ? `<div id="dir-map-pane" class="dir-map-pane dir-pane-hidden">
    <span class="chip dir-map-count" id="dir-map-count"></span>
    <div id="dir-map-embed"><iframe src="${escapeAttr(mapEmbedSrcWithFlag!)}" loading="lazy" title="${escapeAttr(directoryName)} map" style="width:100%;height:640px;border:0;border-radius:18px;overflow:hidden;"></iframe></div>
  </div>`
    : "";

  const body = `
${siteHeader({ directoryName, tagline: null, homeUrl: ".", logoUrl: theme.logoUrl })}
<div style="position:relative;overflow:hidden;background:linear-gradient(180deg,var(--sage) 0%,var(--bg) 60%);">
  <div class="wrap" style="padding-top:56px;padding-bottom:56px;text-align:center;">
    <div class="eyebrow" style="margin-bottom:14px;">${visibleEntries.length} entr${visibleEntries.length === 1 ? "y" : "ies"}</div>
    <h1 style="font-size:44px;line-height:1.08;max-width:760px;margin:0 auto 16px;">${escapeHtml(directoryName)}</h1>
    ${directoryDescription ? `<p class="muted" style="font-size:18px;max-width:600px;margin:0 auto 28px;">${escapeHtml(directoryDescription)}</p>` : ""}
    <form id="dir-search-form" style="max-width:640px;margin:0 auto;display:flex;gap:10px;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:10px 10px 10px 18px;box-shadow:0 12px 32px -18px rgba(0,0,0,.35);">
      <input id="dir-search-input" type="text" placeholder="Describe what you are looking for, or search by name" style="flex-grow:1;border:0;outline:0;font-size:16px;font-family:inherit;background:transparent;color:var(--ink);">
      <button type="submit" class="btn btn-primary">Search</button>
    </form>
  </div>
</div>
<div class="wrap" style="padding-top:40px;padding-bottom:20px;">
  <div class="dir-toolbar">
    <div class="dir-toolbar__left">
      <h2 class="dir-count" id="dir-result-count">${visibleEntries.length}${visibleEntries.length === 1 ? " entry" : " entries"}</h2>
      <div id="dir-active-chips"></div>
      <button type="button" class="dir-clear-all" id="dir-clear-all" hidden>Clear all</button>
    </div>
    ${filtersTrigger}
    ${viewToggle}
  </div>
  ${linkTiles(directoryLinks)}
  <div class="dir-body">
    ${rail}
    <div class="dir-rail-backdrop" id="dir-rail-backdrop"></div>
    <div class="dir-results" id="dir-results-col">
      <div class="dir-rows" id="dir-rows">
        ${rows}
      </div>
      <div class="dir-empty" id="dir-empty" hidden>
        <p style="font-family:var(--font-heading);font-size:22px;font-weight:600;margin:0 0 12px;">Nothing matches these filters</p>
        <button type="button" class="btn btn-ghost" id="dir-empty-clear">Clear all filters</button>
      </div>
    </div>
    ${mapPane}
  </div>
</div>
${siteFooter({ directoryName, homeUrl: "." })}
${buildFilterAndSearchScript(hasMap, categorisations)}
`.trim();

  return directoryPageShell({
    title: seoTitle || directoryName,
    description: seoDescription || directoryDescription || `${directoryName} — ${visibleEntries.length} entr${visibleEntries.length === 1 ? "y" : "ies"}`,
    canonicalUrl,
    jsonLd,
    body,
    theme,
    imageUrl: seoImageUrl ?? null,
    noindex: !!seoNoindex,
  });
}

/** Up to `max` other active entries sharing at least one categorisation
 * term with `entry`, ranked by shared-term count then name. Pure/in-memory
 * — generateForDirectoryInner already loads every entry's term ids for the
 * whole directory (for the filter rail), so this needs no extra DB query. */
export function relatedEntries(entry: Entry, allEntries: Entry[], termIdsByEntry: Map<string, Set<string>>, max = 4): Entry[] {
  const mine = termIdsByEntry.get(entry.id);
  if (!mine || mine.size === 0) return [];
  const scored: { entry: Entry; score: number }[] = [];
  for (const other of allEntries) {
    if (other.id === entry.id) continue;
    const theirs = termIdsByEntry.get(other.id);
    if (!theirs || theirs.size === 0) continue;
    let score = 0;
    for (const id of mine) if (theirs.has(id)) score++;
    if (score > 0) scored.push({ entry: other, score });
  }
  scored.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));
  return scored.slice(0, max).map((s) => s.entry);
}

export function buildLlmsTxt(opts: {
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

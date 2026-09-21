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
import { FONT_CATALOG } from "./fontCatalog.generated.ts";

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
  keywords?: string | null;
  ai_summary?: string | null;
  noindex: boolean | null;
  structured_data_type: string | null;
  panel_image_url: string | null;
  panel_background_color: string | null;
  updated_at?: string | null;
};

// A region's background: either a flat colour, or a gradient built from 2+
// stops. `color` is always present (used for solid, and as the fallback if
// a gradient somehow resolves to zero stops) so switching solid <-> gradient
// in the UI never loses the other setting — same rule as the dev spec's §4.
export type RegionBackground = {
  type?: "solid" | "gradient";
  color?: string;
  gradient?: {
    type?: "linear" | "radial";
    angle?: number;
    stops?: { color?: string; position?: number }[];
  };
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
  fontHeading?: string;
  fontBody?: string;
  logoUrl?: string;
  faviconUrl?: string;
  // Full-width decorative banner behind the header and top of the page.
  // Unset = no banner (every existing directory). HTTP(S) URL only.
  heroBannerUrl?: string;
  heroBannerHeight?: number;
  // Region overrides (header/footer only — "body" is already the flat
  // palette above). Each is optional; an unset region reproduces exactly
  // what generate_directory_site rendered before these fields existed —
  // see NATURAL_DEFAULTS and resolvedTheme() below.
  headerBackground?: RegionBackground;
  headerText?: string;
  footerBackground?: RegionBackground;
  footerText?: string;
  footerLink?: string;
  footerLinkHover?: string;
  // Typography sizes — any valid CSS length (e.g. "16px", "2.5rem"). Each
  // is optional; an unset size reproduces exactly what that element
  // rendered before these fields existed (see FONT_SIZE_DEFAULTS below and
  // the calc()-scaled per-context headings this drives).
  fontSizeBase?: string;
  fontSizeH1?: string;
  fontSizeH2?: string;
  fontSizeH3?: string;
  // Header branding mode + site title override. logoUrl above is unchanged
  // (still the header logo image); these three just control HOW it's shown.
  headerMode?: "logo" | "logoText" | "text";
  // Independent of headerMode: false omits the title text even when mode is
  // logoText/text. Unset means "follow headerMode" (logo → hidden, else shown)
  // so directories saved before this field keep their published look.
  showHeaderTitle?: boolean;
  siteTitle?: string;
  logoMaxHeight?: number;
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
  body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--font-body); font-size: var(--fs-base); -webkit-font-smoothing: antialiased; }
  h1, h2, h3, h4 { font-family: var(--font-heading); font-weight: 600; margin: 0; letter-spacing: -0.01em; }
  h1 { font-size: var(--fs-h1); }
  h2 { font-size: var(--fs-h2); }
  h3 { font-size: var(--fs-h3); }
  a { color: var(--primary); text-decoration: none; }
  a:hover { color: var(--primary-2); }
  .dir-footer-link { color: var(--ftr-link); }
  .dir-footer-link:hover { color: var(--ftr-link-hover); }
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
  .prose h2 { font-size: calc(var(--fs-h2) * 0.75); margin: 24px 0 14px; }
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

  /* Site navigation — CSS-first so every destination is a crawlable <a href>
     even when the hamburger/dropdown is closed. Desktop dropdowns use
     :hover/:focus-within; mobile uses <details>/<summary> (no JS). */
  /* Optional full-width hero banner (theme_json.heroBannerUrl). Sits behind
     the glass header and the top of the page body, then fades into --bg.
     body.has-hero-banner is added by directoryPageShell when the URL is valid. */
  body.has-hero-banner { position: relative; }
  .dir-page-banner {
    position: absolute; top: 0; left: 0; right: 0; z-index: 0; pointer-events: none;
    height: var(--hero-banner-height, 480px);
    background-image: var(--hero-banner-image);
    background-size: cover; background-position: center top; background-repeat: no-repeat;
  }
  .dir-page-banner::after {
    content: ""; position: absolute; inset: 0;
    background: linear-gradient(to bottom, transparent 18%, var(--bg) 92%);
  }
  .has-hero-banner .dir-page { position: relative; z-index: 1; }
  .dir-home-intro {
    position: relative; overflow: hidden;
    background: linear-gradient(180deg, var(--sage) 0%, var(--bg) 60%);
  }
  .has-hero-banner .dir-home-intro { background: transparent; }
  /* Header must stack above following page content. The homepage hero band is
     a later sibling with an opaque background; without a z-index the dropdown
     (and mobile panel) paint underneath it. Content pages look fine because
     their wrap is transparent. Stay below .dm-consent (40). */
  .dir-site-header { position: relative; z-index: 30; border-bottom: 1px solid var(--line); background: var(--hdr-bg); backdrop-filter: blur(6px); }
  .dir-site-header__inner { display: flex; align-items: center; justify-content: space-between; gap: 20px; min-height: 76px; }
  .dir-brand { display: flex; align-items: center; gap: 12px; color: inherit; flex: none; }
  .dir-brand:focus-visible, .dir-nav-desktop a:focus-visible, .dir-nav-mobile a:focus-visible, .dir-nav-mobile summary:focus-visible, .dir-breadcrumb a:focus-visible, .dir-footer-nav a:focus-visible {
    outline: 2px solid var(--primary); outline-offset: 3px;
  }
  .dir-nav-desktop { display: flex; align-items: center; flex-wrap: wrap; justify-content: flex-end; gap: 2px; }
  .dir-nav-desktop a { color: var(--hdr-text); font-size: 14px; font-weight: 600; padding: 10px 12px; border-radius: 8px; }
  .dir-nav-desktop a:hover { color: var(--primary); }
  .dir-nav-item { position: relative; }
  .dir-nav-item--dropdown > a::after { content: " ▾"; font-size: 11px; opacity: .7; }
  .dir-nav-dropdown {
    display: none; position: absolute; top: 100%; right: 0; min-width: 220px; z-index: 8;
    background: var(--surface); border: 1px solid var(--line); border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0,0,0,.12); padding: 6px; margin: 0; list-style: none;
  }
  .dir-nav-item--dropdown:hover .dir-nav-dropdown,
  .dir-nav-item--dropdown:focus-within .dir-nav-dropdown { display: block; }
  .dir-nav-dropdown a { display: block; padding: 10px 12px; border-radius: 8px; white-space: nowrap; }
  .dir-nav-dropdown a:hover { background: var(--surface-2); }
  .dir-nav-mobile { display: none; position: relative; }
  .dir-nav-mobile > summary {
    list-style: none; cursor: pointer; min-width: 44px; min-height: 44px;
    display: flex; align-items: center; justify-content: center;
    border: 1px solid var(--line); border-radius: 10px; background: var(--surface);
    color: var(--hdr-text); font-size: 20px; font-weight: 700;
  }
  .dir-nav-mobile > summary::-webkit-details-marker { display: none; }
  .dir-nav-mobile__panel {
    position: absolute; right: 0; top: calc(100% + 8px); z-index: 9;
    width: min(320px, calc(100vw - 40px)); background: var(--surface);
    border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 12px 32px rgba(0,0,0,.16);
    padding: 8px; display: flex; flex-direction: column;
  }
  .dir-nav-mobile__panel a, .dir-nav-mobile__panel summary {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    min-height: 44px; padding: 10px 12px; border-radius: 8px; color: var(--ink);
    font-size: 15px; font-weight: 600; cursor: pointer;
  }
  .dir-nav-mobile__panel a:hover, .dir-nav-mobile__panel summary:hover { background: var(--surface-2); }
  .dir-nav-mobile__section { border-radius: 8px; }
  .dir-nav-mobile__section > summary { list-style: none; }
  .dir-nav-mobile__section > summary::-webkit-details-marker { display: none; }
  .dir-nav-mobile__section > summary::after { content: "+"; font-weight: 700; color: var(--muted); }
  .dir-nav-mobile__section[open] > summary::after { content: "−"; }
  .dir-nav-mobile__children { display: flex; flex-direction: column; padding: 0 0 6px 12px; }
  @media (max-width: 800px) {
    .dir-nav-desktop { display: none; }
    .dir-nav-mobile { display: block; }
  }
  .dir-breadcrumb { margin: 20px 0; }
  .dir-breadcrumb ol { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; list-style: none; margin: 0; padding: 0; font-size: 13.5px; font-weight: 600; color: var(--muted); }
  .dir-breadcrumb li { display: flex; align-items: center; gap: 6px; }
  .dir-breadcrumb li:not(:last-child)::after { content: ">"; color: var(--line); font-weight: 500; }
  .dir-breadcrumb a { color: var(--muted); }
  .dir-breadcrumb a:hover { color: var(--primary); }
  .dir-breadcrumb [aria-current="page"] { color: var(--ink); font-weight: 600; }
  .dir-footer-nav { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 24px 32px; flex: 1; min-width: 220px; }
  .dir-footer-col { display: flex; flex-direction: column; gap: 6px; }
  .dir-footer-col__title { font-family: var(--font-heading); font-size: 14.5px; font-weight: 600; color: var(--ftr-text); }
  .dir-footer-col a { font-size: 13.5px; }
  .dm-consent { position: fixed; z-index: 40; left: 16px; right: 16px; bottom: 16px; max-width: 520px; margin: 0 auto; background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 12px 32px rgba(0,0,0,.18); padding: 16px 18px; font-size: 13.5px; line-height: 1.5; }
  .dm-consent p { margin: 0 0 12px; }
  .dm-consent__actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
  .dm-consent button { font-family: inherit; font-size: 13px; font-weight: 600; border-radius: 8px; padding: 8px 12px; cursor: pointer; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); }
  .dm-consent button.dm-consent__accept { background: var(--primary); color: #fff; border-color: var(--primary); }
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
  .dir-body { display: flex; flex-direction: column; gap: 24px; }
  .dir-content-row { display: flex; flex-direction: column; gap: 24px; }
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
  .dir-row { display: flex; gap: 0; padding: 0; border-bottom: 1px solid var(--line); align-items: stretch; text-decoration: none; color: inherit; }
  .dir-row:last-child { border-bottom: 0; }
  .dir-row:hover { background: var(--surface-2); }
  /* Logo is its own column: bg fills the cell, image is centred. Mobile
     keeps a compact 64px strip; desktop uses 208px so wide marks stay
     readable. Height always stretches to the row. */
  .dir-row__logo { position: relative; width: 64px; min-width: 64px; align-self: stretch; border-radius: 0; background: var(--surface-2); flex: none; overflow: hidden; }
  .dir-row__logo img { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); max-width: calc(100% - 24px); max-height: calc(100% - 24px); width: auto; height: auto; object-fit: contain; }
  .dir-row__body { flex: 1; min-width: 0; padding: 20px; }
  .dir-row__body h3 { font-size: calc(var(--fs-h3) * 0.75); margin: 0 0 6px; color: var(--ink); }
  .dir-row__desc { font-size: 14px; line-height: 1.55; color: var(--muted); margin: 0 0 8px; max-width: 66ch; }
  .dir-row__meta { font-size: 12.5px; line-height: 1.7; color: var(--muted); margin: 0 0 8px; }
  .dir-row__meta strong { display: block; font-weight: 700; color: var(--primary); margin-top: 2px; }
  .dir-row__tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .dir-empty { padding: 48px 24px; text-align: center; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
  .dir-map-pane { flex: 1; min-width: 0; position: relative; }
  .dir-map-count { position: absolute; top: 16px; left: 16px; z-index: 2; }
  .dir-search-form { max-width: 880px; margin: 0 auto; display: flex; flex-wrap: wrap; gap: 10px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 10px 10px 10px 18px; box-shadow: 0 12px 32px -18px rgba(0,0,0,.35); }
  .dir-search-form input { flex: 1 1 220px; min-width: 0; border: 0; outline: 0; font-size: 16px; font-family: inherit; background: transparent; color: var(--ink); }
  .dir-hmc-btn { flex: none; }
  .dir-ai-banner { width: 100%; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin: 0 0 16px; padding: 12px 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); font-size: 14px; }
  .dir-ai-banner[hidden] { display: none; }
  .dir-ai-banner strong { font-family: var(--font-heading); }
  .dir-ai-banner__based { color: var(--muted); font-size: 13px; }
  .dir-ai-banner__actions { display: flex; gap: 12px; margin-left: auto; }
  .dir-ai-banner__actions button { background: transparent; border: 0; color: var(--primary); font-size: 13px; font-weight: 600; text-decoration: underline; cursor: pointer; padding: 0; font-family: inherit; }
  .dir-row__why { font-size: 13px; line-height: 1.5; color: var(--ink); margin: 8px 0 0; padding: 8px 10px; background: var(--surface-2); border-radius: 8px; }
  .dir-row__why[hidden] { display: none; }
  .dir-row__why strong { display: block; font-size: 11.5px; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); margin-bottom: 4px; }
  .dir-hmc-backdrop { display: none; position: fixed; inset: 0; z-index: 35; background: rgba(0,0,0,.4); align-items: flex-end; justify-content: center; padding: 16px; }
  .dir-hmc-backdrop.dir-hmc-backdrop--open { display: flex; }
  .dir-hmc-dialog { width: min(560px, 100%); max-height: min(82vh, 720px); background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 16px 48px rgba(0,0,0,.22); display: flex; flex-direction: column; overflow: hidden; }
  .dir-hmc-dialog header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--line); }
  .dir-hmc-dialog header h2 { margin: 0; font-family: var(--font-heading); font-size: 18px; }
  .dir-hmc-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .dir-hmc-msg { font-size: 14.5px; line-height: 1.55; padding: 10px 12px; border-radius: 12px; max-width: 92%; white-space: pre-wrap; }
  .dir-hmc-msg--assistant { background: var(--surface-2); align-self: flex-start; }
  .dir-hmc-msg--user { background: var(--primary); color: #fff; align-self: flex-end; }
  .dir-hmc-form { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--line); }
  .dir-hmc-form textarea { flex: 1; min-height: 44px; max-height: 120px; resize: vertical; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); font-family: inherit; font-size: 14.5px; }
  .dir-hmc-error { color: #b91c1c; font-size: 13px; margin: 0 16px 12px; }
  .dir-hmc-error[hidden] { display: none; }
  @media (min-width: 641px) {
    .dir-hmc-backdrop { align-items: center; }
  }

  /* Desktop: results and map render permanently side by side (the List/Map
     segmented control is mobile-only, see below) — .dir-pane-hidden is only
     given effect under the 900px stacked-layout breakpoint.
     2026-09-18: the filter rail also switches from a fixed-width left
     column to a horizontal, wrapping bar spanning the full width above
     results+map — a 3-column (rail | results | map) row left results too
     narrow. Tablet (641-900px, below) keeps its existing stacked full-width
     rail and List/Map toggle untouched. */
  @media (min-width: 901px) {
    #dir-view-toggle { display: none; }

    .dir-rail { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 16px; width: 100%; padding: 16px; }
    .dir-rail__group { flex: 0 1 220px; padding: 0; border-bottom: 0; }

    .dir-content-row { flex-direction: row; align-items: flex-start; gap: 28px; }
    .dir-results { flex: 0 0 calc(66.666% - 14px); }
    .dir-map-pane { flex: 0 0 calc(33.333% - 14px); }

    .dir-row__logo { width: 208px; min-width: 208px; }
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

// A region background's solid `color` isn't always a hex the user picked —
// the built-in header default is a translucent white (`rgba(255,255,255,.6)`)
// over the page background, which a plain hex can't express. Same
// interpolate-into-<style> risk as sanitizeHexColor above, so validate
// against the narrow set of forms this file actually emits rather than
// accepting an arbitrary string.
function sanitizeCssColorValue(value: string | undefined, fallback: string): string {
  return value && /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,\s%]+\)|hsla?\([0-9.,\s%]+\))$/.test(value) ? value : fallback;
}

// Resolves a region's background to a single CSS `background` value, so
// callers never branch on solid vs. gradient (dev spec §5). Gradient stops
// use sanitizeHexColor (same as every other colour token) since they only
// ever come from the <input type="color"> stop editor, never free text.
function resolveRegionBackground(bg: RegionBackground | undefined, fallback: string): string {
  const color = sanitizeCssColorValue(bg?.color, fallback);
  if (bg?.type !== "gradient") return color;
  const stops = (bg.gradient?.stops ?? []).filter((s) => s && typeof s.position === "number");
  if (stops.length < 2) return color;
  const stopList = stops
    .map((s) => `${sanitizeHexColor(s.color, color)} ${Math.min(100, Math.max(0, s.position!))}%`)
    .join(", ");
  if (bg.gradient?.type === "radial") return `radial-gradient(circle, ${stopList})`;
  const angle = typeof bg.gradient?.angle === "number" ? bg.gradient.angle : 135;
  return `linear-gradient(${angle}deg, ${stopList})`;
}

// The "Natural" preset (src/lib/directoryThemePresets.js) — also the
// default look for any directory that has never opened the Branding panel.
// This is a deliberate design change from the plain generic template this
// generator used before DIR-E3's visual rebuild; unlike every prior phase,
// this is NOT "zero behaviour change" for existing directories.
export const NATURAL_DEFAULTS: Required<
  Omit<
    DirectoryTheme,
    | "logoUrl"
    | "faviconUrl"
    | "heroBannerUrl"
    | "heroBannerHeight"
    | "headerBackground"
    | "headerText"
    | "footerBackground"
    | "footerText"
    | "footerLink"
    | "footerLinkHover"
    | "fontSizeBase"
    | "fontSizeH1"
    | "fontSizeH2"
    | "fontSizeH3"
    | "headerMode"
    | "showHeaderTitle"
    | "siteTitle"
    | "logoMaxHeight"
  >
> = {
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
  fontHeading: "Spectral",
  fontBody: "Hanken Grotesk",
};

export { FONT_CATALOG };

// Defaults for the region tokens below reproduce exactly what siteHeader()/
// siteFooter() hardcoded before these fields existed (translucent glass
// header, dark teal footer) — an unset region must render pixel-identically
// to a directory that predates region theming.
const HEADER_BG_DEFAULT = "rgba(255,255,255,.6)";
const FOOTER_BG_DEFAULT = "#0E3A34";
const FOOTER_TEXT_DEFAULT = "#FFFFFF";
const FOOTER_LINK_DEFAULT = "#CFE3DE";

// Defaults match the dev spec's suggested typography scale exactly (§4).
// Every per-context heading below is expressed as calc(var(--fs-h*) * ratio)
// rather than a literal, where ratio = today's hardcoded pixel value ÷ the
// matching default here — so an unset theme computes back to the exact
// original pixel value, and a directory that DOES set a size scales every
// heading context proportionally instead of flattening them to one size.
const FONT_SIZE_BASE_DEFAULT = "16px";
const FONT_SIZE_H1_DEFAULT = "2.5rem";
const FONT_SIZE_H2_DEFAULT = "2rem";
const FONT_SIZE_H3_DEFAULT = "1.5rem";

// Same interpolate-into-<style> risk as sanitizeHexColor — a CSS length is
// a unit-suffixed number, nothing else.
function sanitizeCssLength(value: string | undefined, fallback: string): string {
  return value && /^-?\d*\.?\d+(px|rem|em|%)$/.test(value) ? value : fallback;
}

export function resolvedTheme(theme: DirectoryTheme) {
  const inkColor = sanitizeHexColor(theme.inkColor, NATURAL_DEFAULTS.inkColor);
  const footerLink = sanitizeHexColor(theme.footerLink, FOOTER_LINK_DEFAULT);
  return {
    primaryColor: sanitizeHexColor(theme.primaryColor, NATURAL_DEFAULTS.primaryColor),
    primaryDarkColor: sanitizeHexColor(theme.primaryDarkColor, NATURAL_DEFAULTS.primaryDarkColor),
    accentColor: sanitizeHexColor(theme.accentColor, NATURAL_DEFAULTS.accentColor),
    backgroundColor: sanitizeHexColor(theme.backgroundColor, NATURAL_DEFAULTS.backgroundColor),
    surfaceColor: sanitizeHexColor(theme.surfaceColor, NATURAL_DEFAULTS.surfaceColor),
    surfaceAltColor: sanitizeHexColor(theme.surfaceAltColor, NATURAL_DEFAULTS.surfaceAltColor),
    inkColor,
    mutedColor: sanitizeHexColor(theme.mutedColor, NATURAL_DEFAULTS.mutedColor),
    lineColor: sanitizeHexColor(theme.lineColor, NATURAL_DEFAULTS.lineColor),
    sageColor: sanitizeHexColor(theme.sageColor, NATURAL_DEFAULTS.sageColor),
    sageInkColor: sanitizeHexColor(theme.sageInkColor, NATURAL_DEFAULTS.sageInkColor),
    fontHeading: FONT_CATALOG[theme.fontHeading ?? ""] ? theme.fontHeading! : NATURAL_DEFAULTS.fontHeading,
    fontBody: FONT_CATALOG[theme.fontBody ?? ""] ? theme.fontBody! : NATURAL_DEFAULTS.fontBody,
    headerBackground: resolveRegionBackground(theme.headerBackground, HEADER_BG_DEFAULT),
    headerText: sanitizeHexColor(theme.headerText, inkColor),
    footerBackground: resolveRegionBackground(theme.footerBackground, FOOTER_BG_DEFAULT),
    footerText: sanitizeHexColor(theme.footerText, FOOTER_TEXT_DEFAULT),
    footerLink,
    footerLinkHover: sanitizeHexColor(theme.footerLinkHover, footerLink),
    fontSizeBase: sanitizeCssLength(theme.fontSizeBase, FONT_SIZE_BASE_DEFAULT),
    fontSizeH1: sanitizeCssLength(theme.fontSizeH1, FONT_SIZE_H1_DEFAULT),
    fontSizeH2: sanitizeCssLength(theme.fontSizeH2, FONT_SIZE_H2_DEFAULT),
    fontSizeH3: sanitizeCssLength(theme.fontSizeH3, FONT_SIZE_H3_DEFAULT),
  };
}

export function themeStyleBlock(theme: DirectoryTheme): string {
  const t = resolvedTheme(theme);
  const banner = resolvedHeroBanner(theme);
  const bannerVars = banner
    ? `--hero-banner-image: url(${JSON.stringify(banner.url)}); --hero-banner-height: ${banner.height}px;`
    : "";
  return `:root {
    --bg: ${t.backgroundColor}; --surface: ${t.surfaceColor}; --surface-2: ${t.surfaceAltColor};
    --ink: ${t.inkColor}; --muted: ${t.mutedColor}; --line: ${t.lineColor};
    --primary: ${t.primaryColor}; --primary-2: ${t.primaryDarkColor}; --accent: ${t.accentColor};
    --sage: ${t.sageColor}; --sage-ink: ${t.sageInkColor};
    --font-heading: "${t.fontHeading}", Georgia, serif; --font-body: "${t.fontBody}", system-ui, sans-serif;
    --hdr-bg: ${t.headerBackground}; --hdr-text: ${t.headerText};
    --ftr-bg: ${t.footerBackground}; --ftr-text: ${t.footerText};
    --ftr-link: ${t.footerLink}; --ftr-link-hover: ${t.footerLinkHover};
    --fs-base: ${t.fontSizeBase}; --fs-h1: ${t.fontSizeH1}; --fs-h2: ${t.fontSizeH2}; --fs-h3: ${t.fontSizeH3};
    ${bannerVars}
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

/** Client-writable theme_json URLs interpolated into HTML/CSS. Only http(s). */
export function sanitizeHttpUrl(value: string | undefined): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

const HERO_BANNER_HEIGHT_DEFAULT = 480;
const HERO_BANNER_HEIGHT_MIN = 160;
const HERO_BANNER_HEIGHT_MAX = 800;

export function resolvedHeroBanner(theme: DirectoryTheme): { url: string; height: number } | null {
  const url = sanitizeHttpUrl(theme.heroBannerUrl);
  if (!url) return null;
  const rawHeight = typeof theme.heroBannerHeight === "number" ? theme.heroBannerHeight : HERO_BANNER_HEIGHT_DEFAULT;
  const height = Math.min(HERO_BANNER_HEIGHT_MAX, Math.max(HERO_BANNER_HEIGHT_MIN, rawHeight));
  return { url, height };
}

/** Browser-tab icon for the published site. Only http(s) URLs are emitted —
 * theme_json is client-writable jsonb, and this value is interpolated into
 * <link href>. Empty / invalid / non-http schemes omit the tags so existing
 * directories keep whatever the host's default favicon already is. */
export function faviconLinkTags(theme: DirectoryTheme): string {
  const hrefRaw = sanitizeHttpUrl(theme.faviconUrl);
  if (!hrefRaw) return "";
  const href = escapeAttr(hrefRaw);
  return `<link rel="icon" href="${href}">\n<link rel="apple-touch-icon" href="${href}">`;
}

export type SiteAnalyticsDestination = {
  provider: string;
  enabled?: boolean;
  measurement_id?: string;
  container_id?: string;
};

/** First-party + optional GA4/GTM wiring baked into every public HTML page. */
export type SiteAnalytics = {
  directoryId: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  destinations: SiteAnalyticsDestination[];
};

export type PageAnalytics = SiteAnalytics & {
  pageKind: "landing" | "entry" | "content";
  listingId?: string | null;
  listingName?: string | null;
};

export function directoryPageShell(opts: {
  title: string;
  description: string;
  canonicalUrl: string;
  jsonLd: Record<string, unknown> | Record<string, unknown>[];
  body: string;
  imageUrl?: string | null;
  noindex?: boolean;
  theme?: DirectoryTheme;
  analytics?: PageAnalytics | null;
}): string {
  const hasBanner = !!resolvedHeroBanner(opts.theme ?? {});
  const ogImage = opts.imageUrl
    ? `<meta property="og:image" content="${escapeAttr(opts.imageUrl)}">\n<meta name="twitter:card" content="summary_large_image">`
    : `<meta name="twitter:card" content="summary">`;
  const graphs = Array.isArray(opts.jsonLd) ? opts.jsonLd : [opts.jsonLd];
  const jsonLdTags = graphs.map((g) => `<script type="application/ld+json">${JSON.stringify(g)}</script>`).join("\n");
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
${jsonLdTags}
${fontLinkTag(opts.theme ?? {})}
${faviconLinkTags(opts.theme ?? {})}
<style>
  ${themeStyleBlock(opts.theme ?? {})}
  ${BASE_STYLE}
  ${EXTRA_STYLE}
  ${LAYOUT_STYLE}
</style>
</head>
<body${hasBanner ? ' class="has-hero-banner"' : ""}>
${hasBanner ? '<div class="dir-page-banner" aria-hidden="true"></div><div class="dir-page">' : ""}
${opts.body}
${hasBanner ? "</div>" : ""}
${opts.analytics ? buildSiteAnalyticsMarkup(opts.analytics) : ""}
</body>
</html>`;
}

export type SiteNavLink = { id: string; label: string; href: string };
export type SiteNavItem = SiteNavLink & { children: SiteNavLink[] };
export type SiteNav = {
  homeUrl: string;
  homeLabel: string;
  items: SiteNavItem[];
};

function renderDesktopNav(nav: SiteNav): string {
  const home = `<a href="${escapeAttr(nav.homeUrl)}">${escapeHtml(nav.homeLabel)}</a>`;
  const items = nav.items
    .map((item) => {
      if (!item.children.length) {
        return `<a href="${escapeAttr(item.href)}">${escapeHtml(item.label)}</a>`;
      }
      const childLinks = [
        `<li><a href="${escapeAttr(item.href)}">${escapeHtml(item.label)}</a></li>`,
        ...item.children.map((c) => `<li><a href="${escapeAttr(c.href)}">${escapeHtml(c.label)}</a></li>`),
      ].join("");
      return `<div class="dir-nav-item dir-nav-item--dropdown">
  <a href="${escapeAttr(item.href)}">${escapeHtml(item.label)}</a>
  <ul class="dir-nav-dropdown">${childLinks}</ul>
</div>`;
    })
    .join("\n");
  return `<nav class="dir-nav-desktop" aria-label="Primary">${home}${items}</nav>`;
}

function renderMobileNav(nav: SiteNav): string {
  const home = `<a href="${escapeAttr(nav.homeUrl)}">${escapeHtml(nav.homeLabel)}</a>`;
  const items = nav.items
    .map((item) => {
      if (!item.children.length) {
        return `<a href="${escapeAttr(item.href)}">${escapeHtml(item.label)}</a>`;
      }
      const childLinks = [
        `<a href="${escapeAttr(item.href)}">${escapeHtml(item.label)}</a>`,
        ...item.children.map((c) => `<a href="${escapeAttr(c.href)}">${escapeHtml(c.label)}</a>`),
      ].join("");
      return `<details class="dir-nav-mobile__section">
  <summary>${escapeHtml(item.label)}</summary>
  <div class="dir-nav-mobile__children">${childLinks}</div>
</details>`;
    })
    .join("\n");
  return `<details class="dir-nav-mobile">
  <summary aria-label="Open menu">☰</summary>
  <nav class="dir-nav-mobile__panel" aria-label="Primary">${home}${items}</nav>
</details>`;
}

function renderFooterNav(nav: SiteNav): string {
  if (!nav.items.length) return "";
  const cols = nav.items
    .map((item) => {
      const kids = item.children.map((c) => `<a href="${escapeAttr(c.href)}" class="dir-footer-link">${escapeHtml(c.label)}</a>`).join("");
      return `<div class="dir-footer-col">
  <a class="dir-footer-col__title dir-footer-link" href="${escapeAttr(item.href)}">${escapeHtml(item.label)}</a>
  ${kids}
</div>`;
    })
    .join("");
  return `<nav class="dir-footer-nav" aria-label="Footer">${cols}</nav>`;
}

/** Full-bleed header — background spans the viewport, content stays inside
 * `.wrap`. Used on every page (landing + entry), matching the canvas's own
 * consistent-header-everywhere pattern. */
export function siteHeader(opts: {
  directoryName: string;
  tagline: string | null;
  homeUrl: string;
  logoUrl?: string | null;
  headerMode?: "logo" | "logoText" | "text";
  showHeaderTitle?: boolean;
  siteTitle?: string | null;
  logoMaxHeight?: number;
  nav?: SiteNav | null;
}): string {
  const mode = opts.headerMode === "logo" || opts.headerMode === "text" ? opts.headerMode : "logoText";
  const displayTitle = opts.siteTitle?.trim() || opts.directoryName;
  const maxHeight = typeof opts.logoMaxHeight === "number" && opts.logoMaxHeight > 0 ? Math.min(120, opts.logoMaxHeight) : 42;
  // A real uploaded logo keeps its own aspect ratio (height fixed, width
  // auto) — only the no-logo placeholder is forced square, since there's
  // no real image to preserve an aspect ratio from.
  const logo = opts.logoUrl
    ? `<img src="${escapeAttr(opts.logoUrl)}" alt="${escapeAttr(displayTitle)} logo" style="height:${maxHeight}px;width:auto;object-fit:contain;">`
    : `<div style="width:${maxHeight}px;height:${maxHeight}px;border-radius:12px;background:var(--primary);"></div>`;
  const showLogo = mode !== "text";
  const showText = opts.showHeaderTitle === false ? false : mode !== "logo";
  const brand = showText
    ? `<div style="line-height:1.05;">
        <div style="font-family:var(--font-heading);font-size:19px;font-weight:600;color:var(--hdr-text);">${escapeHtml(displayTitle)}</div>
        ${opts.tagline ? `<div class="muted" style="font-size:12.5px;font-weight:600;">${escapeHtml(opts.tagline)}</div>` : ""}
      </div>`
    : "";
  const nav = opts.nav;
  const navHtml = nav ? `${renderDesktopNav(nav)}${renderMobileNav(nav)}` : "";
  return `<header class="dir-site-header">
  <div class="wrap dir-site-header__inner">
    <a class="dir-brand" href="${escapeAttr(opts.homeUrl)}" aria-label="${escapeAttr(displayTitle)}">
      ${showLogo ? logo : ""}
      ${brand}
    </a>
    ${navHtml}
  </div>
</header>`;
}

/** Full-bleed dark footer, identical on every page. Note the disclaimer
 * span keeps its own fixed muted teal rather than a theme token — it's
 * decorative platform copy, not part of the three-region model (dev
 * spec's non-goals §3: no per-component overrides beyond header/body/
 * footer). */
export function siteFooter(opts: { directoryName: string; homeUrl: string; nav?: SiteNav | null }): string {
  const footerNav = opts.nav ? renderFooterNav(opts.nav) : "";
  return `<footer style="margin-top:56px;background:var(--ftr-bg);">
  <div class="wrap" style="padding-top:40px;padding-bottom:28px;display:flex;align-items:flex-start;justify-content:space-between;gap:28px;flex-wrap:wrap;">
    <div>
      <div style="font-family:var(--font-heading);font-size:17px;font-weight:600;color:var(--ftr-text);">${escapeHtml(opts.directoryName)}</div>
      <a href="${escapeAttr(opts.homeUrl)}" class="dir-footer-link" style="font-size:13.5px;">Browse all entries</a>
    </div>
    ${footerNav}
    <span style="font-size:12.5px;color:#8FB4AD;">Powered by Layercake&nbsp;Maps · content is editorial, commercial links never affect inclusion.</span>
  </div>
</footer>`;
}

export function linkTiles(links: EntryLink[]): string {
  if (links.length === 0) return "";
  const items = links
    .map((l) => {
      const rel = [l.open_in_new ? "noopener noreferrer" : null, l.tracking ? "sponsored nofollow" : null].filter(Boolean).join(" ");
      const target = l.open_in_new ? ' target="_blank"' : "";
      return `<a class="link-tile link-tile--${l.style === "primary" ? "primary" : "secondary"}" href="${escapeAttr(l.url)}"${target}${rel ? ` rel="${escapeAttr(rel)}"` : ""} data-dm-event="listing_cta_click" data-dm-cta="${l.style === "primary" ? "primary" : "secondary"}">${escapeHtml(l.label)}</a>`;
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
  nav?: SiteNav | null;
  analytics?: SiteAnalytics | null;
}): string {
  const { clientSlug, directorySlug, directoryName, entry, evidence, media, accreditations, links, tiles, theme, layout, categorisations, entryTermIds, attachedMapEmbedSrc, staticMapsApiKey, related, nav, analytics } = opts;
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
    ? `<a class="btn btn-primary" href="${escapeAttr(entry.website_url)}" rel="noopener noreferrer" data-dm-event="listing_website_click" data-dm-cta="website">Visit website</a>`
    : "";
  const showOnMapButton = attachedMapEmbedSrc
    ? `<a class="btn btn-ghost" href="${escapeAttr(attachedMapEmbedSrc)}" data-dm-event="listing_cta_click" data-dm-cta="map">Show on map</a>`
    : "";

  const header = `<div class="dir-entry-header">
  ${entry.logo_url ? `<div class="dir-entry-header__logo"><img src="${escapeAttr(entry.logo_url)}" alt="${escapeAttr(entry.name)} logo"></div>` : ""}
  <div class="dir-entry-header__body">
    <h1 style="font-size:calc(var(--fs-h1) * 0.85);line-height:1.1;">${escapeHtml(entry.name)}</h1>
    ${entry.meta_description ? `<p class="dir-entry-header__desc">${escapeHtml(entry.meta_description)}</p>` : ""}
    ${headerTagLabels.length ? `<div class="dir-entry-header__tags">${headerTagLabels.map((l) => `<span class="tag">${escapeHtml(l)}</span>`).join("")}</div>` : ""}
    ${websiteButton || showOnMapButton ? `<div class="dir-entry-header__actions">${websiteButton}${showOnMapButton}</div>` : ""}
  </div>
</div>`;

  // ---- Body blocks (admin-ordered, DIR-E6 §4.4) ----
  const contactParts = [
    entry.show_phone && entry.phone ? `<p>Phone: ${escapeHtml(entry.phone)}</p>` : "",
    entry.show_email && entry.email ? `<p>Email: <a href="mailto:${escapeAttr(entry.email)}" data-dm-event="listing_contact_click" data-dm-cta="email">${escapeHtml(entry.email)}</a></p>` : "",
    entry.show_website && entry.website_url ? `<p><a href="${escapeAttr(entry.website_url)}" rel="noopener noreferrer" data-dm-event="listing_website_click" data-dm-cta="website">Visit website</a></p>` : "",
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
    return `<div class="dir-entry-section" id="${id}"><h2 style="font-size:calc(var(--fs-h2) * 0.6875);margin-bottom:12px;">${escapeHtml(block.label)}</h2>${content}</div>`;
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
      <div class="dir-related-row__logo">${rLogo ? `<img src="${escapeAttr(rLogo)}" alt="${escapeAttr(r.name)} logo">` : ""}</div>
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
${siteHeader({ directoryName, tagline: null, homeUrl: landingUrl, logoUrl: theme.logoUrl, headerMode: theme.headerMode, showHeaderTitle: theme.showHeaderTitle, siteTitle: theme.siteTitle, logoMaxHeight: theme.logoMaxHeight, nav: nav ?? null })}
<div class="wrap">
${breadcrumb}
${header}
</div>
${jumpBar}
<div class="wrap dir-entry-body">
  <div class="dir-entry-main">${sections}</div>
  ${aside ? `<div class="dir-aside">${aside}</div>` : ""}
</div>
${siteFooter({ directoryName, homeUrl: landingUrl, nav: nav ?? null })}
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
    analytics: analytics
      ? { ...analytics, pageKind: "entry", listingId: entry.id, listingName: entry.name }
      : null,
  });
}

// ---- Directory content pages (Feature 6) ----

export type ContentPage = {
  id: string;
  parent_page_id: string | null;
  title: string;
  slug: string;
  position?: number;
  nav_label?: string | null;
  show_in_navigation?: boolean;
  is_active?: boolean;
  body_html: string;
  meta_title: string | null;
  meta_description: string | null;
  noindex: boolean;
  updated_at?: string | null;
};

export function contentPagePublicPath(page: ContentPage, byId: Map<string, ContentPage>): string {
  if (!page.parent_page_id) return page.slug;
  const parent = byId.get(page.parent_page_id);
  return parent ? `${parent.slug}/${page.slug}` : page.slug;
}

export function contentPageHref(clientSlug: string, directorySlug: string, path: string): string {
  return `/directories/${clientSlug}/${directorySlug}/${path}`;
}

function pageNavLabel(page: ContentPage): string {
  const label = page.nav_label?.trim();
  return label || page.title;
}

function sortContentPages(a: ContentPage, b: ContentPage): number {
  return (a.position ?? 0) - (b.position ?? 0) || a.title.localeCompare(b.title);
}

/** Header / mobile / footer tree from published pages that are flagged to appear in navigation. */
export function buildSiteNav(opts: {
  clientSlug: string;
  directorySlug: string;
  homeNavLabel?: string | null;
  pages: ContentPage[];
}): SiteNav {
  const homeUrl = `/directories/${opts.clientSlug}/${opts.directorySlug}`;
  const homeLabel = opts.homeNavLabel?.trim() || "Home";
  const byId = new Map(opts.pages.map((p) => [p.id, p]));
  const inNav = (p: ContentPage) => p.is_active !== false && p.show_in_navigation !== false;
  const childrenOf = (parentId: string) => opts.pages.filter((p) => p.parent_page_id === parentId && inNav(p)).sort(sortContentPages);
  const items = opts.pages
    .filter((p) => !p.parent_page_id && inNav(p))
    .sort(sortContentPages)
    .map((p) => ({
      id: p.id,
      label: pageNavLabel(p),
      href: `${homeUrl}/${contentPagePublicPath(p, byId)}`,
      children: childrenOf(p.id).map((c) => ({
        id: c.id,
        label: pageNavLabel(c),
        href: `${homeUrl}/${contentPagePublicPath(c, byId)}`,
      })),
    }));
  return { homeUrl, homeLabel, items };
}

export function breadcrumbListJsonLd(items: { name: string; url: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

function renderBreadcrumbTrail(
  crumbs: { name: string; href?: string }[],
): string {
  const items = crumbs
    .map((c, i) => {
      const last = i === crumbs.length - 1;
      if (last || !c.href) return `<li><span aria-current="page">${escapeHtml(c.name)}</span></li>`;
      return `<li><a href="${escapeAttr(c.href)}">${escapeHtml(c.name)}</a></li>`;
    })
    .join("");
  return `<nav class="dir-breadcrumb" aria-label="Breadcrumb"><ol>${items}</ol></nav>`;
}

/** WebPage, not Article — these are editor-maintained reference pages ("About", "How to join"), not dated/authored posts. */
export function contentPageSchemaOrg(page: ContentPage, directoryName: string, canonicalUrl: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: page.title,
    url: canonicalUrl,
    isPartOf: { "@type": "CollectionPage", name: directoryName },
  };
}

export function buildContentPage(opts: {
  clientSlug: string;
  directorySlug: string;
  directoryName: string;
  page: ContentPage;
  parentPage: ContentPage | null;
  childPages: ContentPage[];
  pagesById: Map<string, ContentPage>;
  theme: DirectoryTheme;
  nav: SiteNav;
  analytics?: SiteAnalytics | null;
}): string {
  const { clientSlug, directorySlug, directoryName, page, parentPage, childPages, pagesById, theme, nav, analytics } = opts;
  const landingUrl = nav.homeUrl;
  const hrefFor = (p: ContentPage) => contentPageHref(clientSlug, directorySlug, contentPagePublicPath(p, pagesById));
  const canonicalUrl = `${SITE_ORIGIN}${hrefFor(page)}`;

  const crumbItems: { name: string; href?: string }[] = [{ name: nav.homeLabel, href: landingUrl }];
  const jsonLdCrumbs: { name: string; url: string }[] = [{ name: nav.homeLabel, url: `${SITE_ORIGIN}${landingUrl}` }];
  if (parentPage) {
    crumbItems.push({ name: pageNavLabel(parentPage), href: hrefFor(parentPage) });
    jsonLdCrumbs.push({ name: pageNavLabel(parentPage), url: `${SITE_ORIGIN}${hrefFor(parentPage)}` });
  }
  crumbItems.push({ name: pageNavLabel(page) });
  jsonLdCrumbs.push({ name: pageNavLabel(page), url: canonicalUrl });

  const childList = childPages.length
    ? `<div class="dir-aside-block" style="margin-top:32px;">
  <span class="dir-rail__label">On this topic</span>
  <div style="display:grid;gap:6px;margin-top:8px;">
    ${childPages.map((c) => `<a href="${escapeAttr(hrefFor(c))}" style="font-size:14px;font-weight:600;">${escapeHtml(c.title)}</a>`).join("\n")}
  </div>
</div>`
    : "";

  const description = page.meta_description || `${page.title} — ${directoryName}`;

  const body = `
${siteHeader({ directoryName, tagline: null, homeUrl: landingUrl, logoUrl: theme.logoUrl, headerMode: theme.headerMode, showHeaderTitle: theme.showHeaderTitle, siteTitle: theme.siteTitle, logoMaxHeight: theme.logoMaxHeight, nav })}
<div class="wrap" style="max-width:760px;">
${renderBreadcrumbTrail(crumbItems)}
<h1 style="font-family:var(--font-heading);font-size:clamp(calc(var(--fs-h1) * 0.7), 4vw, calc(var(--fs-h1) * 0.95));margin:0 0 24px;">${escapeHtml(page.title)}</h1>
${page.body_html}
${childList}
</div>
${siteFooter({ directoryName, homeUrl: landingUrl, nav })}
`.trim();

  return directoryPageShell({
    title: page.meta_title || `${page.title} — ${directoryName}`,
    description,
    canonicalUrl,
    jsonLd: [contentPageSchemaOrg(page, directoryName, canonicalUrl), breadcrumbListJsonLd(jsonLdCrumbs)],
    body,
    noindex: !!page.noindex,
    theme,
    analytics: analytics ? { ...analytics, pageKind: "content" } : null,
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

const SEARCH_HAYSTACK_MAX = 8000;

function stripHtmlForSearch(html: string | null | undefined): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** Public listing text baked into each row's data-search attribute. */
function buildSearchHaystack(e: Entry, termLabels: string[]): string {
  const street = e.show_address ? e.address : null;
  const parts = [
    e.name,
    e.slug,
    e.website_url,
    street,
    e.city,
    e.postcode,
    e.country,
    e.meta_description,
    e.keywords,
    e.ai_summary,
    stripHtmlForSearch(e.notes_html).slice(0, SEARCH_HAYSTACK_MAX),
    ...termLabels,
  ];
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim().toLowerCase().slice(0, SEARCH_HAYSTACK_MAX);
}

/** Embeds a JSON value as a JS literal inside an inline <script> — escapes
 * "</" so a label/slug containing "</script>" can't break out of the tag. */
function embedJson(value: unknown): string {
  return JSON.stringify(value).replace(/<\//g, "<\\/");
}

/** Help me choose wiring for buildFilterAndSearchScript — omitted (null)
 * hides the Help me choose control; keyword search always runs locally. */
export type AiSearchOptions = {
  directoryId: string;
  enabled: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
};

export function parseDirectoryDestinations(raw: unknown): SiteAnalyticsDestination[] {
  const dests: SiteAnalyticsDestination[] = [];
  if (!raw || typeof raw !== "object") return dests;
  const list = (raw as { destinations?: unknown }).destinations;
  if (!Array.isArray(list)) return dests;
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const d = item as SiteAnalyticsDestination;
    if (d.provider === "ga4" && d.enabled && typeof d.measurement_id === "string" && /^G-[A-Z0-9]+$/.test(d.measurement_id)) {
      dests.push({ provider: "ga4", enabled: true, measurement_id: d.measurement_id });
    }
    if (d.provider === "gtm" && d.enabled && typeof d.container_id === "string" && /^GTM-[A-Z0-9]+$/.test(d.container_id)) {
      dests.push({ provider: "gtm", enabled: true, container_id: d.container_id });
    }
  }
  return dests;
}

function buildSiteAnalyticsMarkup(analytics: PageAnalytics): string {
  const ga4 = analytics.destinations.find((d) => d.provider === "ga4" && d.enabled && d.measurement_id);
  const gtm = analytics.destinations.find((d) => d.provider === "gtm" && d.enabled && d.container_id);
  const needsConsentUi = !!(ga4 || gtm);
  const pageEvent = analytics.pageKind === "entry" ? "listing_view" : "directory_view";
  const restUrl = `${analytics.supabaseUrl.replace(/\/$/, "")}/rest/v1/map_engagement_events`;
  const banner = needsConsentUi
    ? `<div id="dm-consent" class="dm-consent" hidden>
  <p>We use optional analytics cookies (Google Analytics / Tag Manager) to understand how this directory is used. First-party usage events stay on this platform and do not identify you.</p>
  <div class="dm-consent__actions">
    <button type="button" id="dm-consent-reject">Reject analytics</button>
    <button type="button" class="dm-consent__accept" id="dm-consent-accept">Accept analytics</button>
  </div>
</div>`
    : "";

  return `${banner}
<script>
(function () {
  var CONSENT_KEY = 'dm_directory_analytics_consent';
  var SESSION_KEY = 'dm_map_engagement_session_id';
  var REST_URL = ${embedJson(restUrl)};
  var ANON_KEY = ${embedJson(analytics.supabaseAnonKey)};
  var DIRECTORY_ID = ${embedJson(analytics.directoryId)};
  var PAGE_KIND = ${embedJson(analytics.pageKind)};
  var LISTING_ID = ${embedJson(analytics.listingId ?? null)};
  var LISTING_NAME = ${embedJson(analytics.listingName ?? null)};
  var PAGE_EVENT = ${embedJson(pageEvent)};
  var GA4_ID = ${embedJson(ga4?.measurement_id ?? null)};
  var GTM_ID = ${embedJson(gtm?.container_id ?? null)};
  var NEEDS_CONSENT_UI = ${embedJson(needsConsentUi)};
  var tagsLoaded = false;
  window.dataLayer = window.dataLayer || [];

  function sessionId() {
    try {
      var id = sessionStorage.getItem(SESSION_KEY);
      if (!id) {
        id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('s_' + Date.now() + '_' + Math.random().toString(36).slice(2, 12));
        sessionStorage.setItem(SESSION_KEY, id);
      }
      return id;
    } catch (e) { return null; }
  }

  function consentState() {
    try { return localStorage.getItem(CONSENT_KEY); } catch (e) { return null; }
  }
  function setConsentState(v) {
    try { localStorage.setItem(CONSENT_KEY, v); } catch (e) {}
  }

  function gtag() { window.dataLayer.push(arguments); }

  function loadScript(src, attrs) {
    var s = document.createElement('script');
    s.async = true;
    s.src = src;
    if (attrs) for (var k in attrs) s.setAttribute(k, attrs[k]);
    document.head.appendChild(s);
    return s;
  }

  function loadTags() {
    if (tagsLoaded) return;
    tagsLoaded = true;
    window.gtag = gtag;
    gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', wait_for_update: 500 });
    gtag('consent', 'update', { analytics_storage: 'granted', ad_storage: 'granted' });
    gtag('js', new Date());
    if (GA4_ID) {
      loadScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA4_ID));
      gtag('config', GA4_ID, { anonymize_ip: true });
    }
    if (GTM_ID) {
      window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
      loadScript('https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(GTM_ID));
    }
  }

  function safeProps(meta, listingId) {
    var props = { directory_id: DIRECTORY_ID, page_kind: PAGE_KIND, path: location.pathname };
    if (listingId) props.listing_id = listingId;
    if (LISTING_NAME && listingId === LISTING_ID) props.listing_name = LISTING_NAME;
    if (meta && typeof meta === 'object') {
      if (meta.path) props.path = meta.path;
      if (meta.query) props.search_term = String(meta.query).slice(0, 500);
      if (meta.filter) props.filter = meta.filter;
      if (meta.cta_type) props.cta_type = meta.cta_type;
    }
    return props;
  }

  function pushExternal(eventType, props) {
    if (consentState() !== 'granted') return;
    try {
      window.dataLayer.push(Object.assign({ event: eventType }, props));
      if (typeof window.gtag === 'function' && GA4_ID) {
        window.gtag('event', eventType, props);
      }
    } catch (e) {}
  }

  function record(eventType, detail) {
    detail = detail || {};
    var listingId = detail.listingId || LISTING_ID || null;
    var meta = detail.meta || null;
    var row = {
      directory_id: DIRECTORY_ID,
      listing_id: listingId,
      event_type: eventType,
      surface: 'directory_site',
      client_session_id: sessionId(),
      meta: meta
    };
    try {
      fetch(REST_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': ANON_KEY,
          'Authorization': 'Bearer ' + ANON_KEY,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(row)
      }).catch(function () {});
    } catch (e) {}
    pushExternal(eventType, safeProps(meta, listingId));
  }

  window.dmRecordEngagement = record;

  var banner = document.getElementById('dm-consent');
  function hideBanner() { if (banner) banner.hidden = true; }
  function showBanner() { if (banner) banner.hidden = false; }

  if (NEEDS_CONSENT_UI) {
    var existing = consentState();
    if (existing === 'granted') loadTags();
    else if (existing !== 'denied') showBanner();
    var acceptBtn = document.getElementById('dm-consent-accept');
    var rejectBtn = document.getElementById('dm-consent-reject');
    if (acceptBtn) acceptBtn.addEventListener('click', function () {
      setConsentState('granted');
      hideBanner();
      loadTags();
    });
    if (rejectBtn) rejectBtn.addEventListener('click', function () {
      setConsentState('denied');
      hideBanner();
    });
  }

  var viewMeta = { path: location.pathname };
  if (PAGE_KIND === 'entry' && LISTING_NAME) viewMeta.listing_name = LISTING_NAME;
  record(PAGE_EVENT, { listingId: LISTING_ID, meta: viewMeta });

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var el = t.closest('[data-dm-event]');
    if (!el) return;
    var name = el.getAttribute('data-dm-event');
    if (!name) return;
    var cta = el.getAttribute('data-dm-cta');
    var listingId = el.getAttribute('data-dm-listing') || LISTING_ID;
    record(name, { listingId: listingId, meta: cta ? { cta_type: cta, path: location.pathname } : { path: location.pathname } });
    if (name === 'listing_website_click') {
      record('listing_cta_click', { listingId: listingId, meta: { cta_type: cta || 'website', path: location.pathname } });
    }
  }, true);
})();
</script>`;
}

/** Combined client-side keyword search + categorisation-facet filtering over
 * the already-rendered result rows. Reads data-search / data-term-ids /
 * data-entry-id attributes baked into each row at generation time. AND
 * across categorisations, OR within one categorisation's selected terms
 * (matches the in-app map filter bar's semantics, PublishedMapView.jsx) —
 * single_select and boolean facets simply never hold more than one selected
 * term, so the same AND/OR logic covers all three field_types with no extra
 * branching. When hasMap is true, also posts the active selection and the
 * shown entry ids to the attached map's <iframe> so both stay in sync
 * (EmbedMap.jsx's `message` listener), and mirrors state into the URL
 * (?q=&<facetKey>=<slug,slug>&view=) so a filtered view is
 * shareable/bookmarkable (closes docs/DIRECTORIES.md's DIR-E7-S3 gap).
 *
 * Search is always local keyword matching over the full-listing haystack.
 * When aiSearch.enabled, Help me choose can additionally restrict the
 * shown set to directory_ai_search's returned ids (same apply() path). */
export function buildFilterAndSearchScript(hasMap: boolean, categorisations: FilterBarCategorisation[], aiSearch: AiSearchOptions | null = null): string {
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

  var AI_SEARCH_ENABLED = ${embedJson(!!aiSearch?.enabled)};
  var AI_SEARCH_DIRECTORY_ID = ${embedJson(aiSearch?.directoryId ?? null)};
  var AI_SEARCH_URL = ${embedJson(aiSearch ? aiSearch.supabaseUrl + "/functions/v1/directory_ai_search" : null)};
  var AI_SEARCH_ANON_KEY = ${embedJson(aiSearch?.supabaseAnonKey ?? null)};
  var HMC_OPENING = ${embedJson("What would you like an association to help you with?\n\nTell me a little about your work, career or business and what you’d like support with.\n\nFor example: “I’ve recently started working in publishing and I’d like to develop my skills and meet people in the industry.”")};
  var resultEntryIds = null; // null = keyword+facets; array = Help me choose allow-list
  var aiReasons = {};
  var aiBasedOn = [];
  var aiMessages = [];
  var aiCandidateIds = null;
  var aiSearchToken = 0;
  var hmcStorageKey = AI_SEARCH_DIRECTORY_ID ? ('dm-help-me-choose:' + AI_SEARCH_DIRECTORY_ID) : null;

  var form = document.getElementById('dir-search-form');
  var input = document.getElementById('dir-search-input');
  var rows = Array.prototype.slice.call(document.querySelectorAll('[data-search]'));
  var totalCount = rows.length;
  var countEl = document.getElementById('dir-result-count');
  var toolbarHelpBtn = document.getElementById('dir-toolbar-hmc');
  var aiBanner = document.getElementById('dir-ai-banner');
  var aiBannerCount = document.getElementById('dir-ai-banner-count');
  var aiBannerBased = document.getElementById('dir-ai-banner-based');
  var hmcBackdrop = document.getElementById('dir-hmc-backdrop');
  var hmcMessagesEl = document.getElementById('dir-hmc-messages');
  var hmcForm = document.getElementById('dir-hmc-form');
  var hmcInput = document.getElementById('dir-hmc-input');
  var hmcError = document.getElementById('dir-hmc-error');
  var hmcCloseBtn = document.getElementById('dir-hmc-close');
  var hmcRefineBtn = document.getElementById('dir-ai-refine');
  var hmcClearBtn = document.getElementById('dir-ai-clear');
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
  var lastFilterSig = null;
  var lastSearchLogged = '';

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
    var m = q.toLowerCase().match(/[a-z0-9]{2,}/g) || [];
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
    if (clearAllBtn) clearAllBtn.hidden = !any && !(input && input.value.trim()) && !resultEntryIds;
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
    var shownIds = [];

    rows.forEach(function (row) {
      var terms = rowTermIds(row);
      var categoryMatch = Object.keys(active).every(function (catId) {
        var selected = active[catId];
        if (!selected || !selected.length) return true;
        return terms.some(function (t) { return selected.indexOf(t) !== -1; });
      });
      var searchMatch = true;
      var order = 0;
      var entryId = row.getAttribute('data-entry-id');
      if (resultEntryIds) {
        var aiIdx = resultEntryIds.indexOf(entryId);
        searchMatch = aiIdx !== -1;
        order = aiIdx === -1 ? 0 : aiIdx;
      } else if (toks.length) {
        var hay = (row.getAttribute('data-search') || '');
        var score = 0;
        toks.forEach(function (t) { if (hay.indexOf(t) !== -1) score++; });
        searchMatch = score > 0;
        order = -score;
      }
      var match = searchMatch && categoryMatch;
      row.style.display = match ? '' : 'none';
      row.style.order = match ? String(order) : '';
      var whyEl = row.querySelector('.dir-row__why');
      if (whyEl) {
        var reason = match && resultEntryIds && aiReasons[entryId] ? aiReasons[entryId] : '';
        if (reason) {
          whyEl.hidden = false;
          whyEl.innerHTML = '<strong>Why this might suit you</strong>' + escapeWhy(reason);
        } else {
          whyEl.hidden = true;
          whyEl.textContent = '';
        }
      }
      if (match) {
        shown++;
        shownIds.push(entryId);
      }
    });

    if (countEl) {
      var line;
      if (resultEntryIds) {
        line = shown + (shown === 1 ? ' entry may be relevant to you' : ' entries may be relevant to you');
      } else if (q) {
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
    if (toolbarHelpBtn) toolbarHelpBtn.hidden = !AI_SEARCH_ENABLED || !!resultEntryIds || shown === 0;

    if (aiBanner) {
      aiBanner.hidden = !resultEntryIds;
      if (resultEntryIds && aiBannerCount) {
        aiBannerCount.textContent = shown + (shown === 1 ? ' entry may be relevant to you' : ' entries may be relevant to you');
      }
      if (aiBannerBased) {
        if (aiBasedOn.length) {
          aiBannerBased.hidden = false;
          aiBannerBased.textContent = 'Based on: ' + aiBasedOn.join(' · ');
        } else {
          aiBannerBased.hidden = true;
          aiBannerBased.textContent = '';
        }
      }
    }

    renderChips();
    syncUrl();
    ${hasMap ? "postToMap(shownIds);" : ""}
    var filterSig = JSON.stringify(active);
    if (lastFilterSig !== null && filterSig !== lastFilterSig && window.dmRecordEngagement) {
      window.dmRecordEngagement('directory_filter', { meta: { filter: active } });
    }
    lastFilterSig = filterSig;
  }

  function escapeWhy(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function matchingIdsIgnoringAi() {
    var q = input ? input.value.trim() : '';
    var toks = tokens(q);
    var ids = [];
    rows.forEach(function (row) {
      var terms = rowTermIds(row);
      var categoryMatch = Object.keys(active).every(function (catId) {
        var selected = active[catId];
        if (!selected || !selected.length) return true;
        return terms.some(function (t) { return selected.indexOf(t) !== -1; });
      });
      var searchMatch = true;
      if (toks.length) {
        var hay = (row.getAttribute('data-search') || '');
        var score = 0;
        toks.forEach(function (t) { if (hay.indexOf(t) !== -1) score++; });
        searchMatch = score > 0;
      }
      if (searchMatch && categoryMatch) ids.push(row.getAttribute('data-entry-id'));
    });
    return ids;
  }

  ${hasMap ? `
  function postToMap(shownIds) {
    if (!mapFrame || !mapFrame.contentWindow) return;
    mapFrame.contentWindow.postMessage({ type: 'directory-filter-change', activeFilters: active, visibleEntryIds: shownIds || [] }, '*');
  }
  ` : ""}

  function persistHmc() {
    if (!hmcStorageKey || !window.sessionStorage) return;
    try {
      sessionStorage.setItem(hmcStorageKey, JSON.stringify({
        messages: aiMessages,
        resultEntryIds: resultEntryIds,
        reasons: aiReasons,
        basedOn: aiBasedOn,
        candidateIds: aiCandidateIds
      }));
    } catch (err) {}
  }
  function restoreHmc() {
    if (!hmcStorageKey || !window.sessionStorage) return;
    try {
      var raw = sessionStorage.getItem(hmcStorageKey);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data && Array.isArray(data.messages)) aiMessages = data.messages;
      if (data && Array.isArray(data.resultEntryIds)) resultEntryIds = data.resultEntryIds;
      if (data && data.reasons && typeof data.reasons === 'object') aiReasons = data.reasons;
      if (data && Array.isArray(data.basedOn)) aiBasedOn = data.basedOn;
      if (data && Array.isArray(data.candidateIds)) aiCandidateIds = data.candidateIds;
    } catch (err) {}
  }
  function renderHmcMessages() {
    if (!hmcMessagesEl) return;
    hmcMessagesEl.innerHTML = '';
    function add(role, text) {
      var el = document.createElement('div');
      el.className = 'dir-hmc-msg dir-hmc-msg--' + role;
      el.textContent = text;
      hmcMessagesEl.appendChild(el);
    }
    if (!aiMessages.length) add('assistant', HMC_OPENING);
    aiMessages.forEach(function (m) { add(m.role, m.content); });
    hmcMessagesEl.scrollTop = hmcMessagesEl.scrollHeight;
  }
  function setHmcError(msg) {
    if (!hmcError) return;
    if (!msg) { hmcError.hidden = true; hmcError.textContent = ''; return; }
    hmcError.hidden = false;
    hmcError.textContent = msg;
  }
  function openHmc() {
    if (!AI_SEARCH_ENABLED || !hmcBackdrop) return;
    hmcBackdrop.classList.add('dir-hmc-backdrop--open');
    document.body.style.overflow = 'hidden';
    renderHmcMessages();
    setHmcError('');
    if (hmcInput) hmcInput.focus();
  }
  function closeHmc() {
    if (!hmcBackdrop) return;
    hmcBackdrop.classList.remove('dir-hmc-backdrop--open');
    document.body.style.overflow = '';
  }
  function startHelpMeChoose() {
    if (!AI_SEARCH_ENABLED) return;
    var q = input ? input.value.trim() : '';
    if (!aiMessages.length && !resultEntryIds) {
      var ids = matchingIdsIgnoringAi();
      aiCandidateIds = ids.length === totalCount ? null : ids;
      if (q) {
        aiMessages = [{ role: 'user', content: q.slice(0, 2000) }];
        openHmc();
        runHelpMeChooseTurn();
        return;
      }
    }
    openHmc();
  }
  function clearAiState() {
    resultEntryIds = null;
    aiReasons = {};
    aiBasedOn = [];
    aiMessages = [];
    aiCandidateIds = null;
    aiSearchToken++;
    if (hmcStorageKey && window.sessionStorage) {
      try { sessionStorage.removeItem(hmcStorageKey); } catch (err) {}
    }
    closeHmc();
    apply();
  }
  function runHelpMeChooseTurn() {
    if (!AI_SEARCH_URL || !aiMessages.length) return;
    var token = ++aiSearchToken;
    setHmcError('');
    var hasAbort = typeof AbortController !== 'undefined';
    var controller = hasAbort ? new AbortController() : null;
    var timeoutId = controller ? setTimeout(function () { controller.abort(); }, 15000) : null;
    var payload = {
      directory_id: AI_SEARCH_DIRECTORY_ID,
      messages: aiMessages
    };
    if (aiCandidateIds) payload.candidate_entry_ids = aiCandidateIds;
    fetch(AI_SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': AI_SEARCH_ANON_KEY, 'Authorization': 'Bearer ' + AI_SEARCH_ANON_KEY },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) {
        if (timeoutId) clearTimeout(timeoutId);
        if (!res.ok) throw new Error('directory_ai_search returned ' + res.status);
        return res.json();
      })
      .then(function (body) {
        if (token !== aiSearchToken) return;
        if (!body || body.disabled) throw new Error('Help me choose is not available right now.');
        if (body.follow_up && body.follow_up.question) {
          aiMessages.push({ role: 'assistant', content: body.follow_up.question });
          persistHmc();
          renderHmcMessages();
          return;
        }
        if (!Array.isArray(body.entry_ids)) throw new Error('Unexpected Help me choose response.');
        resultEntryIds = body.entry_ids;
        aiReasons = body.reasons && typeof body.reasons === 'object' ? body.reasons : {};
        aiBasedOn = Array.isArray(body.based_on) ? body.based_on : [];
        persistHmc();
        renderHmcMessages();
        apply();
        closeHmc();
      })
      .catch(function () {
        if (timeoutId) clearTimeout(timeoutId);
        if (token !== aiSearchToken) return;
        setHmcError('Something went wrong. Your current results are unchanged — try again.');
        renderHmcMessages();
      });
  }

  var searchLogTimer = null;
  function emitDirectorySearch(q) {
    q = (q || '').trim().slice(0, 500);
    if (q.length < 2 || q === lastSearchLogged || !window.dmRecordEngagement) return;
    lastSearchLogged = q;
    window.dmRecordEngagement('directory_search', { meta: { query: q } });
  }
  function scheduleSearch(immediate) {
    var q = input ? input.value.trim() : '';
    if (resultEntryIds) {
      resultEntryIds = null;
      aiReasons = {};
      aiBasedOn = [];
      persistHmc();
    }
    if (immediate) emitDirectorySearch(q);
    apply();
    if (searchLogTimer) { clearTimeout(searchLogTimer); searchLogTimer = null; }
    if (!immediate && q.length >= 2) {
      searchLogTimer = setTimeout(function () { emitDirectorySearch(input ? input.value.trim() : ''); }, 400);
    }
  }

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
    if (e.key === 'Escape' && hmcBackdrop && hmcBackdrop.classList.contains('dir-hmc-backdrop--open')) closeHmc();
  });

  if (form && input) {
    form.addEventListener('submit', function (e) { e.preventDefault(); scheduleSearch(true); });
    input.addEventListener('input', function () { scheduleSearch(false); });
  }
  document.querySelectorAll('[data-hmc-open]').forEach(function (btn) {
    btn.addEventListener('click', function () { startHelpMeChoose(); });
  });
  if (hmcCloseBtn) hmcCloseBtn.addEventListener('click', closeHmc);
  if (hmcBackdrop) hmcBackdrop.addEventListener('click', function (e) {
    if (e.target === hmcBackdrop) closeHmc();
  });
  if (hmcRefineBtn) hmcRefineBtn.addEventListener('click', function () { openHmc(); });
  if (hmcClearBtn) hmcClearBtn.addEventListener('click', clearAiState);
  if (hmcForm) {
    hmcForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = hmcInput ? hmcInput.value.trim() : '';
      if (!text) return;
      aiMessages.push({ role: 'user', content: text.slice(0, 2000) });
      if (hmcInput) hmcInput.value = '';
      persistHmc();
      renderHmcMessages();
      runHelpMeChooseTurn();
    });
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
    clearAiState();
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

  restoreHmc();
  apply();
  if (mapFrame) mapFrame.addEventListener('load', function () { apply(); });
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
  aiSearch?: AiSearchOptions | null;
  nav?: SiteNav | null;
  analytics?: SiteAnalytics | null;
}): string {
  const { clientSlug, directorySlug, directoryName, directoryDescription, entries, directoryLinks, theme, attachedMapEmbedSrc, categorisations, entryTermIds, seoTitle, seoDescription, seoImageUrl, seoNoindex, aiSearch, nav, analytics } = opts;
  const canonicalUrl = `${SITE_ORIGIN}/directories/${clientSlug}/${directorySlug}`;
  const landingUrl = `/directories/${clientSlug}/${directorySlug}`;
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

      const searchHaystack = buildSearchHaystack(e, terms.map((t) => t.label));
      const searchText = escapeAttr(searchHaystack);
      const termIdsAttr = escapeAttr(termIds.join(","));
      const panelImageUrl = e.panel_image_url || e.logo_url;
      const logo = panelImageUrl
        ? `<img src="${escapeAttr(panelImageUrl)}" alt="${escapeAttr(e.name)} logo" loading="lazy">`
        : "";
      const panelBoxStyle = e.panel_background_color ? ` style="background:${escapeAttr(e.panel_background_color)};"` : "";
      const entryUrl = `/directories/${clientSlug}/${directorySlug}/${e.slug}`;
      const metaHtml = location || asideTerm
        ? `<div class="dir-row__meta">${location ? `<span>${escapeHtml(location)}</span>` : ""}${asideTerm ? `<strong>${escapeHtml(asideTerm.label)}</strong>` : ""}</div>`
        : "";

      return `<a class="dir-row" href="${escapeAttr(entryUrl)}" data-entry-id="${escapeAttr(e.id)}" data-search="${searchText}" data-term-ids="${termIdsAttr}">
  <div class="dir-row__logo"${panelBoxStyle}>${logo}</div>
  <div class="dir-row__body">
    <h3>${escapeHtml(e.name)}</h3>
    ${e.meta_description ? `<p class="dir-row__desc">${escapeHtml(e.meta_description)}</p>` : ""}
    ${metaHtml}
    ${tagLabels.length ? `<div class="dir-row__tags">${tagLabels.map((l) => `<span class="tag">${escapeHtml(l)}</span>`).join("")}</div>` : ""}
    <p class="dir-row__why" hidden></p>
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

  // Renders permanently alongside dir-results-col on desktop (side by side
  // inside .dir-content-row, see LAYOUT_STYLE); dir-pane-hidden only takes
  // effect below the 900px breakpoint, where the List/Map toggle applies.
  const mapPane = hasMap
    ? `<div id="dir-map-pane" class="dir-map-pane dir-pane-hidden">
    <span class="chip dir-map-count" id="dir-map-count"></span>
    <div id="dir-map-embed"><iframe src="${escapeAttr(mapEmbedSrcWithFlag!)}" loading="lazy" title="${escapeAttr(directoryName)} map" style="width:100%;height:640px;border:0;border-radius:18px;overflow:hidden;"></iframe></div>
  </div>`
    : "";

  const body = `
${siteHeader({ directoryName, tagline: null, homeUrl: landingUrl, logoUrl: theme.logoUrl, headerMode: theme.headerMode, showHeaderTitle: theme.showHeaderTitle, siteTitle: theme.siteTitle, logoMaxHeight: theme.logoMaxHeight, nav: nav ?? null })}
<div class="dir-home-intro">
  <div class="wrap" style="padding-top:56px;padding-bottom:56px;text-align:center;">
    <div class="eyebrow" style="margin-bottom:14px;">${visibleEntries.length} entr${visibleEntries.length === 1 ? "y" : "ies"}</div>
    <h1 style="font-size:calc(var(--fs-h1) * 1.1);line-height:1.08;max-width:760px;margin:0 auto 16px;">${escapeHtml(directoryName)}</h1>
    ${directoryDescription ? `<p class="muted" style="font-size:18px;max-width:600px;margin:0 auto 28px;">${escapeHtml(directoryDescription)}</p>` : ""}
    <form id="dir-search-form" class="dir-search-form">
      <input id="dir-search-input" type="text" placeholder="Search by name, acronym, profession, industry, interest or keyword…" autocomplete="off">
      <button type="submit" class="btn btn-primary">Search</button>
      ${aiSearch?.enabled ? `<button type="button" class="btn btn-ghost dir-hmc-btn" data-hmc-open>Help me choose</button>` : ""}
    </form>
  </div>
</div>
<div class="wrap" style="padding-top:40px;padding-bottom:20px;">
  <div class="dir-toolbar">
    <div class="dir-toolbar__left">
      <h2 class="dir-count" id="dir-result-count">${visibleEntries.length}${visibleEntries.length === 1 ? " entry" : " entries"}</h2>
      ${aiSearch?.enabled ? `<button type="button" class="dir-clear-all" id="dir-toolbar-hmc" data-hmc-open hidden>Help me choose</button>` : ""}
      <div id="dir-active-chips"></div>
      <button type="button" class="dir-clear-all" id="dir-clear-all" hidden>Clear all</button>
    </div>
    ${filtersTrigger}
    ${viewToggle}
  </div>
  ${aiSearch?.enabled ? `<div id="dir-ai-banner" class="dir-ai-banner" hidden>
    <strong id="dir-ai-banner-count"></strong>
    <span class="dir-ai-banner__based" id="dir-ai-banner-based" hidden></span>
    <div class="dir-ai-banner__actions">
      <button type="button" id="dir-ai-refine">Refine with AI</button>
      <button type="button" id="dir-ai-clear">Clear</button>
    </div>
  </div>` : ""}
  ${linkTiles(directoryLinks)}
  <div class="dir-body">
    ${rail}
    <div class="dir-rail-backdrop" id="dir-rail-backdrop"></div>
    <div class="dir-content-row">
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
</div>
${siteFooter({ directoryName, homeUrl: landingUrl, nav: nav ?? null })}
${aiSearch?.enabled ? `<div id="dir-hmc-backdrop" class="dir-hmc-backdrop">
  <div class="dir-hmc-dialog" role="dialog" aria-modal="true" aria-labelledby="dir-hmc-title">
    <header>
      <h2 id="dir-hmc-title">Help me choose</h2>
      <button type="button" class="btn btn-ghost" id="dir-hmc-close">Close</button>
    </header>
    <div class="dir-hmc-messages" id="dir-hmc-messages"></div>
    <p class="dir-hmc-error" id="dir-hmc-error" hidden></p>
    <form class="dir-hmc-form" id="dir-hmc-form">
      <textarea id="dir-hmc-input" rows="2" placeholder="Describe what you’d like help with…"></textarea>
      <button type="submit" class="btn btn-primary">Send</button>
    </form>
  </div>
</div>` : ""}
${buildFilterAndSearchScript(hasMap, categorisations, aiSearch ?? null)}
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
    analytics: analytics ? { ...analytics, pageKind: "landing" } : null,
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

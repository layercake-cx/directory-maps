/**
 * Local preview for generate_directory_site's HTML output — no Supabase
 * project, no deploy, no network access needed.
 *
 * Every layout change to this Edge Function (directory browse/entry
 * redesign) can be checked here first: run this script, then open the
 * written .html files directly in a browser. Only once the layout looks
 * right is it worth deploying to staging and generating a real directory's
 * site to confirm against live data.
 *
 * Usage:
 *   deno run --allow-write supabase/functions/generate_directory_site/preview.ts
 *
 * Writes to ./.preview-output/ (gitignored) alongside this file:
 *   index.html                 — the directory landing page
 *   entry-<slug>.html          — one file per fixture entry
 *   page-*.html                — sample content pages (top-level + nested)
 *
 * Fixture data below is loosely adapted from the Claude Design concept's
 * own sample dataset (design_handoff_association_directory's prototype) —
 * shape reference only, not real content.
 */

import {
  buildDirectoryLandingPage,
  buildEntryPage,
  buildContentPage,
  buildSiteNav,
  relatedEntries,
  type Entry,
  type DirectoryTheme,
  type FilterBarCategorisation,
  type CategorisationTerm,
  type BlockDescriptor,
  type ContentPage,
  type SiteAnalytics,
  faviconLinkTags,
  resolvedHeroBanner,
  sanitizeHttpUrl,
  applyAlphaToCssColors,
  themeStyleBlock,
  buildThemeCss,
  siteHeader,
  clampLogoMaxHeight,
} from "./builders.ts";

function term(id: string, categorisation_id: string, label: string, slug: string, sort_order: number): CategorisationTerm {
  return { id, categorisation_id, label, slug, sort_order };
}

const SECTOR_TERMS = {
  communications: term("term-sector-comms", "cat-sector", "Communications", "communications", 0),
  technology: term("term-sector-tech", "cat-sector", "Technology", "technology", 1),
  energy: term("term-sector-energy", "cat-sector", "Energy", "energy", 2),
};

const REGION_TERMS = {
  midlands: term("term-region-midlands", "cat-region", "Midlands", "midlands", 0),
  southWest: term("term-region-sw", "cat-region", "South West", "south_west", 1),
  scotland: term("term-region-scotland", "cat-region", "Scotland", "scotland", 2),
};

const CHARTERED_TERMS = {
  yes: term("term-chartered-yes", "cat-chartered", "Yes", "yes", 0),
};

// One of each field_type, matching what the new filter rail needs to
// render: multi_select (tags), single_select, boolean (a switch, always
// exactly one term).
const CATEGORISATIONS: FilterBarCategorisation[] = [
  { id: "cat-region", key: "region", label: "Region", field_type: "single_select", terms: Object.values(REGION_TERMS) },
  { id: "cat-sector", key: "sector", label: "Sector", field_type: "multi_select", terms: Object.values(SECTOR_TERMS) },
  { id: "cat-chartered", key: "chartered", label: "Awards chartered status", field_type: "boolean", terms: Object.values(CHARTERED_TERMS) },
];

function makeEntry(opts: {
  id: string;
  name: string;
  city: string;
  desc: string;
  logoUrl?: string | null;
  panelBackgroundColor?: string | null;
}): Entry {
  return {
    id: opts.id,
    name: opts.name,
    slug: opts.id,
    directory_group_id: null,
    address: "1 Example Street",
    postcode: "AB1 2CD",
    country: "United Kingdom",
    city: opts.city,
    phone: "020 7946 0000",
    email: "info@example.org",
    website_url: "https://example.org",
    logo_url: opts.logoUrl ?? null,
    // Plain text, not pre-wrapped in <p> — allow_html is false below, so
    // buildEntryPage escapes and wraps this itself. A fixture bug here
    // (double-wrapping) is exactly the kind of thing this preview script
    // exists to catch before it reaches a real directory.
    notes_html: opts.desc,
    allow_html: false,
    lat: 51.5,
    lng: -0.12,
    show_phone: true,
    show_email: true,
    show_website: true,
    show_address: true,
    meta_title: null,
    meta_description: opts.desc,
    keywords: null,
    ai_summary: null,
    noindex: false,
    structured_data_type: null,
    panel_image_url: null,
    panel_background_color: opts.panelBackgroundColor ?? null,
  };
}

// Wide wordmarks so the landing-row logo cell can be checked against
// landscape logos (the reason that cell is 208px on desktop).
const WIDE_LOGO =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="48"><rect width="240" height="48" rx="4" fill="#1d4ed8"/><text x="120" y="31" text-anchor="middle" fill="#fff" font-size="18" font-family="system-ui,sans-serif">WIDE WORDMARK</text></svg>`,
  );

const ENTRIES: Entry[] = [
  makeEntry({ id: "ioic", name: "Institute of Internal Communication", city: "Lichfield", desc: "The professional body for internal communication practitioners, including CIEP-style proofreading and editing support.", logoUrl: WIDE_LOGO, panelBackgroundColor: "#0f172a" }),
  makeEntry({ id: "bcs", name: "BCS, The Chartered Institute for IT", city: "Swindon", desc: "Chartered body for information technology.", logoUrl: WIDE_LOGO, panelBackgroundColor: "#f8fafc" }),
  makeEntry({ id: "scottish-renewables", name: "Scottish Renewables", city: "Glasgow", desc: "Trade body for Scotland's renewable energy industry.", logoUrl: WIDE_LOGO }),
  makeEntry({ id: "riba", name: "Royal Institute of British Architects", city: "London", desc: "Chartered body for architects." }),
];

ENTRIES[0].website_url = "https://www.ciep.uk";
ENTRIES[0].keywords = "CIEP, proofreading, editing";
// Rich notes so the local preview shows list/paragraph sizing and heading
// spacing (the published .prose rules). allow_html is false on makeEntry().
ENTRIES[0].allow_html = true;
ENTRIES[0].notes_html = [
  "<p>The professional body for internal communication practitioners.</p>",
  "<h2>Who it is for</h2>",
  "<p>Members include in-house teams and independent consultants.</p>",
  "<ul><li><p>In-house communication teams</p></li><li><p>Independent consultants</p></li><li><p>Agencies</p></li></ul>",
  "<h3>What you get</h3>",
  "<ol><li><p>Events and training</p></li><li><p>A member directory</p></li></ol>",
  "<h4>Also included</h4>",
  "<p>A short note under a smaller heading, so the gap under h4 can be checked.</p>",
].join("");

const ENTRY_TERM_IDS = new Map<string, string[]>([
  ["ioic", [SECTOR_TERMS.communications.id, REGION_TERMS.midlands.id, CHARTERED_TERMS.yes.id]],
  ["bcs", [SECTOR_TERMS.technology.id, REGION_TERMS.southWest.id, CHARTERED_TERMS.yes.id]],
  ["scottish-renewables", [SECTOR_TERMS.energy.id, REGION_TERMS.scotland.id]],
  ["riba", [SECTOR_TERMS.communications.id, CHARTERED_TERMS.yes.id]],
]);

const ENTRY_TERM_IDS_BY_ENTRY = new Map<string, Set<string>>(
  [...ENTRY_TERM_IDS.entries()].map(([id, ids]) => [id, new Set(ids)]),
);

// A couple of blocks carry a section label to exercise the sticky
// jump-chip bar (Phase 3) — most directories won't label every block.
const ENTRY_LAYOUT: BlockDescriptor[] = [
  { type: "hero" },
  { type: "notes_html", label: "Overview" },
  { type: "evidence", label: "Evidence" },
  { type: "accreditations", label: "Accreditations" },
  { type: "gallery" },
  { type: "product_tiles" },
  { type: "links" },
];

// Empty object = the "Natural" preset defaults (NATURAL_DEFAULTS in
// builders.ts) — swap in real hex/font values here to preview a different
// preset (MIDNIGHT/COASTAL/HERITAGE/SLATE, src/lib/directoryThemePresets.js).
const THEME: DirectoryTheme = {};

const PREVIEW_PAGES: ContentPage[] = [
  {
    id: "page-about",
    parent_page_id: null,
    title: "About this directory",
    slug: "about",
    position: 0,
    nav_label: "About",
    show_in_navigation: true,
    is_active: true,
    body_html: "<p>A preview About page so the header, footer, and breadcrumb can be checked locally.</p><h2>How it works</h2><p>Paragraphs and lists should be the same size.</p><ul><li><p>First point</p></li><li><p>Second point</p></li></ul>",
    meta_title: null,
    meta_description: null,
    noindex: false,
  },
  {
    id: "page-membership",
    parent_page_id: null,
    title: "Membership",
    slug: "membership",
    position: 1,
    nav_label: null,
    show_in_navigation: true,
    is_active: true,
    body_html: "<p>Membership landing page. Child pages appear in the dropdown and in On this topic.</p>",
    meta_title: null,
    meta_description: null,
    noindex: false,
  },
  {
    id: "page-why-join",
    parent_page_id: "page-membership",
    title: "Why Join an Association?",
    slug: "why-join",
    position: 0,
    nav_label: "Why Join?",
    show_in_navigation: true,
    is_active: true,
    body_html: "<p>A nested child page — URL is membership/why-join, breadcrumb is Home &gt; Membership &gt; Why Join?</p>",
    meta_title: null,
    meta_description: null,
    noindex: false,
  },
  {
    id: "page-benefits",
    parent_page_id: "page-membership",
    title: "Membership Benefits",
    slug: "benefits",
    position: 1,
    nav_label: null,
    show_in_navigation: true,
    is_active: true,
    body_html: "<p>Second child under Membership.</p>",
    meta_title: null,
    meta_description: null,
    noindex: false,
  },
];

const PREVIEW_NAV = buildSiteNav({
  clientSlug: "preview-client",
  directorySlug: "preview-directory",
  homeNavLabel: "Home",
  pages: PREVIEW_PAGES,
});
const PREVIEW_PAGES_BY_ID = new Map(PREVIEW_PAGES.map((p) => [p.id, p]));

const PREVIEW_ANALYTICS: SiteAnalytics = {
  directoryId: "preview-directory-id",
  supabaseUrl: "https://example.supabase.co",
  supabaseAnonKey: "preview-anon-key",
  destinations: [
    { provider: "ga4", enabled: true, measurement_id: "G-PREVIEW12" },
  ],
};

const outDir = new URL("./.preview-output/", import.meta.url);
await Deno.mkdir(outDir, { recursive: true });
const previewCssHref = "/directories/preview-client/preview-directory/theme.css";
function useLocalCss(html: string, file: string): string {
  return html.replaceAll(`href="${previewCssHref}"`, `href="${file}"`);
}

const landingHtml = buildDirectoryLandingPage({
  clientSlug: "preview-client",
  directorySlug: "preview-directory",
  directoryName: "UK Associations (preview)",
  directoryDescription: "A local preview directory — not real data.",
  entries: ENTRIES,
  directoryLinks: [],
  theme: THEME,
  // A real value here just needs to be *a* URL for the layout to render
  // the List/Map toggle and iframe — the preview never actually loads it
  // (no network in this script), so an example.com placeholder is fine.
  attachedMapEmbedSrc: "https://example.com/preview-client/preview-map",
  categorisations: CATEGORISATIONS,
  entryTermIds: ENTRY_TERM_IDS,
  nav: PREVIEW_NAV,
  analytics: PREVIEW_ANALYTICS,
  aiSearch: {
    directoryId: "preview-directory-id",
    enabled: true,
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "preview-anon-key",
  },
});
await Deno.writeTextFile(new URL("./theme.css", outDir), buildThemeCss(THEME));
await Deno.writeTextFile(new URL("./index.html", outDir), useLocalCss(landingHtml, "theme.css"));

const BANNER_THEME: DirectoryTheme = {
  heroBannerUrl: "https://cdn.example.com/dir/hero-banner.jpg?v=1",
  heroBannerHeight: 520,
  backgroundColor: "#FAF6EE",
};
const landingWithBanner = buildDirectoryLandingPage({
  clientSlug: "preview-client",
  directorySlug: "preview-directory",
  directoryName: "UK Associations (preview)",
  directoryDescription: "A local preview directory — not real data.",
  entries: ENTRIES,
  directoryLinks: [],
  theme: BANNER_THEME,
  attachedMapEmbedSrc: "https://example.com/preview-client/preview-map",
  categorisations: CATEGORISATIONS,
  entryTermIds: ENTRY_TERM_IDS,
  nav: PREVIEW_NAV,
  analytics: PREVIEW_ANALYTICS,
});
await Deno.writeTextFile(new URL("./theme-banner.css", outDir), buildThemeCss(BANNER_THEME));
await Deno.writeTextFile(new URL("./index-hero-banner.html", outDir), useLocalCss(landingWithBanner, "theme-banner.css"));

for (const entry of ENTRIES) {
  const html = buildEntryPage({
    clientSlug: "preview-client",
    directorySlug: "preview-directory",
    directoryName: "UK Associations (preview)",
    entry,
    evidence: [
      { entry_id: entry.id, claim: "Founded", value: "1948", source_url: null, confidence: "High" },
    ],
    media: [],
    accreditations: [],
    links: [],
    tiles: [],
    theme: THEME,
    layout: ENTRY_LAYOUT,
    categorisations: CATEGORISATIONS,
    entryTermIds: [...(ENTRY_TERM_IDS.get(entry.id) ?? [])],
    attachedMapEmbedSrc: "https://example.com/preview-client/preview-map",
    // No key configured in this local script — the Location block still
    // renders (address text + "Open in directory map"), just without the
    // static thumbnail. Pass a real Google Maps key here to preview that.
    staticMapsApiKey: null,
    related: relatedEntries(entry, ENTRIES, ENTRY_TERM_IDS_BY_ENTRY),
    nav: PREVIEW_NAV,
    analytics: PREVIEW_ANALYTICS,
    enquiry: {
      prompt: "Complete the form below and we'll pass your message on.",
      testMode: true,
      directoryId: "preview-directory-id",
      supabaseUrl: "https://example.supabase.co",
      supabaseAnonKey: "preview-anon-key",
    },
  });
  if (!html.includes("Make an Enquiry") || !html.includes("listing_enquiry_open") || !html.includes("dir-enquiry")) {
    throw new Error("entry page should include the Make an Enquiry drawer");
  }
  await Deno.writeTextFile(new URL(`./entry-${entry.slug}.html`, outDir), useLocalCss(html, "theme.css"));
}

for (const page of PREVIEW_PAGES) {
  const html = buildContentPage({
    clientSlug: "preview-client",
    directorySlug: "preview-directory",
    directoryName: "UK Associations (preview)",
    page,
    parentPage: page.parent_page_id ? PREVIEW_PAGES_BY_ID.get(page.parent_page_id) ?? null : null,
    childPages: PREVIEW_PAGES.filter((p) => p.parent_page_id === page.id),
    pagesById: PREVIEW_PAGES_BY_ID,
    theme: THEME,
    nav: PREVIEW_NAV,
    analytics: PREVIEW_ANALYTICS,
  });
  const filename = page.parent_page_id ? `page-${page.parent_page_id}-${page.slug}.html` : `page-${page.slug}.html`;
  await Deno.writeTextFile(new URL(`./${filename}`, outDir), useLocalCss(html, "theme.css"));
}

console.log(`Wrote ${2 + ENTRIES.length + PREVIEW_PAGES.length} file(s) to ${outDir.pathname}`);
console.log(`Open ${outDir.pathname}index.html in a browser to preview the landing page.`);

const iconTags = faviconLinkTags({ faviconUrl: "https://cdn.example.com/dir/favicon.png?v=1" });
if (!iconTags.includes('rel="icon"') || !iconTags.includes("https://cdn.example.com/dir/favicon.png?v=1")) {
  throw new Error("faviconLinkTags should emit icon links for an https URL");
}
if (faviconLinkTags({ faviconUrl: "javascript:alert(1)" })) {
  throw new Error("faviconLinkTags must reject non-http(s) URLs");
}
if (faviconLinkTags({}) || faviconLinkTags({ faviconUrl: "" })) {
  throw new Error("faviconLinkTags should omit tags when unset");
}
if (landingHtml.includes('rel="icon"')) {
  throw new Error("preview THEME has no favicon — landing HTML must not emit a rel=icon tag");
}
if (!landingHtml.includes(`href="${previewCssHref}"`)) {
  throw new Error("landing HTML must link the shared theme.css");
}
if (!landingHtml.includes('class="dir-page-banner"')) {
  throw new Error("landing HTML always includes the banner wrapper; theme.css shows or hides it");
}
if (landingHtml.includes("cdn.example.com/dir/hero-banner.jpg")) {
  throw new Error("hero banner URL belongs in theme.css, not the page HTML");
}
if (!sanitizeHttpUrl("https://cdn.example.com/a.png") || sanitizeHttpUrl("javascript:alert(1)") || sanitizeHttpUrl("")) {
  throw new Error("sanitizeHttpUrl should accept http(s) only");
}
if (resolvedHeroBanner({}) || resolvedHeroBanner({ heroBannerUrl: "javascript:alert(1)" })) {
  throw new Error("resolvedHeroBanner must reject missing/non-http URLs");
}
const banner = resolvedHeroBanner(BANNER_THEME);
if (!banner || banner.height !== 520 || !banner.url.includes("hero-banner.jpg")) {
  throw new Error("resolvedHeroBanner should keep a valid https URL and height");
}
if (!landingWithBanner.includes('class="dir-page-banner"')) {
  throw new Error("landing with a hero banner must emit banner markup");
}
const bannerCss = buildThemeCss(BANNER_THEME);
if (!bannerCss.includes("cdn.example.com/dir/hero-banner.jpg")) {
  throw new Error("hero banner CSS must include the sanitised image URL");
}
if (!bannerCss.includes("--hero-banner-display: block")) {
  throw new Error("a hero banner must turn the shared banner wrapper on");
}
if (!landingWithBanner.includes("dir-home-intro")) {
  throw new Error("homepage intro band should keep dir-home-intro for the transparent-when-banner CSS");
}
if (!bannerCss.includes("calc(var(--hero-banner-height, 480px) + 100px)")) {
  throw new Error("hero banner must extend 100px past the configured height");
}
if (applyAlphaToCssColors("#112233", 0.6) !== "rgba(17, 34, 51, 0.6)") {
  throw new Error("applyAlphaToCssColors should turn hex into rgba at the given alpha");
}
if (!applyAlphaToCssColors("linear-gradient(135deg, #FFFFFF 0%, #000000 100%)", 0.6).includes("rgba(255, 255, 255, 0.6)")) {
  throw new Error("applyAlphaToCssColors should rewrite gradient stops");
}
const fadedHeaderCss = themeStyleBlock({
  heroBannerUrl: "https://cdn.example.com/dir/hero-banner.jpg",
  headerBackground: { type: "solid", color: "#112233" },
});
if (!fadedHeaderCss.includes("rgba(17, 34, 51, 0.6)")) {
  throw new Error("a hero banner must render the header colour at 40% transparency");
}
const opaqueHeaderCss = themeStyleBlock({ headerBackground: { type: "solid", color: "#112233" } });
if (opaqueHeaderCss.includes("rgba(17, 34, 51, 0.6)") || !opaqueHeaderCss.includes("#112233")) {
  throw new Error("without a hero banner the header colour must stay fully opaque");
}
if (clampLogoMaxHeight(undefined) !== 84) {
  throw new Error("unset logo height should default to 84px (twice the original 42)");
}
if (clampLogoMaxHeight(42) !== 42) {
  throw new Error("an explicitly saved 42px logo height must not be rewritten");
}
if (clampLogoMaxHeight(180) !== 180 || clampLogoMaxHeight(9999) !== 240 || clampLogoMaxHeight(10) !== 24) {
  throw new Error("logo height must clamp to 24–240px");
}
const tallLogoCss = themeStyleBlock({ logoUrl: "https://cdn.example.com/logo.png", logoMaxHeight: 168 });
if (!tallLogoCss.includes("--logo-max-height: 168px") || !tallLogoCss.includes("cdn.example.com/logo.png")) {
  throw new Error("logo height and image URL belong in theme.css");
}
const tallLogo = siteHeader({
  directoryName: "Test",
  tagline: null,
  homeUrl: "/",
  logoUrl: "https://cdn.example.com/logo.png",
  logoMaxHeight: 168,
});
if (!tallLogo.includes("dir-brand__mark") || tallLogo.includes("cdn.example.com/logo.png") || tallLogo.includes("height:168px")) {
  throw new Error("header markup must not inline the logo URL or height");
}

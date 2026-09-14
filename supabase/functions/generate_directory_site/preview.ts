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
 *
 * Fixture data below is loosely adapted from the Claude Design concept's
 * own sample dataset (design_handoff_association_directory's prototype) —
 * shape reference only, not real content.
 */

import {
  buildDirectoryLandingPage,
  buildEntryPage,
  relatedEntries,
  type Entry,
  type DirectoryTheme,
  type FilterBarCategorisation,
  type CategorisationTerm,
  type BlockDescriptor,
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
    logo_url: null,
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
    noindex: false,
    structured_data_type: null,
    panel_image_url: null,
    panel_background_color: null,
  };
}

const ENTRIES: Entry[] = [
  makeEntry({ id: "ioic", name: "Institute of Internal Communication", city: "Lichfield", desc: "The professional body for internal communication practitioners." }),
  makeEntry({ id: "bcs", name: "BCS, The Chartered Institute for IT", city: "Swindon", desc: "Chartered body for information technology." }),
  makeEntry({ id: "scottish-renewables", name: "Scottish Renewables", city: "Glasgow", desc: "Trade body for Scotland's renewable energy industry." }),
  makeEntry({ id: "riba", name: "Royal Institute of British Architects", city: "London", desc: "Chartered body for architects." }),
];

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

const outDir = new URL("./.preview-output/", import.meta.url);
await Deno.mkdir(outDir, { recursive: true });

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
});
await Deno.writeTextFile(new URL("./index.html", outDir), landingHtml);

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
  });
  await Deno.writeTextFile(new URL(`./entry-${entry.slug}.html`, outDir), html);
}

console.log(`Wrote ${1 + ENTRIES.length} file(s) to ${outDir.pathname}`);
console.log(`Open ${outDir.pathname}index.html in a browser to preview the landing page.`);

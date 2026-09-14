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
  IMPLICIT_DEFAULT_LAYOUT,
  type Entry,
  type DirectoryTheme,
  type FilterBarCategorisation,
  type CategorisationTerm,
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

const CATEGORISATIONS: FilterBarCategorisation[] = [
  { id: "cat-sector", key: "sector", label: "Sector", terms: Object.values(SECTOR_TERMS) },
  { id: "cat-region", key: "region", label: "Region", terms: Object.values(REGION_TERMS) },
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
    notes_html: `<p>${opts.desc}</p>`,
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
  ["ioic", [SECTOR_TERMS.communications.id, REGION_TERMS.midlands.id]],
  ["bcs", [SECTOR_TERMS.technology.id, REGION_TERMS.southWest.id]],
  ["scottish-renewables", [SECTOR_TERMS.energy.id, REGION_TERMS.scotland.id]],
  ["riba", [SECTOR_TERMS.communications.id]],
]);

const ENTRY_TERMS_BY_KEY = new Map<string, Map<string, CategorisationTerm[]>>([
  ["ioic", new Map([["sector", [SECTOR_TERMS.communications]], ["region", [REGION_TERMS.midlands]]])],
  ["bcs", new Map([["sector", [SECTOR_TERMS.technology]], ["region", [REGION_TERMS.southWest]]])],
  ["scottish-renewables", new Map([["sector", [SECTOR_TERMS.energy]], ["region", [REGION_TERMS.scotland]]])],
  ["riba", new Map([["sector", [SECTOR_TERMS.communications]]])],
]);

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
  attachedMapEmbedSrc: null,
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
    evidence: [],
    media: [],
    accreditations: [],
    links: [],
    tiles: [],
    theme: THEME,
    layout: IMPLICIT_DEFAULT_LAYOUT,
    entryTerms: ENTRY_TERMS_BY_KEY.get(entry.id) ?? new Map(),
  });
  await Deno.writeTextFile(new URL(`./entry-${entry.slug}.html`, outDir), html);
}

console.log(`Wrote ${1 + ENTRIES.length} file(s) to ${outDir.pathname}`);
console.log(`Open ${outDir.pathname}index.html in a browser to preview the landing page.`);

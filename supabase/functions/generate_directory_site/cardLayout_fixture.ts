// Shared fixture for cardLayout_test.ts: a small directory with location
// search, an attached map, a coloured single_select categorisation, a
// multi_select categorisation and a boolean switch. The list-mode golden
// file (testdata/landing_list_golden.html) was generated from this fixture
// on main *before* the card layout existed, so the test can prove list mode
// is byte-identical. Regenerate it only for a deliberate list-mode change:
//   deno run --allow-read --allow-write supabase/functions/generate_directory_site/cardLayout_fixture.ts
import { buildDirectoryLandingPage, type DirectoryTheme, type Entry, type FilterBarCategorisation } from "./builders.ts";

export const fixtureEntry = (over: Partial<Entry> = {}): Entry => ({
  id: "entry-1", name: "Tolhurst Organic", slug: "tolhurst", directory_group_id: null,
  address: "Hardwick", postcode: null, country: "UK", city: "Oxfordshire", phone: null, email: null, website_url: null, logo_url: null,
  notes_html: null, allow_html: false, lat: 51.5, lng: -1.1, show_phone: true, show_email: true, show_website: true,
  show_address: true, meta_title: null, meta_description: "Organic veg boxes from a stockfree farm.", noindex: null, structured_data_type: null,
  panel_image_url: null, panel_background_color: null, current_claim_id: null, ...over,
});

export const fixtureEntries: Entry[] = [
  fixtureEntry(),
  fixtureEntry({ id: "entry-2", name: "Riverford <Dairy>", slug: "riverford", city: "Devon", address: null, lat: 50.4, lng: -3.7, logo_url: "https://example.com/logo.png", panel_background_color: "#ffffff", meta_description: null }),
  fixtureEntry({ id: "entry-3", name: "Hidden Farm", slug: "hidden", show_address: false, lat: null, lng: null }),
];

export const fixtureCategorisations: FilterBarCategorisation[] = [
  {
    id: "cat-type", key: "produce_type", label: "Produce type", field_type: "single_select",
    terms: [
      { id: "t-veg", categorisation_id: "cat-type", label: "Vegetable boxes", slug: "veg", sort_order: 0, color: "#3E6A2C" },
      { id: "t-dairy", categorisation_id: "cat-type", label: "Dairy", slug: "dairy", sort_order: 1, color: "#C8A03C" },
      { id: "t-other", categorisation_id: "cat-type", label: "Other", slug: "other", sort_order: 2, color: null },
    ],
  },
  {
    id: "cat-cert", key: "certs", label: "Certifications", field_type: "multi_select",
    terms: [
      { id: "t-soil", categorisation_id: "cat-cert", label: "Soil Association", slug: "soil", sort_order: 0, color: "#123456" },
      { id: "t-bad", categorisation_id: "cat-cert", label: "Pasture for Life", slug: "pasture", sort_order: 1, color: "red;background:url(x)" },
    ],
  },
  {
    id: "cat-deliv", key: "delivers", label: "Delivers", field_type: "boolean",
    terms: [{ id: "t-deliv", categorisation_id: "cat-deliv", label: "Yes", slug: "yes", sort_order: 0 }],
  },
  // deno-lint-ignore no-explicit-any
] as any;

export const fixtureTermIds = new Map<string, string[]>([
  ["entry-1", ["t-veg", "t-soil", "t-deliv"]],
  ["entry-2", ["t-dairy", "t-bad"]],
  ["entry-3", ["t-other"]],
]);

export function fixtureLanding(theme: DirectoryTheme = {}, over: Partial<Parameters<typeof buildDirectoryLandingPage>[0]> = {}): string {
  return buildDirectoryLandingPage({
    clientSlug: "c", directorySlug: "d", directoryName: "Proper Produce", directoryDescription: "Good food, near you.",
    entries: fixtureEntries, directoryLinks: [], theme, attachedMapEmbedSrc: "https://maps.example.com/embed/m1",
    categorisations: fixtureCategorisations, entryTermIds: fixtureTermIds,
    locationSearch: { directoryId: "dir-1", supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "anon", region: "gb", places: {} },
    ...over,
  });
}

export const GOLDEN_PATH = new URL("./testdata/landing_list_golden.html", import.meta.url);

if (import.meta.main) {
  await Deno.mkdir(new URL("./testdata/", import.meta.url), { recursive: true });
  await Deno.writeTextFile(GOLDEN_PATH, fixtureLanding());
  console.log("wrote", GOLDEN_PATH.pathname);
}

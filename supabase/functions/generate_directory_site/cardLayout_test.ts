// Card listing layout (docs/DIRECTORY_CARD_LAYOUT_SPEC.md §10). Run:
//   deno test --allow-read supabase/functions/generate_directory_site/cardLayout_test.ts
import { assert, assertEquals, assertFalse, assertStringIncludes } from "jsr:@std/assert@1";
import { CARD_CTA_DEFAULT, ENTRY_TEMPLATE_VERSION, resolveCardSettings, type DirectoryTheme } from "./builders.ts";
import { fixtureCategorisations, fixtureEntry, fixtureLanding, GOLDEN_PATH } from "./cardLayout_fixture.ts";

const golden = Deno.readTextFileSync(GOLDEN_PATH);
const cardsTheme = (over: DirectoryTheme = {}): DirectoryTheme => ({ listingLayout: "cards", ...over });

/** The opening <a …> tag of each entry, keyed by data-entry-id. */
function rowTags(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of html.matchAll(/<a class="dir-row[^"]*"[^>]*>/g)) {
    const id = m[0].match(/data-entry-id="([^"]+)"/)?.[1];
    if (id) out.set(id, m[0]);
  }
  return out;
}

/** The full markup of one entry's card/row. */
function rowHtml(html: string, entryId: string): string {
  const start = html.indexOf(`data-entry-id="${entryId}"`);
  assert(start >= 0, `no row for ${entryId}`);
  return html.slice(start, html.indexOf("</a>", start));
}

const dataAttrs = (tag: string) => tag.replace(/^<a class="[^"]*"/, "").replace(/ style="[^"]*"/, "");

// ---- 1. List mode is untouched ----

Deno.test("listingLayout unset -> landing HTML byte-identical to the pre-card golden", () => {
  assertEquals(fixtureLanding(), golden);
});

Deno.test("listingLayout 'list' or an invalid value -> also byte-identical", () => {
  assertEquals(fixtureLanding({ listingLayout: "list" }), golden);
  // deno-lint-ignore no-explicit-any
  assertEquals(fixtureLanding({ listingLayout: "grid" as any }), golden);
  // Card-only keys alone never change list mode.
  assertEquals(fixtureLanding({ cardColourBy: "certs", cardShowSummary: true, cardCtaLabel: "Go" }), golden);
});

// ---- 2. Card containers and identical data attributes ----

Deno.test("cards -> both containers get dir-rows--cards; rows keep the same data attributes", () => {
  const html = fixtureLanding(cardsTheme());
  assertStringIncludes(html, '<div class="dir-rows dir-rows--cards" id="dir-rows">');
  assertStringIncludes(html, '<div class="dir-rows dir-rows--cards" id="dir-also-rows">');
  const list = rowTags(golden);
  const cards = rowTags(html);
  assertEquals([...cards.keys()], [...list.keys()], "same entries, same order");
  for (const [id, tag] of cards) {
    assert(tag.startsWith('<a class="dir-row dir-row--card"'), tag);
    assertEquals(dataAttrs(tag), dataAttrs(list.get(id)!));
  }
  assertStringIncludes(cards.get("entry-1")!, 'data-lat="51.5" data-lng="-1.1"');
});

Deno.test("cards without location search -> no coords, no miles span", () => {
  const html = fixtureLanding(cardsTheme(), { locationSearch: null });
  assertFalse(html.includes("data-lat="));
  assertFalse(html.includes('class="dir-row__miles"'));
  assertFalse(html.includes('id="dir-also-rows"'));
});

Deno.test("card anatomy: decorative stripe, badge, h3, CTA; why line kept", () => {
  const card = rowHtml(fixtureLanding(cardsTheme()), "entry-1");
  assertStringIncludes(card, '<span class="dir-card__stripe" aria-hidden="true"></span>');
  assertStringIncludes(card, '<span class="badge">Vegetable boxes</span>');
  assertStringIncludes(card, "<h3>Tolhurst Organic</h3>");
  assertStringIncludes(card, '<p class="dir-row__why" hidden></p>');
  assertStringIncludes(card, '<span class="dir-card__cta">View details <span aria-hidden="true">→</span></span>');
  assertFalse(card.includes("aria-label"), "no aria-label override on the card link");
  assertFalse(card.includes("dir-card__logo"), "no logo band without an image");
});

Deno.test("logo band only when the entry has an image; name is escaped", () => {
  const card = rowHtml(fixtureLanding(cardsTheme()), "entry-2");
  assertStringIncludes(card, '<div class="dir-card__logo" style="background:#ffffff;"><img src="https://example.com/logo.png"');
  assertStringIncludes(card, "<h3>Riverford &lt;Dairy&gt;</h3>");
});

// ---- 3. Stripe colour resolution ----

Deno.test("stripe: auto-pick uses the first single_select categorisation with a coloured term", () => {
  const html = fixtureLanding(cardsTheme());
  assertStringIncludes(rowTags(html).get("entry-1")!, 'style="--card-stripe:#3E6A2C"');
  assertStringIncludes(rowTags(html).get("entry-2")!, 'style="--card-stripe:#C8A03C"');
  assertEquals(resolveCardSettings(cardsTheme(), fixtureCategorisations).colourCategorisation?.key, "produce_type");
});

Deno.test("stripe: term without a colour -> no inline variable (falls back to primary), badge still shown", () => {
  const html = fixtureLanding(cardsTheme());
  assertFalse(rowTags(html).get("entry-3")!.includes("--card-stripe"));
  assertStringIncludes(rowHtml(html, "entry-3"), '<span class="badge">Other</span>');
});

Deno.test("stripe: explicit cardColourBy picks that categorisation's colour and badge", () => {
  const html = fixtureLanding(cardsTheme({ cardColourBy: "certs" }));
  assertStringIncludes(rowTags(html).get("entry-1")!, 'style="--card-stripe:#123456"');
  assertStringIncludes(rowHtml(html, "entry-1"), '<span class="badge">Soil Association</span>');
  // Multi-select filter options for the colour categorisation get a dot.
  assertStringIncludes(html, 'data-term-id="t-soil" data-kind="multi_select"><span class="dir-term-dot" style="--dot:#123456" aria-hidden="true"></span><span>Soil Association</span>');
});

Deno.test("stripe: invalid colour string never reaches a style attribute", () => {
  const html = fixtureLanding(cardsTheme({ cardColourBy: "certs" }));
  assertFalse(rowTags(html).get("entry-2")!.includes("--card-stripe"));
  assertFalse(html.includes("url(x)"));
  assertStringIncludes(rowHtml(html, "entry-2"), '<span class="badge">Pasture for Life</span>');
});

Deno.test("stripe: null = no category colours; badge falls back to the first single_select term", () => {
  const html = fixtureLanding(cardsTheme({ cardColourBy: null }));
  for (const tag of rowTags(html).values()) assertFalse(tag.includes("--card-stripe"));
  assertStringIncludes(rowHtml(html, "entry-1"), '<span class="badge">Vegetable boxes</span>');
  assertFalse(html.includes("dir-term-dot"));
  assertFalse(html.includes("TERM_DOTS"));
});

Deno.test("stripe: unknown categorisation key -> primary colour, no dots", () => {
  const html = fixtureLanding(cardsTheme({ cardColourBy: "nope" }));
  for (const tag of rowTags(html).values()) assertFalse(tag.includes("--card-stripe"));
  assertFalse(html.includes("TERM_DOTS"));
});

Deno.test("filter key: active-chip dots are only emitted for valid colours in card mode", () => {
  const html = fixtureLanding(cardsTheme());
  assertStringIncludes(html, 'var TERM_DOTS = {"t-veg":"#3E6A2C","t-dairy":"#C8A03C"};');
  assertStringIncludes(html, "dot.className = 'dir-term-dot';");
});

// ---- 4. CTA label ----

Deno.test("cardCtaLabel: default, escaped, truncated to 30 characters", () => {
  assertEquals(resolveCardSettings(cardsTheme(), []).ctaLabel, CARD_CTA_DEFAULT);
  assertEquals(resolveCardSettings(cardsTheme({ cardCtaLabel: "   " }), []).ctaLabel, CARD_CTA_DEFAULT);
  // deno-lint-ignore no-explicit-any
  assertEquals(resolveCardSettings(cardsTheme({ cardCtaLabel: 42 as any }), []).ctaLabel, CARD_CTA_DEFAULT);
  const long = "View this supplier's full profile and more";
  assertEquals(resolveCardSettings(cardsTheme({ cardCtaLabel: long }), []).ctaLabel, long.slice(0, 30).trim());
  const html = fixtureLanding(cardsTheme({ cardCtaLabel: " <b>View supplier</b> " }));
  assertStringIncludes(html, '<span class="dir-card__cta">&lt;b&gt;View supplier&lt;/b&gt; <span aria-hidden="true">→</span></span>');
  assertFalse(html.includes("<b>View supplier"));
});

// ---- 5. show_address ----

Deno.test("show_address false -> no location line", () => {
  const html = fixtureLanding(cardsTheme());
  assertFalse(rowHtml(html, "entry-3").includes("dir-card__loc"));
  assertStringIncludes(rowHtml(html, "entry-1"), '<span>Hardwick, Oxfordshire, UK</span></p>');
  const hidden = fixtureLanding(cardsTheme(), { entries: [fixtureEntry({ show_address: false })] });
  assertFalse(hidden.includes("dir-card__loc"));
  assertFalse(hidden.includes("Oxfordshire"));
});

// ---- 6. Summary toggle ----

Deno.test("cardShowSummary toggles the summary and tags", () => {
  const off = rowHtml(fixtureLanding(cardsTheme()), "entry-1");
  assertFalse(off.includes("dir-row__desc"));
  assertFalse(off.includes("dir-row__tags"));
  const on = rowHtml(fixtureLanding(cardsTheme({ cardShowSummary: true })), "entry-1");
  assertStringIncludes(on, '<p class="dir-row__desc">Organic veg boxes from a stockfree farm.</p>');
  assertStringIncludes(on, '<div class="dir-row__tags"><span class="tag">Soil Association</span><span class="tag">Delivers</span></div>');
});

Deno.test("template version bumped for the card CSS", () => {
  assert(ENTRY_TEMPLATE_VERSION >= 22);
});

Deno.test("cards without a map -> results column goes full width; with a map it doesn't", () => {
  assertStringIncludes(fixtureLanding(cardsTheme(), { attachedMapEmbedSrc: null }), 'class="dir-results dir-results--full" id="dir-results-col"');
  assertStringIncludes(fixtureLanding(cardsTheme()), 'class="dir-results" id="dir-results-col"');
});

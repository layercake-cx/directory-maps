// Claim banner: show/hide, variable resolution + escaping, settings validation,
// and parity between the publish-side logic (builders.ts) and the admin mirror
// (src/lib/claimBanner.js). Run:
//   deno test --allow-read supabase/functions/generate_directory_site/claimBanner_test.ts
import { assert, assertEquals, assertFalse, assertStringIncludes } from "jsr:@std/assert@1";
import {
  buildClaimBanner,
  buildEntryPage,
  CLAIM_BANNER_DEFAULTS,
  CLAIM_BANNER_LIMITS,
  CLAIM_BANNER_VARIABLES,
  ENTRY_TEMPLATE_VERSION,
  isValidClaimBannerUrl,
  normaliseClaimBanner,
  resolveClaimVars,
  unknownClaimVars,
  type ClaimWidgetOptions,
  type Entry,
} from "./builders.ts";
import * as mirrorModule from "../../../src/lib/claimBanner.js";

// The mirror is untyped JS; widen it so the tests can pass partial objects.
// deno-lint-ignore no-explicit-any
const mirror = mirrorModule as any;

const entry = (over: Partial<Entry> = {}): Entry => ({
  id: "entry-1", name: "Academy of Medical Educators (AoME)", slug: "aome", directory_group_id: null,
  address: null, postcode: null, country: null, city: null, phone: null, email: null, website_url: null, logo_url: null,
  notes_html: null, allow_html: false, lat: null, lng: null, show_phone: true, show_email: true, show_website: true,
  show_address: true, meta_title: null, meta_description: null, noindex: null, structured_data_type: null,
  panel_image_url: null, panel_background_color: null, current_claim_id: null, ...over,
});

const claim = (banner = CLAIM_BANNER_DEFAULTS): ClaimWidgetOptions => ({
  priceCents: null, currency: null, paymentType: null, introHtml: null, supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "anon", banner, mode: "auto", directoryId: "dir-1",
});

function page(c: ClaimWidgetOptions | null, e: Entry = entry()): string {
  // deno-lint-ignore no-explicit-any
  return buildEntryPage({
    clientSlug: "c", directorySlug: "d", directoryName: "Dir", entry: e, evidence: [], media: [], accreditations: [],
    links: [], tiles: [], theme: {}, layout: [], categorisations: [], entryTermIds: [], attachedMapEmbedSrc: null,
    attachedMapFocusedEmbedSrc: null, staticMapsApiKey: null, related: [], claim: c,
    // deno-lint-ignore no-explicit-any
  } as any);
}

// ---- show / hide ----

Deno.test("no claim options -> no banner and no leftover wrapper", () => {
  assertEquals(buildClaimBanner(null, entry()), "");
  const html = page(null);
  assertFalse(html.includes("dir-claim-banner\""));
  assertFalse(html.includes("dir-claim-banner-wrap\""));
  assertFalse(html.includes("Represent this organisation"));
});

Deno.test("claim options -> one banner between hero and body, old sidebar link gone", () => {
  const html = page(claim());
  const hero = html.indexOf("dir-entry-hero");
  const banner = html.indexOf("class=\"dir-claim-banner\"");
  const body = html.indexOf("class=\"wrap dir-entry-body\"");
  assert(hero >= 0 && banner > hero && body > banner, "banner must sit between hero and body");
  assertEquals(html.split("class=\"dir-claim-banner\"").length - 1, 1);
  assertFalse(html.includes("dir-claim-quiet\">"));
  assertFalse(html.includes("Represent this organisation"));
});

Deno.test("banner a11y: labelled section, h2, decorative icon, button opens the existing claim dialog", () => {
  const html = buildClaimBanner(claim(), entry());
  assertStringIncludes(html, '<section class="dir-claim-banner" aria-label="Claim this listing"');
  assertStringIncludes(html, "<h2>Is this your organisation?</h2>");
  assertStringIncludes(html, 'class="dir-claim-banner__icon" aria-hidden="true"');
  assertStringIncludes(html, "data-dm-claim-open");
  assertStringIncludes(html, 'data-dm-event="listing_cta_click" data-dm-cta="claim"');
});

Deno.test("template version was bumped for the new markup", () => {
  assert(ENTRY_TEMPLATE_VERSION >= 11);
});

// ---- secondary link ----

Deno.test("secondary link hidden unless label and URL are both set", () => {
  const only = (over: Partial<typeof CLAIM_BANNER_DEFAULTS>) => buildClaimBanner(claim({ ...CLAIM_BANNER_DEFAULTS, ...over }), entry());
  assertFalse(only({ secondaryLabel: "How claiming works", secondaryUrl: "" }).includes("dir-claim-banner__secondary"));
  assertFalse(only({ secondaryLabel: "", secondaryUrl: "https://example.com/how" }).includes("dir-claim-banner__secondary"));
  const shown = only({ secondaryLabel: "How claiming works", secondaryUrl: "https://example.com/how" });
  assertStringIncludes(shown, 'href="https://example.com/how"');
  assertStringIncludes(shown, "claim_banner_secondary_click");
  assertFalse(only({ secondaryLabel: "x", secondaryUrl: "javascript:alert(1)" }).includes("dir-claim-banner__secondary"));
});

// ---- variables + escaping ----

Deno.test("{{org_name}} resolves, whitespace allowed, unknown variables become empty", () => {
  const vars = { org_name: "AoME" };
  assertEquals(resolveClaimVars("Hi {{org_name}}", vars), "Hi AoME");
  assertEquals(resolveClaimVars("Hi {{ org_name }}!", vars), "Hi AoME!");
  assertEquals(resolveClaimVars("Hi {{foo}}.", vars), "Hi .");
  assertEquals(resolveClaimVars("{{org_short_name}}", vars), "");
  assertEquals(unknownClaimVars("{{org_name}} {{foo}} {{ foo }} {{bar}}"), ["foo", "bar"]);
});

Deno.test("a value containing a placeholder is not expanded again", () => {
  assertEquals(resolveClaimVars("{{org_name}}", { org_name: "{{org_name}}" }), "{{org_name}}");
});

Deno.test("default body renders the listing name", () => {
  assertStringIncludes(buildClaimBanner(claim(), entry()), "update Academy of Medical Educators (AoME)'s details");
});

Deno.test("org names with HTML or ampersands render as literal text", () => {
  const html = buildClaimBanner(claim(), entry({ name: "<script>alert(1)</script> & Co" }));
  assertFalse(html.includes("<script>alert(1)"));
  assertStringIncludes(html, "&lt;script&gt;alert(1)&lt;/script&gt; &amp; Co");
});

Deno.test("admin-entered text is escaped too", () => {
  const b = { ...CLAIM_BANNER_DEFAULTS, heading: "<img src=x onerror=1>", buttonLabel: "A & B" };
  const html = buildClaimBanner(claim(b), entry());
  assertFalse(html.includes("<img src=x"));
  assertStringIncludes(html, "A &amp; B");
});

Deno.test("colours are sanitised before reaching the style attribute", () => {
  const b = { ...CLAIM_BANNER_DEFAULTS, accentColour: "red;} body{display:none" };
  const html = buildClaimBanner(claim(b), entry());
  assertFalse(html.includes("display:none"));
  assertStringIncludes(html, "--cb-accent:#3F4C8A");
});

// ---- normalising a settings row ----

Deno.test("missing row and missing columns fall back to defaults", () => {
  assertEquals(normaliseClaimBanner(null), CLAIM_BANNER_DEFAULTS);
  assertEquals(normaliseClaimBanner({}), CLAIM_BANNER_DEFAULTS);
});

Deno.test("saved values win; invalid ones fall back; limits applied", () => {
  const n = normaliseClaimBanner({
    banner_heading: "  Own it  ", banner_body: "x".repeat(500), banner_accent_colour: "#112233", banner_border_colour: "nope",
    banner_secondary_label: null, banner_secondary_url: "http://insecure.example",
  });
  assertEquals(n.heading, "Own it");
  assertEquals(n.body.length, CLAIM_BANNER_LIMITS.body);
  assertEquals(n.accentColour, "#112233");
  assertEquals(n.borderColour, CLAIM_BANNER_DEFAULTS.borderColour);
  assertEquals(n.secondaryLabel, "");
  assertEquals(n.secondaryUrl, "");
});

Deno.test("URL rule: https or single-slash relative only", () => {
  for (const ok of ["https://example.com/a", "/how-claiming-works"]) assert(isValidClaimBannerUrl(ok), ok);
  for (const bad of ["", "http://example.com", "//evil.com", "javascript:alert(1)", "mailto:a@b.c", "/a b", "ftp://x"]) assertFalse(isValidClaimBannerUrl(bad), bad);
});

// ---- admin validation (mirror) ----

Deno.test("validation: required text only while enabled; limits; hex; url", () => {
  const ok = { ...mirror.CLAIM_BANNER_DEFAULTS };
  assertEquals(mirror.validateClaimBanner(ok).errors, {});
  const blank = { ...ok, heading: "", body: "", buttonLabel: "" };
  assertEquals(Object.keys(mirror.validateClaimBanner(blank, { enabled: true }).errors).sort(), ["body", "buttonLabel", "heading"]);
  assertEquals(mirror.validateClaimBanner(blank, { enabled: false }).errors, {});
  assert(mirror.validateClaimBanner({ ...ok, heading: "x".repeat(81) }).errors.heading);
  assert(mirror.validateClaimBanner({ ...ok, body: "x".repeat(241) }).errors.body);
  assert(mirror.validateClaimBanner({ ...ok, buttonLabel: "x".repeat(31) }).errors.buttonLabel);
  assert(mirror.validateClaimBanner({ ...ok, secondaryLabel: "x".repeat(31) }).errors.secondaryLabel);
  assert(mirror.validateClaimBanner({ ...ok, accentColour: "blue" }).errors.accentColour);
  assert(mirror.validateClaimBanner({ ...ok, secondaryUrl: "http://x.com" }).errors.secondaryUrl);
  assertEquals(mirror.validateClaimBanner({ ...ok, secondaryUrl: "" }).errors.secondaryUrl, undefined);
});

Deno.test("validation: unknown variables warn", () => {
  const w = mirror.validateClaimBanner({ ...mirror.CLAIM_BANNER_DEFAULTS, body: "Hi {{foo}}" }).warnings;
  assertEquals(w.body?.length, 1);
});

Deno.test("contrast warnings include the ratio; defaults are clean", () => {
  assertEquals(mirror.claimBannerContrastWarnings(mirror.CLAIM_BANNER_DEFAULTS, "#232820"), []);
  const w = mirror.claimBannerContrastWarnings({ ...mirror.CLAIM_BANNER_DEFAULTS, accentColour: "#FFFF00" }, "#232820");
  assertEquals(w.length, 1);
  assertStringIncludes(w[0].message, "Aim for at least 4.5:1");
  assertStringIncludes(w[0].message, ":1.");
});

Deno.test("bannerToColumns never writes blank required text (columns are NOT NULL)", () => {
  const cols = mirror.bannerToColumns({ ...mirror.CLAIM_BANNER_DEFAULTS, heading: "", secondaryLabel: "", secondaryUrl: "" });
  assertEquals(cols.banner_heading, mirror.CLAIM_BANNER_DEFAULTS.heading);
  assertEquals(cols.banner_secondary_label, null);
  assertEquals(cols.banner_secondary_url, null);
});

// ---- parity between builders.ts and src/lib/claimBanner.js ----

Deno.test("admin mirror matches the publish side", () => {
  assertEquals(mirror.CLAIM_BANNER_DEFAULTS, CLAIM_BANNER_DEFAULTS);
  assertEquals(mirror.CLAIM_BANNER_LIMITS, CLAIM_BANNER_LIMITS);
  assertEquals(mirror.CLAIM_BANNER_VARIABLES.map((v: { name: string }) => v.name), [...CLAIM_BANNER_VARIABLES]);
  for (const t of ["{{org_name}}", "a {{ org_name }} b", "{{foo}}", "{{ org_short_name }}", "no vars", "{{}}", "{org_name}"]) {
    assertEquals(mirror.resolveClaimVars(t, { org_name: "X" }), resolveClaimVars(t, { org_name: "X" }), t);
    assertEquals(mirror.unknownClaimVars(t), unknownClaimVars(t), t);
  }
  for (const u of ["", "https://a.b/c", "http://a.b", "/x", "//x", "javascript:1"]) {
    assertEquals(mirror.isValidClaimBannerUrl(u), isValidClaimBannerUrl(u), u);
  }
});

// ---- manual claim mode ----

Deno.test("manual mode renders the name/email/message form and posts to submit_claim_request", () => {
  const html = page({ ...claim(), mode: "manual" });
  assertStringIncludes(html, "Send request");
  assertStringIncludes(html, 'name="message"');
  assertStringIncludes(html, "submit_claim_request");
  assertStringIncludes(html, "listing_claim_request_sent");
  assertFalse(html.includes("Send sign-in link"));
});

Deno.test("auto mode keeps the sign-in link form", () => {
  const html = page(claim());
  assertStringIncludes(html, "Send sign-in link");
  assertFalse(html.includes('name="website"'));
});

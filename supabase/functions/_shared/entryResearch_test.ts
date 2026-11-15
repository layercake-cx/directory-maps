// Run: deno test --allow-env supabase/functions/_shared/entryResearch_test.ts
// Pure-function tests for the research and validation stages: no network, no model calls.

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  assertResearchSufficient,
  htmlToText,
  normaliseResearch,
  parsePublicUrl,
  pickInformativeLinks,
  ResearchInsufficientError,
} from "./entryResearch.ts";
import type { EntryResearch } from "./entryResearch.ts";
import { validateListing } from "./entryListingQuality.ts";

const research: EntryResearch = {
  business_summary: "Organic veg-box pioneer delivering across the UK.",
  history_and_story: ["Started in 1988 as a small family business delivering organic boxes from Sussex"],
  products: ["Seasonal fruit and veg boxes", "Free-range Sussex eggs"],
  producers_and_sourcing: ["Grows alongside named family farms across the South Downs"],
  philosophy_and_practices: ["Champions regenerative agriculture and plastic-free packaging"],
  verified_certifications: [{ name: "Soil Association Organic", evidence: "Listed on the Soil Association licensee directory" }],
  distinctive_details: [
    "Started in 1988 as a small family business delivering organic boxes from Sussex",
    "Seasonal fruit and veg boxes packed with wonky produce",
    "Champions regenerative agriculture and plastic-free packaging",
  ],
  sources: [{ url: "https://example.com/about", title: "About" }],
  unverified_or_missing: ["Exact number of partner farms"],
  confidence: "good",
};

const GOOD = `<p>Back in 1988 a handful of Sussex growers started packing organic boxes for their neighbours, and the idea has never stopped growing. Today the seasonal fruit and veg boxes still arrive the way they began: guided by the weather, with wonky produce welcome.</p>
<p>Regenerative farming is the thread running through everything, from the family farms across the South Downs that supply the carrots to the plastic-free packaging that keeps it all fresh. Open the box and you can taste why people stay for decades.</p>`;

const BAD = `<p>Fruit, vegetables and meat give Abel &amp; Cole's recorded range a broad appeal across the listed categories.</p>
<p>Individual products, box formats and purchasing options aren't described here, so the best way to see what suits your table is to browse the current range directly.</p>
<p>Meta description: Abel &amp; Cole organic boxes. Keywords: organic, veg box. Verification of certifications is required.</p>`;

Deno.test("validateListing accepts a specific, well-written listing", () => {
  assertEquals(validateListing(GOOD, research, "Abel & Cole"), []);
});

Deno.test("validateListing rejects the database-style listing that prompted this work", () => {
  const problems = validateListing(BAD, research, "Abel & Cole").join(" | ");
  assert(/recorded range/i.test(problems), problems);
  assert(/missing|described/i.test(problems), problems);
  assert(/seo|metadata/i.test(problems), problems);
  assert(/research limitations|verification/i.test(problems), problems);
  assert(/generically|supplier-specific/i.test(problems), problems);
});

Deno.test("validateListing rejects generic copy that skips the researched details, even if well-formed", () => {
  const generic =
    "<p>This much-loved supplier delivers a wide choice of excellent products to customers across the country, with friendly service and a strong reputation for quality that people really value every week.</p>" +
    "<p>Whether you are cooking for a family or planning something special, there is plenty to explore, and the team are always on hand to help you choose just what you need for your table this season.</p>";
  const problems = validateListing(generic, research, "Abel & Cole");
  assert(problems.some((p) => p.includes("supplier-specific")), problems.join(" | "));
});

Deno.test("validateListing does not count the supplier's own name as a researched detail", () => {
  const nameOnly = "<p>Abel &amp; Cole is brilliant. Abel &amp; Cole is great. Abel &amp; Cole delivers wonderful things to wonderful people all across the land, every single week of the year without fail or hesitation.</p><p>Honestly, Abel &amp; Cole really is the very best at what it does, and anybody would be delighted to try it at least once, given how very well regarded it is.</p>";
  assert(validateListing(nameOnly, research, "Abel & Cole").some((p) => p.includes("supplier-specific")));
});

Deno.test("assertResearchSufficient passes good research and rejects thin research with an actionable message", () => {
  assertResearchSufficient(research, "Abel & Cole", true);
  const thin: EntryResearch = { ...research, confidence: "poor", distinctive_details: ["One thing"], sources: [] };
  const err = assertThrows(() => assertResearchSufficient(thin, "Abel & Cole", true), ResearchInsufficientError);
  assert(err.message.includes("left unchanged"));
  assert(err.message.includes("website address"));
});

Deno.test("parsePublicUrl allows public sites and blocks internal targets", () => {
  assertEquals(parsePublicUrl("https://www.abelandcole.co.uk/about")?.hostname, "www.abelandcole.co.uk");
  for (const bad of [
    "http://localhost:3000", "http://127.0.0.1/admin", "http://10.0.0.5", "http://192.168.1.1", "http://172.16.0.1",
    "http://169.254.169.254/latest/meta-data", "http://[::1]/", "ftp://example.com", "javascript:alert(1)",
    "https://user:pass@example.com", "http://intranet", "https://foo.internal", "", null,
  ]) {
    assertEquals(parsePublicUrl(bad as string | null), null, String(bad));
  }
});

Deno.test("htmlToText keeps readable content and drops scripts, styles and navigation", () => {
  const text = htmlToText(
    "<html><head><title>Our story</title><meta name='description' content='Organic boxes since 1988'><style>.x{}</style></head>" +
      "<body><nav>Menu Basket</nav><script>alert(1)</script><h1>From Sussex</h1><p>We started in 1988 &amp; never stopped.</p></body></html>",
  );
  assert(text.includes("Page title: Our story"));
  assert(text.includes("Organic boxes since 1988"));
  assert(text.includes("We started in 1988 & never stopped."));
  assert(!text.includes("alert(1)") && !text.includes("Menu Basket") && !text.includes(".x{}"));
});

Deno.test("pickInformativeLinks prefers same-site story and product pages", () => {
  const base = new URL("https://shop.example.co.uk/");
  const links = pickInformativeLinks(
    `<a href="/about-us">About us</a><a href="/our-farms">Meet our farms</a><a href="/basket">Basket</a>
     <a href="https://other.com/about">Elsewhere</a><a href="/brochure.pdf">About brochure</a><a href="/">Home</a>`,
    base,
  );
  assertEquals(links.sort(), ["https://shop.example.co.uk/about-us", "https://shop.example.co.uk/our-farms"]);
});

Deno.test("normaliseResearch drops malformed fields and defaults to poor confidence", () => {
  const r = normaliseResearch({
    business_summary: 7,
    distinctive_details: ["Real detail", 4, "  "],
    sources: [{ url: "javascript:alert(1)", title: "x" }, { url: "https://ok.example/p", title: "Fine" }],
    verified_certifications: [{ name: "Organic" }, { name: "Pasture for Life", evidence: "Licence page" }],
    confidence: "excellent",
  });
  assertEquals(r.business_summary, "");
  assertEquals(r.distinctive_details, ["Real detail"]);
  assertEquals(r.sources.map((s) => s.url), ["https://ok.example/p"]);
  assertEquals(r.verified_certifications.length, 1);
  assertEquals(r.confidence, "poor");
});

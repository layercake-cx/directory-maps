// Block pages (phase 3): sanitiser, block renderers, and parity between a
// page rendered the standard way and the same page rendered from converted
// block instances. Run: deno test supabase/functions/generate_directory_site/blocks_test.ts
import { assert, assertEquals, assertFalse, assertStringIncludes } from "jsr:@std/assert@1";
import {
  blocksInRegion,
  mergeFaqJsonLd,
  renderGenericBlock,
  resolveBlocks,
  safeHref,
  sanitiseRichHtml,
  type BlockCtx,
  type BlockRow,
  type PageBlock,
} from "./blocks.ts";
import { buildContentPage, buildEntryPage, linkTiles, siteFooter, siteHeader, type ContentPage, type Entry, type SiteNav } from "./builders.ts";

const block = (block_type: string, data: Record<string, unknown>, over: Partial<PageBlock> = {}): PageBlock => ({
  id: crypto.randomUUID(), region: "main", position: 0, block_type, data, common: {}, ...over,
});
const ctx = (over: Partial<BlockCtx> = {}): BlockCtx => ({ pageKind: "entry", region: "main", ...over });
const render = (b: PageBlock, c: BlockCtx = ctx()) => renderGenericBlock(b, c);

// ---------------------------------------------------------------- sanitiser

Deno.test("sanitiser drops script/style/iframe with their content", () => {
  const out = sanitiseRichHtml("<p>Hi</p><script>alert(1)</script><style>body{}</style><iframe src=x>bad</iframe>");
  assertEquals(out, "<p>Hi</p>");
});

Deno.test("sanitiser strips event handlers and unknown attributes", () => {
  assertEquals(sanitiseRichHtml('<p onclick="x()" style="color:red" class="a">Hi</p>'), "<p>Hi</p>");
  assertFalse(sanitiseRichHtml("<img src=x onerror=alert(1)>").includes("<img"));
});

Deno.test("sanitiser keeps safe links and drops javascript: and data: hrefs", () => {
  assertEquals(sanitiseRichHtml('<a href="https://example.com/a?b=1&amp;c=2">x</a>'), '<a href="https://example.com/a?b=1&amp;c=2" rel="noopener noreferrer">x</a>');
  assertEquals(sanitiseRichHtml('<a href="javascript:alert(1)">x</a>'), "<a>x</a>");
  assertEquals(sanitiseRichHtml('<a href="  JaVa\nScript:alert(1)">x</a>'), "<a>x</a>");
  assertEquals(sanitiseRichHtml('<a href="data:text/html;base64,AAAA">x</a>'), "<a>x</a>");
  assertEquals(sanitiseRichHtml('<a href="javascript&colon;alert(1)">x</a>'), "<a>x</a>");
  assertEquals(sanitiseRichHtml('<a href="//evil.example/x">x</a>'), "<a>x</a>");
});

Deno.test("sanitiser balances tags and escapes stray angle brackets", () => {
  assertEquals(sanitiseRichHtml("<p><strong>Bold"), "<p><strong>Bold</strong></p>");
  assertEquals(sanitiseRichHtml("</em>text"), "text");
  assertEquals(sanitiseRichHtml("1 < 2 and 3 > 2"), "1 &lt; 2 and 3 &gt; 2");
  assertEquals(sanitiseRichHtml("<<script>alert(1)//<</script>"), "&lt;");
});

Deno.test("basic mode allows only inline marks", () => {
  assertEquals(sanitiseRichHtml("<h2>Big</h2><ul><li>x</li></ul><strong>ok</strong>", "basic"), "Bigx<strong>ok</strong>");
  assertEquals(sanitiseRichHtml(42), "");
});

Deno.test("safeHref accepts only http(s), mailto, tel, relative and anchors", () => {
  assertEquals(safeHref("https://a.example/x"), "https://a.example/x");
  assertEquals(safeHref("mailto:a@b.example"), "mailto:a@b.example");
  assertEquals(safeHref("/path"), "/path");
  assertEquals(safeHref("#top"), "#top");
  assertEquals(safeHref("javascript:alert(1)"), null);
  assertEquals(safeHref("ftp://x"), null);
  assertEquals(safeHref(""), null);
});

// ---------------------------------------------------------------- resolution

Deno.test("resolveBlocks inherits template data for linked instances and sorts by region then position", () => {
  const rows: BlockRow[] = [
    { id: "b", entry_id: "e", content_page_id: null, region: "sidebar", position: 0, block_type: "callout", template_id: "t1", data: null, common: null },
    { id: "a", entry_id: "e", content_page_id: null, region: "main", position: 1, block_type: "rich", template_id: null, data: { body: "own" }, common: {} },
    { id: "c", entry_id: "e", content_page_id: null, region: "main", position: 0, block_type: "callout", template_id: "t1", data: { title: "detached" }, common: {} },
    { id: "x", entry_id: "e", content_page_id: null, region: "elsewhere", position: 0, block_type: "rich", template_id: null, data: {}, common: {} },
  ];
  const out = resolveBlocks(rows, new Map([["t1", { id: "t1", data: { title: "from template" } }]]));
  assertEquals(out.map((b) => b.id), ["c", "a", "b"]);
  assertEquals(out[0].data, { title: "detached" });
  assertEquals(out[2].data, { title: "from template" });
  assertEquals(blocksInRegion(out, "sidebar").length, 1);
});

// ---------------------------------------------------------------- renderers

Deno.test("rich: sanitises, wraps, and renders nothing when empty", () => {
  const r = render(block("rich", { title: "About", body: "<p>Hello</p><script>x</script>" }))!;
  assertStringIncludes(r.html, '<h2 class="ds-block__title">About</h2>');
  assertStringIncludes(r.html, '<div class="prose"><p>Hello</p></div>');
  assertFalse(r.html.includes("script"));
  assertEquals(render(block("rich", { body: "" })), null);
});

Deno.test("common settings: theme, anchor, visibility, spacing tokens only", () => {
  const b = block("callout", { title: "Note", body: "x" }, { common: { theme: "inverse", anchorId: "safe", visibility: "mobile", spacingAbove: "--ds-space-4", spacingBelow: "12px" } });
  const html = render(b)!.html;
  assertStringIncludes(html, 'data-theme="inverse"');
  assertStringIncludes(html, 'id="safe"');
  assertStringIncludes(html, "ds-vis-mobile");
  assertStringIncludes(html, "margin-top:var(--ds-space-4)");
  assertFalse(html.includes("12px"));
});

Deno.test("heading: anchor from title, level, eyebrow; contributes a jump chip", () => {
  const r = render(block("heading", { title: "Fees and formats", level: "h3", eyebrow: "Costs" }))!;
  assertStringIncludes(r.html, '<h3 class="ds-heading">Fees and formats</h3>');
  assertStringIncludes(r.html, 'id="fees-and-formats"');
  assertEquals(r.chipLabel, "Fees and formats");
});

Deno.test("callout: tone and basic-only body", () => {
  const html = render(block("callout", { title: "Safeguarding", body: "<h2>no</h2><strong>yes</strong>", tone: "warning" }))!.html;
  assertStringIncludes(html, "ds-callout--warning");
  assertStringIncludes(html, "<strong>yes</strong>");
  assertFalse(html.includes("<h2>no"));
});

Deno.test("faq: details/summary, tracked toggle, FAQPage data, first open, structured data can be off", () => {
  const b = block("faq", { title: "Questions", firstOpen: true, items: [{ question: "Cost?", answer: "<p>Free</p>" }, { question: "Where?", answer: "Online" }] });
  const r = render(b)!;
  assertStringIncludes(r.html, '<details class="ds-faq__item" open>');
  assertStringIncludes(r.html, 'data-dm-event="listing_faq_toggle"');
  assertEquals(r.jsonLd?.length, 1);
  assertEquals((r.jsonLd![0].mainEntity as unknown[]).length, 2);
  assertEquals(render(block("faq", { items: [{ question: "Q", answer: "A" }], structuredData: false }))!.jsonLd, undefined);
  const merged = mergeFaqJsonLd([...r.jsonLd!, ...render(block("faq", { items: [{ question: "Q", answer: "A" }] }))!.jsonLd!]);
  assertEquals(merged.length, 1);
  assertEquals((merged[0].mainEntity as unknown[]).length, 3);
});

Deno.test("table: caption required, header cells scoped, cells escaped", () => {
  const html = render(block("table", { title: "Fees", rows: [["Age", "Cost"], ["<b>U12</b>", "£5"]] }))!.html;
  assertStringIncludes(html, "<caption>Fees</caption>");
  assertStringIncludes(html, '<th scope="col">Age</th>');
  assertStringIncludes(html, "&lt;b&gt;U12&lt;/b&gt;");
  assertEquals(render(block("table", { rows: [["a"]] })), null);
});

Deno.test("cards: links are safe and tracked, javascript: links vanish", () => {
  const b = block("cards", { title: "Why", items: [
    { heading: "One", body: "<strong>b</strong>", link: { kind: "url", target: "https://example.com", label: "Read more" } },
    { heading: "Two", link: { kind: "url", target: "javascript:alert(1)" } },
  ] });
  const html = render(b)!.html;
  assertStringIncludes(html, 'href="https://example.com"');
  assertStringIncludes(html, 'data-dm-cta="card"');
  assertFalse(html.includes("javascript:"));
});

Deno.test("media: https image only, alt kept", () => {
  const ok = render(block("media", { title: "First session", media: { url: "https://img.example/a.jpg", alt: "Players" }, items: [{ heading: "Arrive" }] }))!.html;
  assertStringIncludes(ok, 'src="https://img.example/a.jpg" alt="Players"');
  const bad = render(block("media", { media: { url: "javascript:alert(1)", alt: "x" }, items: [{ heading: "Arrive" }] }))!.html;
  assertFalse(bad.includes("<img"));
});

Deno.test("actions: sticky only in the sidebar, items need a safe link", () => {
  const data = { title: "Get involved", sticky: true, items: [{ label: "Find a club", link: { kind: "url", target: "https://example.com" } }, { label: "Bad", link: { kind: "url", target: "javascript:x" } }] };
  const side = render(block("actions", data, { region: "sidebar" }), ctx({ region: "sidebar" }))!.html;
  assertStringIncludes(side, "ds-sticky");
  assertStringIncludes(side, "Find a club");
  assertFalse(side.includes(">Bad<"));
  assertFalse(render(block("actions", data), ctx())!.html.includes("ds-sticky"));
});

Deno.test("tags: chips from the entry's terms, filter links, overflow, none-link mode", () => {
  const terms = [
    { termId: "t1", catKey: "type", catLabel: "Type", catFieldType: "single_select", label: "Racket", slug: "racket" },
    { termId: "t2", catKey: "disability", catLabel: "Disability friendly", catFieldType: "boolean", label: "Yes", slug: "yes" },
    { termId: "t3", catKey: "sector", catLabel: "Sector", catFieldType: "multi_select", label: "Indoor", slug: "indoor" },
  ];
  const c = ctx({ terms, filterHref: (k, s) => `/d?${k}=${s}` });
  const html = render(block("tags", { sources: ["category", "attributes"], link: "filtered-listing", maxShown: 2 }), c)!.html;
  assertStringIncludes(html, 'href="/d?type=racket"');
  assertStringIncludes(html, "Disability friendly");
  assertStringIncludes(html, "+1");
  assertFalse(render(block("tags", { sources: ["category"], link: "none" }), c)!.html.includes("href"));
  assertEquals(render(block("tags", { sources: ["category"] }), ctx()), null);
});

Deno.test("hero: one h1, falls back to h2 when the entry header already has it; image must be https", () => {
  const data = { title: "Badminton", media: "image", mediaAsset: { url: "https://img.example/h.jpg", alt: "Court" }, showBreadcrumb: true };
  const first = render(block("hero", data, { region: "hero" }), ctx({ region: "hero", breadcrumbHtml: "<nav>crumb</nav>" }))!.html;
  assertStringIncludes(first, '<h1 class="ds-hero__title">Badminton</h1>');
  assertStringIncludes(first, "<nav>crumb</nav>");
  assertStringIncludes(first, 'fetchpriority="high"');
  const second = render(block("hero", data, { region: "hero" }), ctx({ region: "hero", h1Taken: true }))!.html;
  assertStringIncludes(second, '<h2 class="ds-hero__title">');
});

Deno.test("claim: hidden once claimed, merge fields resolved, opens the claim widget when no link", () => {
  const data = { title: "Is {entry.short_name} yours?", body: "Claim {entry.name}.", layout: "auto" };
  const open = render(block("claim", data), ctx({ entry: { id: "e", name: "Club Ltd", short_name: "Club", claimed: false }, claimWidget: true }))!.html;
  assertStringIncludes(open, "Is Club yours?");
  assertStringIncludes(open, "Claim Club Ltd.");
  assertStringIncludes(open, "data-dm-claim-open");
  assertEquals(render(block("claim", data), ctx({ entry: { id: "e", name: "Club Ltd", claimed: true } })), null);
});

Deno.test("unknown and data-bound block types are not rendered by the generic renderer", () => {
  assertEquals(render(block("entry_gallery", {})), null);
  assertEquals(render(block("nope", {})), null);
  assertEquals(render(block("contact", { organisation: "x" })), null);
});

// ---------------------------------------------------------------- parity

const entry: Entry = {
  id: "e1", name: "Badminton England", slug: "badminton-england", directory_group_id: null,
  address: "1 Court Road", postcode: "MK1 1AA", country: "UK", city: "Milton Keynes", phone: "01234 567890", email: "hello@example.org",
  website_url: "https://example.org", logo_url: null, notes_html: "<p>About us.</p>", allow_html: true, lat: null, lng: null,
  show_phone: true, show_email: true, show_website: true, show_address: true, meta_title: null, meta_description: null,
  noindex: null, structured_data_type: null, panel_image_url: null, panel_background_color: null, current_claim_id: null,
};

const base = {
  clientSlug: "c", directorySlug: "d", directoryName: "Dir", entry,
  evidence: [], media: [{ entry_id: "e1", url: "https://img.example/g.jpg", alt_text: "Court", caption: null, is_hero: false }],
  accreditations: [],
  links: [{ entry_id: "e1", directory_id: null, label: "Join", url: "https://example.org/join", style: "primary", open_in_new: true, tracking: true }],
  tiles: [], theme: {}, categorisations: [], entryTermIds: [], attachedMapEmbedSrc: null, attachedMapFocusedEmbedSrc: null,
  staticMapsApiKey: null, related: [],
// deno-lint-ignore no-explicit-any
} as any;

const sidebar = (): PageBlock[] => ["entry_contact_panel", "entry_map_card", "entry_attributes", "entry_tag_chips"].map((t, i) => block(t, {}, { region: "sidebar", position: i }));

Deno.test("a page with no blocks, or an empty block list, renders identically", () => {
  const layout = [{ type: "links", label: "Links" }];
  const none = buildEntryPage({ ...base, layout });
  assertEquals(buildEntryPage({ ...base, layout, blocks: [] }), none);
  assertEquals(buildEntryPage({ ...base, layout, blocks: null }), none);
});

Deno.test("parity: converted data-bound blocks reproduce the standard entry page byte for byte", () => {
  const layout = [{ type: "gallery", label: "Photos" }, { type: "links", label: "Links" }];
  const standard = buildEntryPage({ ...base, layout });
  const blocks: PageBlock[] = [
    block("entry_hero", {}, { region: "hero" }),
    block("entry_gallery", { title: "Photos" }, { position: 0 }),
    block("entry_links", { title: "Links" }, { position: 1 }),
    ...sidebar(),
  ];
  // The only difference in block mode is that each section is its own box.
  assertEquals(buildEntryPage({ ...base, layout: [], blocks }).replaceAll(" ds-box", ""), standard);
});

Deno.test("an unlabelled data-bound block is wrapped in its own box with the same content", () => {
  const blocks = [block("entry_hero", {}, { region: "hero" }), block("entry_links", {}), ...sidebar()];
  const html = buildEntryPage({ ...base, layout: [], blocks });
  assertStringIncludes(html, `<div class="dir-entry-section ds-box">${linkTiles(base.links)}</div>`);
});

Deno.test("content blocks are boxes; blocks that are already boxes, headings and dividers are not", () => {
  for (const type of ["rich", "list", "faq", "table", "media", "chips", "actions", "tags", "attrs", "quote"]) {
    const data: Record<string, unknown> = {
      rich: { body: "<p>x</p>" }, list: { items: ["a"] }, faq: { items: [{ question: "q", answer: "a" }] }, table: { title: "T", rows: [["a"]] },
      media: { items: [{ heading: "h" }] }, chips: { items: ["a"] }, actions: { title: "T", items: [{ label: "L", link: { kind: "url", target: "https://e.example" } }] },
      tags: { sources: ["region"] }, attrs: {}, quote: { title: "q", who: "w" },
    }[type]!;
    const r = render(block(type, data), ctx({ entry: { id: "e", name: "N", city: "Leeds" }, terms: [{ termId: "t", catKey: "k", catLabel: "Flag", catFieldType: "boolean", label: "Yes", slug: "y" }] }));
    if (r) assertStringIncludes(r.html, " ds-box", `${type} should be boxed`);
  }
  for (const [type, data] of [["callout", { title: "x", body: "y" }], ["stats", { items: [{ value: "1" }] }], ["cards", { items: [{ heading: "a" }, { heading: "b" }] }], ["divider", { style: "line" }]] as const) {
    assertFalse(render(block(type, data as Record<string, unknown>))!.html.includes(" ds-box"), `${type} must not get a second box`);
  }
});

Deno.test("a converted notes block renders as a rich block with the same text", () => {
  const html = buildEntryPage({ ...base, layout: [], blocks: [
    block("entry_hero", {}, { region: "hero" }),
    block("rich", { title: "About", body: "<p>About us.</p>", style: "normal" }),
    ...sidebar(),
  ] });
  assertStringIncludes(html, '<div class="prose"><p>About us.</p></div>');
  assertEquals(html.split("<h1").length - 1, 1);
});

Deno.test("an FAQ block adds one FAQPage to the page's structured data", () => {
  const html = buildEntryPage({ ...base, layout: [], blocks: [
    block("entry_hero", {}, { region: "hero" }),
    block("faq", { items: [{ question: "Cost?", answer: "Free" }] }),
  ] });
  assertEquals(html.split('"@type":"FAQPage"').length - 1, 1);
});

Deno.test("block page without an entry_hero or hero block still gets the standard header and one h1", () => {
  const html = buildEntryPage({ ...base, layout: [], blocks: [block("rich", { body: "<p>x</p>" })] });
  assertEquals(html.split("<h1").length - 1, 1);
  assertStringIncludes(html, "dir-entry-hero");
});

Deno.test("a claim block replaces the standard claim banner", () => {
  const withClaim = { supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "k", priceCents: null, currency: null, paymentType: null, introHtml: null, mode: "auto", directoryId: "d1", banner: undefined };
  const std = buildEntryPage({ ...base, layout: [], claim: withClaim });
  const blk = buildEntryPage({ ...base, layout: [], claim: withClaim, blocks: [
    block("entry_hero", {}, { region: "hero" }),
    block("claim", { title: "Claim {entry.name}", layout: "banner" }),
  ] });
  assertEquals(std.split('class="dir-claim-banner"').length - 1, 1);
  assertEquals(blk.split('class="dir-claim-banner"').length - 1, 0);
  assertStringIncludes(blk, "Claim Badminton England");
});

// ---------------------------------------------------------------- content pages

const nav: SiteNav = { homeUrl: "/directories/c/d", homeLabel: "Home", items: [] };
const contentPage: ContentPage = {
  id: "p1", parent_page_id: null, title: "About us", slug: "about", body_html: "<p>Legacy body</p>",
  meta_title: null, meta_description: null, noindex: false,
};
const pageOpts = { clientSlug: "c", directorySlug: "d", directoryName: "Dir", page: contentPage, parentPage: null, childPages: [], pagesById: new Map([["p1", contentPage]]), theme: {}, nav };

Deno.test("content page: no blocks keeps today's body", () => {
  const html = buildContentPage(pageOpts);
  assertStringIncludes(html, '<div class="prose"><p>Legacy body</p></div>');
  assertEquals(buildContentPage({ ...pageOpts, blocks: [] }), html);
});

Deno.test("content page: blocks replace body_html, one h1, sanitised, sidebar blocks stack", () => {
  const html = buildContentPage({ ...pageOpts, blocks: [
    block("page_title", {}, { region: "hero", pageKind: undefined } as Partial<PageBlock>),
    block("rich", { body: "<p>From blocks</p><script>x</script>" }),
    block("callout", { title: "Note", body: "side" }, { region: "sidebar" }),
  ] });
  assertStringIncludes(html, "<p>From blocks</p>");
  assertFalse(html.includes("Legacy body"));
  assertFalse(html.includes("<script>x"));
  assertEquals(html.split("<h1").length - 1, 1);
  assertStringIncludes(html, "ds-page-side");
});

Deno.test("content page: without a title block the standard heading is kept", () => {
  const html = buildContentPage({ ...pageOpts, blocks: [block("rich", { body: "<p>x</p>" })] });
  assertEquals(html.split("<h1").length - 1, 1);
  assertStringIncludes(html, "About us");
});

Deno.test("block CSS ships in the stylesheet with the --ds-* tokens", async () => {
  const { buildThemeCss } = await import("./builders.ts");
  const css = buildThemeCss({});
  assert(css.includes("--ds-color-accent: var(--primary)"));
  assert(css.includes(".ds-block"));
});

Deno.test("hero-region blocks sit inside the page-width container, never at the top level", () => {
  const hero = block("hero", { title: "Badminton", media: "none" }, { region: "hero" });
  const stats = block("stats", { items: [{ value: "12", label: "clubs" }] }, { region: "hero", position: 1 });
  const html = buildEntryPage({ ...base, layout: [], blocks: [hero, stats, ...sidebar()] });
  assertEquals(html.split('<div class="wrap ds-hero-region">').length - 1, 2);
  assertFalse(/<\/div>\s*<section class="ds-block ds-block--hero/.test(html), "hero section must not follow a closed container at top level");
  assertStringIncludes(html, '<div class="wrap ds-hero-region"><section class="ds-block ds-block--hero');
  assertFalse(html.includes('class="wrap ds-hero__inner"'));
  const page = buildContentPage({ ...pageOpts, blocks: [block("page_title", {}, { region: "hero" }), block("stats", { items: [{ value: "1" }] }, { region: "hero", position: 1 })] });
  assertStringIncludes(page, '<div class="wrap ds-hero-region"><section class="ds-block ds-block--stats');
});

Deno.test("a hero banner does not repeat the breadcrumb the entry header already shows", () => {
  const hero = block("hero", { title: "Try it", media: "none", showBreadcrumb: true }, { region: "hero", position: 1 });
  const withHeader = buildEntryPage({ ...base, layout: [], blocks: [block("entry_hero", {}, { region: "hero" }), hero, ...sidebar()] });
  assertEquals(withHeader.split('aria-label="Breadcrumb"').length - 1, 1);
  const alone = buildEntryPage({ ...base, layout: [], blocks: [{ ...hero, position: 0 }, ...sidebar()] });
  assertEquals(alone.split('aria-label="Breadcrumb"').length - 1, 1);
});

Deno.test("a hidden block stays on the page for editors but renders nothing for visitors", () => {
  const hidden = block("rich", { body: "<p>Hidden notes</p>" }, { common: { visibility: "hidden" } });
  assertEquals(render(hidden), null);
  const html = buildEntryPage({ ...base, layout: [], blocks: [block("entry_hero", {}, { region: "hero" }), hidden, block("entry_links", {}, { common: { visibility: "hidden" }, position: 1 }), ...sidebar()] });
  assertFalse(html.includes("Hidden notes"));
  assertFalse(html.includes("link-tile"));
  const shown = buildEntryPage({ ...base, layout: [], blocks: [block("entry_hero", {}, { region: "hero" }), { ...hidden, common: {} }, ...sidebar()] });
  assertStringIncludes(shown, "Hidden notes");
});

// ---------------------------------------------------------------- editor canvas (render options)

Deno.test("edit mode marks every block, always renders the three zones, and leaves published pages untouched", () => {
  const blocks = [
    block("entry_hero", {}, { region: "hero" }),
    block("rich", { body: "<p>Hello</p>" }, { position: 0 }),
    block("entry_links", { title: "Links" }, { position: 1 }),
    ...sidebar(),
  ];
  const published = buildEntryPage({ ...base, layout: [], blocks });
  assertFalse(published.includes("data-ds-"), "a published page must carry no editor markers");

  const editing = buildEntryPage({ ...base, layout: [], blocks, render: { chrome: false, edit: true } });
  for (const b of blocks) assertStringIncludes(editing, `data-ds-block="${b.id}"`, `${b.block_type} should be marked`);
  for (const z of ["hero", "main", "sidebar"]) assertStringIncludes(editing, `data-ds-zone="${z}"`);

  const empty = buildEntryPage({ ...base, layout: [], blocks: [block("rich", { body: "<p>x</p>" })], render: { chrome: false, edit: true } });
  assertStringIncludes(empty, 'data-ds-zone="sidebar"', "an empty sidebar is still a drop zone");
  assertStringIncludes(empty, 'data-ds-zone="hero"');
});

Deno.test("edit mode leaves out the site header, footer, enquiry drawer and analytics", () => {
  const blocks = [block("entry_hero", {}, { region: "hero" }), ...sidebar()];
  const chromeOpts = { clientSlug: "c", directorySlug: "d", directoryName: "Dir", homeUrl: "/directories/c/d" };
  const withChrome = buildEntryPage({ ...base, layout: [], blocks });
  const without = buildEntryPage({ ...base, layout: [], blocks, render: { chrome: false } });
  assertStringIncludes(withChrome, siteHeader({ directoryName: "Dir", tagline: null, homeUrl: chromeOpts.homeUrl, nav: null }));
  assertStringIncludes(withChrome, siteFooter({ directoryName: "Dir", homeUrl: chromeOpts.homeUrl, nav: null }));
  assertFalse(without.includes(siteHeader({ directoryName: "Dir", tagline: null, homeUrl: chromeOpts.homeUrl, nav: null })));
  assertFalse(without.includes(siteFooter({ directoryName: "Dir", homeUrl: chromeOpts.homeUrl, nav: null })));
  assertStringIncludes(without, 'class="dir-entry-hero"', "the page itself is still there");
});

Deno.test("edit mode shows a placeholder for blocks that would render nothing, published pages do not", () => {
  const blocks = [
    block("entry_hero", {}, { region: "hero" }),
    block("rich", { body: "" }, { position: 0 }),
    block("callout", { title: "Hidden one", body: "x" }, { position: 1, common: { visibility: "hidden" } }),
    block("entry_gallery", {}, { position: 2 }),
    ...sidebar(),
  ];
  const editing = buildEntryPage({ ...base, media: [], layout: [], blocks, render: { chrome: false, edit: true } });
  assertEquals(editing.split("ds-placeholder").length - 1 >= 3, true, "empty, hidden and no-data blocks each get a placeholder");
  assertStringIncludes(editing, "Hidden from visitors");
  const published = buildEntryPage({ ...base, media: [], layout: [], blocks });
  assertFalse(published.includes("ds-placeholder"));
  assertFalse(published.includes("Hidden one"));
});

Deno.test("content page edit mode: markers, zones, no site chrome, nothing on the published page", () => {
  const blocks = [block("page_title", {}, { region: "hero" }), block("rich", { body: "<p>Body</p>" }), block("callout", { title: "Side", body: "x" }, { region: "sidebar" })];
  const published = buildContentPage({ ...pageOpts, blocks });
  assertFalse(published.includes("data-ds-"));
  const editing = buildContentPage({ ...pageOpts, blocks, render: { chrome: false, edit: true } });
  for (const b of blocks) assertStringIncludes(editing, `data-ds-block="${b.id}"`);
  for (const z of ["hero", "main", "sidebar"]) assertStringIncludes(editing, `data-ds-zone="${z}"`);
  const noSide = buildContentPage({ ...pageOpts, blocks: blocks.slice(0, 2), render: { chrome: false, edit: true } });
  assertStringIncludes(noSide, 'data-ds-zone="sidebar"');
});

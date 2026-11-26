/**
 * Block pages — public renderers (phase 3).
 *
 * Pure string builders, no network or DB access, same contract as
 * builders.ts. A page that has block instances is rendered region by region
 * from them; a page with none keeps today's output (builders.ts decides).
 *
 * Trust boundary: block data is client-writable JSON. Every string is escaped
 * or run through sanitiseRichHtml(); every URL is re-checked here even though
 * the database validates it too (defence in depth, per the phase 2 notes).
 *
 * Styling: blocks read only --ds-* tokens (BLOCK_STYLE below defines them
 * from the directory's existing theme variables), so a theme restyles every
 * block by changing token values.
 */

import { escapeAttr, escapeHtml } from "../_shared/staticSiteRenderer.ts";

// ---------------------------------------------------------------- types

export type RegionId = "hero" | "main" | "sidebar";

/** A block instance with its effective content (template data already merged in). */
export type PageBlock = {
  id: string;
  region: RegionId;
  position: number;
  block_type: string;
  data: Record<string, unknown>;
  common: Record<string, unknown>;
};

export type BlockRow = {
  id: string;
  entry_id: string | null;
  content_page_id: string | null;
  region: string;
  position: number;
  block_type: string;
  template_id: string | null;
  data: Record<string, unknown> | null;
  common: Record<string, unknown> | null;
};

export type TemplateData = { id: string; data: Record<string, unknown> };

const REGION_ORDER: Record<string, number> = { hero: 0, main: 1, sidebar: 2 };

/** Linked instances (data null) inherit their template's data. Drops rows whose region is unknown. */
export function resolveBlocks(rows: BlockRow[], templates: Map<string, TemplateData>): PageBlock[] {
  return rows
    .filter((r) => r.region in REGION_ORDER)
    .map((r) => ({
      id: r.id,
      region: r.region as RegionId,
      position: r.position,
      block_type: r.block_type,
      data: r.data ?? (r.template_id ? templates.get(r.template_id)?.data : undefined) ?? {},
      common: r.common ?? {},
    }))
    .sort((a, b) => REGION_ORDER[a.region] - REGION_ORDER[b.region] || a.position - b.position);
}

export function blocksInRegion(blocks: PageBlock[], region: RegionId): PageBlock[] {
  return blocks.filter((b) => b.region === region);
}

export type BlockTerm = { termId: string; catKey: string; catLabel: string; catFieldType: string; label: string; slug: string };

export type BlockCtx = {
  pageKind: "entry" | "content_page";
  /** Region the block is being rendered into (headings step down in the sidebar). */
  region: RegionId;
  entry?: { id: string; name: string; short_name?: string | null; city?: string | null; claimed?: boolean };
  /** The entry's held categorisation terms (tags, attributes). */
  terms?: BlockTerm[];
  filterHref?: (catKey: string, slug: string) => string;
  entryUrl?: (entryId: string) => string | null;
  breadcrumbHtml?: string;
  /** True when an entry_hero or hero block already provides the page's h1. */
  h1Taken?: boolean;
  /** True when the claim widget exists on the page, so a claim block can open it. */
  claimWidget?: boolean;
};

export type RenderedBlock = { html: string; jsonLd?: Record<string, unknown>[]; anchorId?: string; chipLabel?: string };

// ---------------------------------------------------------------- sanitiser

const RICH_TAGS = new Set(["p", "br", "strong", "b", "em", "i", "u", "a", "ul", "ol", "li", "h2", "h3", "h4", "blockquote"]);
const BASIC_TAGS = new Set(["br", "strong", "b", "em", "i", "a", "p"]);
const VOID_TAGS = new Set(["br"]);

function decodeBasicEntities(s: string): string {
  return s.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

/** http(s), mailto, tel, site-relative or in-page links only. */
export function safeHref(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // eslint-disable-next-line no-control-regex
  const v = decodeBasicEntities(String(raw)).replace(/[\u0000-\u001f\u007f\s]+/g, "");
  if (!v || v.length > 2000) return null;
  if (/^(https?:\/\/|mailto:|tel:)[^<>"]+$/i.test(v)) return v;
  if (/^(\/(?!\/)|#)[^<>"]*$/.test(v)) return v;
  return null;
}

/**
 * Allow-list sanitiser for rich text blocks. Keeps a small set of tags with no
 * attributes (links keep a validated href and get rel="noopener noreferrer"),
 * drops script/style/iframe/object/embed together with their content, and
 * escapes any stray angle bracket. Open tags are balanced.
 */
export function sanitiseRichHtml(input: unknown, mode: "rich" | "basic" = "rich"): string {
  if (typeof input !== "string" || input === "") return "";
  const allowed = mode === "basic" ? BASIC_TAGS : RICH_TAGS;
  let html = input.replace(/<\s*(script|style|iframe|object|embed|noscript|template)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  html = html.replace(/<!--[\s\S]*?-->/g, "");

  const TAG = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*?)?)\s*(\/?)\s*>/g;
  const stack: string[] = [];
  let out = "";
  let last = 0;
  const text = (s: string) => s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  for (let m = TAG.exec(html); m; m = TAG.exec(html)) {
    out += text(html.slice(last, m.index));
    last = m.index + m[0].length;
    const closing = m[1] === "/";
    const name = m[2].toLowerCase();
    if (!allowed.has(name)) continue;
    if (VOID_TAGS.has(name)) {
      if (!closing) out += `<${name}>`;
      continue;
    }
    if (closing) {
      const at = stack.lastIndexOf(name);
      if (at === -1) continue;
      while (stack.length > at) out += `</${stack.pop()}>`;
      continue;
    }
    if (name === "a") {
      const hm = m[3].match(/\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
      const href = safeHref(hm ? hm[1] ?? hm[2] ?? hm[3] : null);
      out += href ? `<a href="${escapeAttr(href)}" rel="noopener noreferrer">` : "<a>";
    } else {
      out += `<${name}>`;
    }
    stack.push(name);
  }
  out += text(html.slice(last));
  while (stack.length) out += `</${stack.pop()}>`;
  return out;
}

/** Plain text of an HTML fragment (for structured data and length checks). */
export function plainText(html: string): string {
  return decodeBasicEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------- small helpers

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const slugify = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function blockAnchorId(b: PageBlock): string | undefined {
  const a = str(b.common.anchorId);
  return /^[a-z][a-z0-9-]{0,59}$/.test(a) ? a : undefined;
}

function headingTag(ctx: BlockCtx, preferred?: string): string {
  if (ctx.region === "sidebar") return "h3";
  return preferred === "h3" ? "h3" : "h2";
}

const ICONS: Record<string, string> = {
  check: '<path d="M5 13l4 4L19 7"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  heart: '<path d="M12 20s-7-4.4-9-9a5 5 0 019-3 5 5 0 019 3c-2 4.6-9 9-9 9z"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 19c.6-3 3-4.5 6-4.5s5.4 1.5 6 4.5M16 5.5a3 3 0 010 5M18 14.5c1.7.6 2.8 2 3 4.5"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  pin: '<path d="M12 21s-6-5.5-6-11a6 6 0 0112 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 7.8-8 9-4.6-1.2-8-4.5-8-9V6z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
};

function icon(name: unknown): string {
  const path = typeof name === "string" ? ICONS[name] : undefined;
  return path
    ? `<span class="ds-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg></span>`
    : "";
}

/** { label, kind, target } -> a safe href, or null. */
function linkHref(link: unknown, ctx: BlockCtx): string | null {
  const l = obj(link);
  const target = str(l.target);
  if (!target) return null;
  if (l.kind === "url") return safeHref(target);
  if (l.kind === "anchor") return /^[a-z][a-z0-9-]{0,59}$/.test(target) ? `#${target}` : null;
  if (l.kind === "entry") return /^[A-Za-z0-9_-]{1,64}$/.test(target) && ctx.entryUrl ? ctx.entryUrl(target) : null;
  return null;
}

function trackAttrs(cta: string): string {
  return ` data-dm-event="listing_cta_click" data-dm-cta="${escapeAttr(cta)}"`;
}

function linkAnchor(link: unknown, ctx: BlockCtx, cls: string, cta: string, fallbackLabel = ""): string {
  const href = linkHref(link, ctx);
  if (!href) return "";
  const label = str(obj(link).label) || fallbackLabel;
  if (!label) return "";
  const external = /^https?:/i.test(href);
  return `<a class="${cls}" href="${escapeAttr(href)}"${external ? ' rel="noopener noreferrer"' : ""}${trackAttrs(cta)}>${escapeHtml(label)}</a>`;
}

function mergeFields(text: string, ctx: BlockCtx): string {
  const name = ctx.entry?.name ?? "";
  const short = ctx.entry?.short_name || name;
  return text.replace(/\{entry\.name\}/g, name).replace(/\{entry\.short_name\}/g, short);
}

function imageTag(img: unknown, cls: string, eager = false): string {
  const i = obj(img);
  const url = str(i.url);
  if (!/^https?:\/\/[^\s<>"]+$/i.test(url)) return "";
  return `<img class="${cls}" src="${escapeAttr(url)}" alt="${escapeAttr(str(i.alt))}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'}>`;
}

/** Wraps a block's inner markup with the shared section attributes. */
function wrap(b: PageBlock, inner: string, extraClass = ""): string {
  const theme = ["default", "inverse", "accent"].includes(str(b.common.theme)) ? str(b.common.theme) : "default";
  const vis = ["desktop", "mobile"].includes(str(b.common.visibility)) ? ` ds-vis-${str(b.common.visibility)}` : "";
  const style: string[] = [];
  for (const [key, prop] of [["spacingAbove", "margin-top"], ["spacingBelow", "margin-bottom"]] as const) {
    const v = str(b.common[key]);
    if (/^--ds-space-[1-8]$/.test(v)) style.push(`${prop}:var(${v})`);
  }
  const variants = obj(b.common.variants);
  const variantClasses = Object.entries(variants)
    .filter(([k, v]) => /^[a-zA-Z]{1,20}$/.test(k) && typeof v === "string" && /^[A-Za-z0-9-]{1,20}$/.test(v))
    .map(([k, v]) => ` ds-${k.toLowerCase()}-${String(v).toLowerCase()}`)
    .join("");
  const id = blockAnchorId(b);
  return `<section class="ds-block ds-block--${escapeAttr(b.block_type)}${extraClass ? ` ${extraClass}` : ""}${vis}${variantClasses}" data-theme="${theme}"${id ? ` id="${id}"` : ""}${style.length ? ` style="${style.join(";")}"` : ""}>${inner}</section>`;
}

function titleHtml(b: PageBlock, ctx: BlockCtx, preferred?: string): string {
  const t = str(b.data.title).trim();
  if (!t) return "";
  const tag = headingTag(ctx, preferred);
  return `<${tag} class="ds-block__title">${escapeHtml(t)}</${tag}>`;
}

// ---------------------------------------------------------------- block renderers

type Renderer = (b: PageBlock, ctx: BlockCtx) => RenderedBlock | null;

const renderRich: Renderer = (b, ctx) => {
  const body = sanitiseRichHtml(b.data.body, "rich");
  const lead = b.data.style === "lead" ? " ds-lead" : "";
  if (!body && !str(b.data.title)) return null;
  return { html: wrap(b, `${titleHtml(b, ctx)}<div class="prose${lead}">${body}</div>`) };
};

const renderHeading: Renderer = (b, ctx) => {
  const title = str(b.data.title).trim();
  if (!title) return null;
  const level = ["h2", "h3", "h4"].includes(str(b.data.level)) ? str(b.data.level) : "h2";
  const id = blockAnchorId(b) ?? (slugify(title).slice(0, 60) || undefined);
  const eyebrow = str(b.data.eyebrow).trim();
  const html = `<section class="ds-block ds-block--heading" data-theme="default"${id ? ` id="${escapeAttr(id)}"` : ""}>${eyebrow ? `<p class="ds-eyebrow">${escapeHtml(eyebrow)}</p>` : ""}<${level} class="ds-heading">${escapeHtml(title)}</${level}></section>`;
  return { html, anchorId: id, chipLabel: title };
};

const renderList: Renderer = (b, ctx) => {
  const items = arr(b.data.items).filter((i): i is string => typeof i === "string" && i.trim() !== "");
  if (items.length === 0) return null;
  const style = str(b.data.listStyle);
  const tag = style === "numbered" ? "ol" : "ul";
  const cls = style === "checklist" ? " ds-list--check" : "";
  return { html: wrap(b, `${titleHtml(b, ctx)}<${tag} class="ds-list${cls}">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</${tag}>`) };
};

const renderQuote: Renderer = (b) => {
  const quote = str(b.data.title).trim();
  const who = str(b.data.who).trim();
  if (!quote || !who) return null;
  const role = str(b.data.role).trim();
  return { html: wrap(b, `<blockquote class="ds-quote"><p>${escapeHtml(quote)}</p><footer>${escapeHtml(who)}${role ? `, <cite>${escapeHtml(role)}</cite>` : ""}</footer></blockquote>`) };
};

const renderCallout: Renderer = (b, ctx) => {
  const tone = ["info", "tip", "warning"].includes(str(b.data.tone)) ? str(b.data.tone) : "info";
  const body = sanitiseRichHtml(b.data.body, "basic");
  if (!body && !str(b.data.title)) return null;
  const tag = headingTag(ctx, "h3");
  const title = str(b.data.title).trim();
  return { html: wrap(b, `<aside class="ds-callout ds-callout--${tone}" role="note">${title ? `<${tag} class="ds-callout__title">${escapeHtml(title)}</${tag}>` : ""}<div class="ds-callout__body">${body}</div></aside>`) };
};

const renderFaq: Renderer = (b, ctx) => {
  const items = arr(b.data.items).map(obj).filter((i) => str(i.question).trim() && str(i.answer).trim());
  if (items.length === 0) return null;
  const group = b.data.expand === "one" || obj(b.common.variants).expand === "one" ? ` name="faq-${escapeAttr(b.id)}"` : "";
  const html = items
    .map((i, n) => `<details class="ds-faq__item"${group}${b.data.firstOpen === true && n === 0 ? " open" : ""}><summary data-dm-event="listing_faq_toggle" data-dm-cta="faq">${escapeHtml(str(i.question))}</summary><div class="prose">${sanitiseRichHtml(i.answer, "basic")}</div></details>`)
    .join("");
  const jsonLd = b.data.structuredData === false
    ? undefined
    : [{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: items.map((i) => ({ "@type": "Question", name: str(i.question), acceptedAnswer: { "@type": "Answer", text: plainText(sanitiseRichHtml(i.answer, "basic")) } })),
      }];
  return { html: wrap(b, `${titleHtml(b, ctx)}<div class="ds-faq">${html}</div>`), jsonLd };
};

const renderTable: Renderer = (b) => {
  const rows = arr(b.data.rows).map((r) => arr(r).map((c) => (typeof c === "string" ? c : "")));
  const caption = str(b.data.title).trim();
  if (rows.length === 0 || !caption) return null;
  const header = b.data.headerRow !== false;
  const head = header ? `<thead><tr>${rows[0].map((c) => `<th scope="col">${escapeHtml(c)}</th>`).join("")}</tr></thead>` : "";
  const bodyRows = (header ? rows.slice(1) : rows).map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("");
  return { html: wrap(b, `<div class="ds-table-wrap"><table class="ds-table"><caption>${escapeHtml(caption)}</caption>${head}<tbody>${bodyRows}</tbody></table></div>`) };
};

const renderDivider: Renderer = (b) => {
  const style = str(b.data.style);
  const inner = style === "space" ? '<div class="ds-divider ds-divider--space"></div>' : style === "diagonal" ? '<div class="ds-divider ds-divider--diagonal" aria-hidden="true"></div>' : '<hr class="ds-divider ds-divider--line">';
  return { html: wrap(b, inner) };
};

const renderStats: Renderer = (b, ctx) => {
  const items = arr(b.data.items).map(obj).filter((i) => str(i.value).trim());
  if (items.length === 0) return null;
  const overlap = b.data.overlapPrevious === true ? " ds-stats--overlap" : "";
  return {
    html: wrap(b, `${titleHtml(b, ctx)}<ul class="ds-stats">${items.map((i) => `<li><strong>${escapeHtml(str(i.value))}</strong><span>${escapeHtml(str(i.label))}</span></li>`).join("")}</ul>`, overlap.trim()),
  };
};

const renderCards: Renderer = (b, ctx) => {
  const items = arr(b.data.items).map(obj).filter((i) => str(i.heading).trim());
  if (items.length < 1) return null;
  const level = str(b.data.headingLevel) === "h3" ? "h3" : headingTag(ctx);
  const sub = level === "h2" ? "h3" : "h4";
  const cols = ["2", "3", "4"].includes(str(b.data.columns)) ? ` ds-cols-${str(b.data.columns)}` : "";
  const cards = items.map((i) => {
    const body = sanitiseRichHtml(i.body, "basic");
    const link = linkAnchor(i.link, ctx, "ds-card__link", "card", "Find out more");
    return `<li class="ds-card">${icon(i.icon)}<${sub} class="ds-card__heading">${escapeHtml(str(i.heading))}</${sub}>${body ? `<div class="ds-card__body">${body}</div>` : ""}${link}</li>`;
  }).join("");
  return { html: wrap(b, `${titleHtml(b, ctx, level)}<ul class="ds-cards${cols}">${cards}</ul>`) };
};

const renderMedia: Renderer = (b, ctx) => {
  const items = arr(b.data.items).map(obj).filter((i) => str(i.heading).trim());
  const img = imageTag(b.data.media, "ds-media__img");
  if (items.length === 0 && !img) return null;
  const style = ["numbered", "bulleted", "checklist"].includes(str(b.data.listStyle)) ? str(b.data.listStyle) : "numbered";
  const tag = style === "numbered" ? "ol" : "ul";
  const right = b.data.mediaPosition === "right" ? " ds-media--right" : "";
  const li = items.map((i) => `<li><strong>${escapeHtml(str(i.heading))}</strong>${str(i.body) ? `<span>${escapeHtml(str(i.body))}</span>` : ""}</li>`).join("");
  return { html: wrap(b, `${titleHtml(b, ctx)}<div class="ds-media${right}">${img ? `<figure class="ds-media__fig">${img}</figure>` : ""}<${tag} class="ds-list ds-list--${style}">${li}</${tag}></div>`) };
};

const renderChips: Renderer = (b) => {
  const items = arr(b.data.items).filter((i): i is string => typeof i === "string" && i.trim() !== "");
  if (items.length === 0) return null;
  const t = str(b.data.title).trim();
  return { html: wrap(b, `${t ? `<p class="ds-label">${escapeHtml(t)}</p>` : ""}<ul class="ds-chips">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`) };
};

const renderActions: Renderer = (b, ctx) => {
  const items = arr(b.data.items).map(obj).filter((i) => str(i.label).trim() && linkHref(i.link, ctx));
  if (items.length === 0) return null;
  const tag = headingTag(ctx, "h3");
  const title = str(b.data.title).trim();
  const sub = str(b.data.subtitle).trim();
  const band = b.data.headerStyle === "plain" ? "" : " ds-actions__head--band";
  const sticky = b.data.sticky === true && ctx.region === "sidebar" ? " ds-sticky" : "";
  const list = items.map((i) => {
    const href = linkHref(i.link, ctx)!;
    const external = /^https?:/i.test(href);
    return `<li><a class="ds-action" href="${escapeAttr(href)}"${external ? ' rel="noopener noreferrer"' : ""}${trackAttrs("action")}>${icon(i.icon)}<span class="ds-action__text"><strong>${escapeHtml(str(i.label))}</strong>${str(i.sublabel) ? `<span>${escapeHtml(str(i.sublabel))}</span>` : ""}</span></a></li>`;
  }).join("");
  return { html: wrap(b, `<div class="ds-actions__head${band}">${title ? `<${tag} class="ds-block__title">${escapeHtml(title)}</${tag}>` : ""}${sub ? `<p>${escapeHtml(sub)}</p>` : ""}</div><ul class="ds-actions">${list}</ul>`, `ds-actions-block${sticky}`.trim()) };
};

const renderTags: Renderer = (b, ctx) => {
  const sources = arr(b.data.sources).filter((s): s is string => typeof s === "string");
  const wantCat = sources.includes("category");
  const wantAttr = sources.includes("attributes");
  const chips: Array<{ label: string; href: string | null; highlight: boolean }> = [];
  const link = b.data.link !== "none";
  for (const t of ctx.terms ?? []) {
    const isCat = t.catFieldType === "single_select";
    if ((isCat && !wantCat) || (!isCat && !wantAttr)) continue;
    const label = t.catFieldType === "boolean" ? t.catLabel : t.label;
    chips.push({ label, href: link && ctx.filterHref ? ctx.filterHref(t.catKey, t.slug) : null, highlight: str(b.data.highlight) === t.termId });
  }
  if (sources.includes("region") && ctx.entry?.city) chips.push({ label: ctx.entry.city, href: null, highlight: false });
  if (chips.length === 0) return null;
  const max = Math.min(12, Math.max(1, typeof b.data.maxShown === "number" ? Math.floor(b.data.maxShown) : 6));
  const shown = chips.slice(0, max);
  const extra = chips.length - shown.length;
  const li = shown.map((c) => {
    const cls = `ds-tag${c.highlight ? " ds-tag--highlight" : ""}`;
    return c.href ? `<li><a class="${cls}" href="${escapeAttr(c.href)}"${trackAttrs("tag_chip")}>${escapeHtml(c.label)}</a></li>` : `<li><span class="${cls}">${escapeHtml(c.label)}</span></li>`;
  }).join("");
  return { html: wrap(b, `<ul class="ds-tags">${li}${extra > 0 ? `<li><span class="ds-tag ds-tag--more">+${extra}</span></li>` : ""}</ul>`) };
};

const renderAttrs: Renderer = (b, ctx) => {
  const overrides = obj(b.data.descriptions);
  const manual = b.data.source === "manual";
  const rows = (ctx.terms ?? [])
    .filter((t) => t.catFieldType !== "single_select")
    .map((t) => ({ label: t.catFieldType === "boolean" ? t.catLabel : t.label, text: str(overrides[t.termId]).trim() }))
    .filter((r) => (manual ? r.text !== "" : true));
  if (rows.length === 0) return null;
  const foot = linkAnchor(b.data.footerLink, ctx, "ds-attrs__foot", "attrs");
  return { html: wrap(b, `${titleHtml(b, ctx, "h3")}<dl class="ds-attrs">${rows.map((r) => `<div><dt>${escapeHtml(r.label)}</dt>${r.text ? `<dd>${escapeHtml(r.text)}</dd>` : ""}</div>`).join("")}</dl>${foot}`) };
};

const renderHero: Renderer = (b, ctx) => {
  const title = str(b.data.title).trim();
  if (!title) return null;
  const tag = ctx.h1Taken ? "h2" : "h1";
  const intro = str(b.data.intro).trim();
  const img = b.data.media === "none" ? "" : imageTag(b.data.mediaAsset, "ds-hero__img", true);
  const overlay = ["left-fade", "bottom-fade", "full", "none"].includes(str(b.data.overlay)) ? str(b.data.overlay) : "left-fade";
  const crumb = b.data.showBreadcrumb !== false && ctx.breadcrumbHtml ? ctx.breadcrumbHtml : "";
  const actions = [linkAnchor(b.data.primaryAction, ctx, "btn btn-primary", "hero_primary"), linkAnchor(b.data.secondaryAction, ctx, "btn btn-ghost", "hero_secondary")].filter(Boolean).join("");
  return {
    html: wrap(b, `${img}<div class="ds-hero__shade ds-hero__shade--${overlay}"></div><div class="wrap ds-hero__inner">${crumb}${icon(b.data.icon)}<${tag} class="ds-hero__title">${escapeHtml(title)}</${tag}>${intro ? `<p class="ds-hero__intro">${escapeHtml(intro)}</p>` : ""}${actions ? `<div class="ds-hero__actions">${actions}</div>` : ""}</div>`),
  };
};

const renderClaim: Renderer = (b, ctx) => {
  if (ctx.entry?.claimed) return null;
  const title = mergeFields(str(b.data.title), ctx).trim();
  if (!title) return null;
  const body = mergeFields(str(b.data.body), ctx).trim();
  const tag = headingTag(ctx, "h3");
  const link = linkAnchor(b.data.primaryAction, ctx, "btn btn-primary", "claim");
  const opener = !link && ctx.claimWidget ? `<button type="button" class="btn btn-primary" data-dm-event="listing_cta_click" data-dm-cta="claim" data-dm-claim-open>Claim this listing</button>` : "";
  const secondary = linkAnchor(b.data.secondaryLink, ctx, "ds-claim__secondary", "claim_secondary");
  const layout = b.data.layout === "stacked" || (b.data.layout !== "banner" && ctx.region === "sidebar") ? "stacked" : "banner";
  return { html: wrap(b, `<div class="ds-claim ds-claim--${layout}">${icon(b.data.icon)}<div class="ds-claim__text"><${tag} class="ds-block__title">${escapeHtml(title)}</${tag}>${body ? `<p>${escapeHtml(body)}</p>` : ""}</div><div class="ds-claim__actions">${link}${opener}${secondary}</div></div>`) };
};

const RENDERERS: Record<string, Renderer> = {
  rich: renderRich, heading: renderHeading, list: renderList, quote: renderQuote, callout: renderCallout,
  faq: renderFaq, table: renderTable, divider: renderDivider, stats: renderStats, cards: renderCards,
  media: renderMedia, chips: renderChips, actions: renderActions, tags: renderTags, attrs: renderAttrs,
  hero: renderHero, claim: renderClaim,
};

/** Several FAQ blocks on one page become a single FAQPage (search engines want one). Other graphs pass through. */
export function mergeFaqJsonLd(graphs: Record<string, unknown>[]): Record<string, unknown>[] {
  const faqs = graphs.filter((g) => g["@type"] === "FAQPage");
  const rest = graphs.filter((g) => g["@type"] !== "FAQPage");
  if (faqs.length === 0) return rest;
  const mainEntity = faqs.flatMap((g) => (Array.isArray(g.mainEntity) ? g.mainEntity : []));
  return [...rest, { "@context": "https://schema.org", "@type": "FAQPage", mainEntity }];
}

/** True for the generic (registry) block types this module renders itself. */
export function isGenericBlock(type: string): boolean {
  return type in RENDERERS;
}

/** Renders one generic block; null when it has nothing to show (renders no wrapper). Unknown types render nothing. */
export function renderGenericBlock(b: PageBlock, ctx: BlockCtx): RenderedBlock | null {
  const r = RENDERERS[b.block_type];
  if (!r) return null;
  const out = r(b, ctx);
  if (!out) return null;
  const anchorId = out.anchorId ?? blockAnchorId(b);
  const chipLabel = out.chipLabel ?? (anchorId ? str(b.data.title).trim() || undefined : undefined);
  return { ...out, anchorId, chipLabel };
}

// ---------------------------------------------------------------- styles

/**
 * --ds-* tokens, defined from the directory's existing theme variables so a
 * directory looks like itself with no extra configuration. A theme overrides
 * token values (never the names); names are a stable API.
 */
export const BLOCK_STYLE = `
  :root {
    --ds-color-bg: var(--bg); --ds-color-surface: var(--surface); --ds-color-subtle-bg: var(--surface-2);
    --ds-color-ink: var(--ink); --ds-color-ink-muted: var(--muted); --ds-color-border: var(--line);
    --ds-color-link: var(--primary);
    --ds-color-inverse-bg: var(--ink); --ds-color-on-inverse: var(--bg); --ds-color-on-inverse-muted: var(--surface-2);
    --ds-color-accent: var(--primary); --ds-color-on-accent: #fff; --ds-color-focus: var(--primary);
    --ds-color-callout-edge: var(--primary);
    --ds-color-callout-info: var(--surface-2); --ds-color-callout-tip: var(--sage, var(--surface-2)); --ds-color-callout-warning: #fdebd3;
    --ds-color-category: var(--primary); --ds-color-icon: var(--ds-color-category);
    --ds-color-icon-bg: color-mix(in srgb, var(--ds-color-category) 14%, white);
    --ds-font-display: var(--font-heading); --ds-font-body: var(--font-body);
    --ds-text-h2: calc(var(--fs-h2) * 0.6875); --ds-text-h3: calc(var(--fs-h3) * 0.9); --ds-text-body: var(--fs-base);
    --ds-text-small: 14px; --ds-text-label: 12.5px; --ds-text-stat: 30px; --ds-measure: 68ch;
    --ds-space-1: 4px; --ds-space-2: 8px; --ds-space-3: 12px; --ds-space-4: 16px;
    --ds-space-5: 24px; --ds-space-6: 32px; --ds-space-7: 48px; --ds-space-8: 56px;
    --ds-sticky-offset: 24px; --ds-hero-min-height: 420px; --ds-logo-size: 64px;
    --ds-radius-sm: 6px; --ds-radius-md: 12px; --ds-radius-lg: 16px; --ds-radius-xl: 22px; --ds-radius-pill: 999px;
    --ds-shadow-1: 0 8px 24px rgb(0 0 0 / 0.12); --ds-shadow-2: 0 14px 36px rgb(0 0 0 / 0.14);
    --ds-overlay: linear-gradient(90deg, rgb(0 0 0 / 0.78) 0%, rgb(0 0 0 / 0.5) 45%, rgb(0 0 0 / 0.05) 85%);
    --ds-motion-fast: 200ms;
    --ds-button-primary-bg: var(--ds-color-accent); --ds-button-primary-fg: var(--ds-color-on-accent);
    --ds-marker-bg: var(--ds-color-inverse-bg); --ds-marker-fg: var(--ds-color-on-inverse);
  }
  @media (prefers-reduced-motion: reduce) { :root { --ds-motion-fast: 0ms; } }

  .ds-block { margin: 0; min-width: 0; }
  .ds-page-main > .ds-block { margin-top: var(--ds-space-6); }
  .ds-page-side { margin-top: var(--ds-space-6); }
  /* Same rhythm as .dir-entry-section so a converted page spaces out exactly as before. Existing sections are not touched. */
  .dir-entry-main > .ds-block { padding-top: 28px; scroll-margin-top: 62px; }
  .dir-aside > .ds-block { background: var(--ds-color-surface); border: 1px solid var(--ds-color-border); border-radius: var(--ds-radius-lg); padding: var(--ds-space-5); }
  .dir-entry-main > .ds-block[data-theme="inverse"], .ds-block[data-theme="inverse"] { background: var(--ds-color-inverse-bg); color: var(--ds-color-on-inverse); border-radius: var(--ds-radius-lg); padding: var(--ds-space-5); }
  .dir-entry-main > .ds-block[data-theme="accent"], .ds-block[data-theme="accent"] { background: var(--ds-color-accent); color: var(--ds-color-on-accent); border-radius: var(--ds-radius-lg); padding: var(--ds-space-5); }
  .ds-block__title { font-family: var(--ds-font-display); font-size: var(--ds-text-h2); line-height: 1.25; margin: 0 0 18px; }
  .dir-aside .ds-block__title { font-size: var(--ds-text-h3); }
  .ds-label, .ds-eyebrow { font-size: var(--ds-text-label); font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--ds-color-ink-muted); margin: 0 0 var(--ds-space-3); }
  .ds-heading { font-family: var(--ds-font-display); margin: 0; }
  .ds-lead { font-size: calc(var(--ds-text-body) * 1.2); }
  .ds-block .prose { max-width: var(--ds-measure); }
  .ds-block .prose a, .ds-callout a { color: var(--ds-color-link); text-decoration: underline; }
  .ds-block :focus-visible { outline: 3px solid var(--ds-color-focus); outline-offset: 2px; }

  .ds-icon { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: var(--ds-radius-md); background: var(--ds-color-icon-bg); color: var(--ds-color-icon); flex: none; }
  [data-theme="inverse"] .ds-icon { background: var(--ds-color-accent); color: var(--ds-color-on-accent); }

  .ds-list { margin: 0; padding-left: 1.2em; display: flex; flex-direction: column; gap: var(--ds-space-2); max-width: var(--ds-measure); }
  .ds-list--check { list-style: none; padding-left: 0; }
  .ds-list--check li::before { content: "\\2713"; margin-right: var(--ds-space-2); color: var(--ds-color-accent); font-weight: 700; }
  .ds-columns-2 .ds-list, .ds-columns-2.ds-block--list .ds-list { columns: 2; }
  .ds-quote { margin: 0; padding-left: var(--ds-space-5); border-left: 4px solid var(--ds-color-accent); font-family: var(--ds-font-display); font-size: var(--ds-text-h3); }
  .ds-quote footer { margin-top: var(--ds-space-2); font-family: var(--ds-font-body); font-size: var(--ds-text-small); color: var(--ds-color-ink-muted); }
  .ds-callout { border-left: 4px solid var(--ds-color-callout-edge); border-radius: var(--ds-radius-md); padding: var(--ds-space-4); background: var(--ds-color-callout-info); color: var(--ds-color-ink); }
  .ds-callout--tip { background: var(--ds-color-callout-tip); }
  .ds-callout--warning { background: var(--ds-color-callout-warning); }
  .ds-callout__title { margin: 0 0 var(--ds-space-2); font-size: var(--ds-text-h3); }
  .ds-callout__body > :last-child { margin-bottom: 0; }

  .ds-faq { display: flex; flex-direction: column; border-top: 1px solid var(--ds-color-border); }
  .ds-faq__item { border-bottom: 1px solid var(--ds-color-border); padding: var(--ds-space-3) 0; }
  .ds-faq__item summary { cursor: pointer; font-weight: 600; font-size: var(--ds-text-h3); min-height: 44px; display: flex; align-items: center; }
  .ds-faq__item[open] summary { color: var(--ds-color-link); }
  .ds-table-wrap { overflow-x: auto; }
  .ds-table { width: 100%; border-collapse: collapse; font-size: var(--ds-text-small); }
  .ds-table caption { text-align: left; font-weight: 700; margin-bottom: var(--ds-space-2); }
  .ds-table th, .ds-table td { text-align: left; padding: var(--ds-space-2) var(--ds-space-3); border-bottom: 1px solid var(--ds-color-border); }
  .ds-table th { background: var(--ds-color-subtle-bg); }
  .ds-striped-on tbody tr:nth-child(even) { background: var(--ds-color-subtle-bg); }
  .ds-divider--line { border: 0; border-top: 1px solid var(--ds-color-border); margin: 0; }
  .ds-divider--space { height: var(--ds-space-6); }
  .ds-divider--diagonal { height: 48px; background: var(--ds-color-inverse-bg); clip-path: polygon(0 100%, 100% 0, 100% 100%); }

  .ds-stats { list-style: none; margin: 0; padding: var(--ds-space-5); display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--ds-space-4); background: var(--ds-color-surface); border: 1px solid var(--ds-color-border); border-radius: var(--ds-radius-lg); box-shadow: var(--ds-shadow-1); }
  .ds-stats strong { display: block; font-family: var(--ds-font-display); font-size: var(--ds-text-stat); color: var(--ds-color-category); }
  .ds-stats span { font-size: var(--ds-text-small); color: var(--ds-color-ink-muted); }
  .ds-stats--overlap { margin-top: -48px; position: relative; }

  .ds-cards { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--ds-space-4); grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .ds-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); } .ds-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); } .ds-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .ds-card { background: var(--ds-color-surface); border: 1px solid var(--ds-color-border); border-radius: var(--ds-radius-lg); padding: var(--ds-space-5); display: flex; flex-direction: column; gap: var(--ds-space-2); color: var(--ds-color-ink); }
  .ds-card__heading { margin: 0; font-size: var(--ds-text-h3); }
  .ds-card__body > :last-child { margin-bottom: 0; }
  .ds-card__link { font-weight: 600; margin-top: auto; text-decoration: underline; min-height: 44px; display: inline-flex; align-items: center; }
  .ds-card__link { color: var(--ds-color-link); }
  .ds-density-compact .ds-card { padding: var(--ds-space-4); }
  .ds-card-outline .ds-card { background: transparent; }

  .ds-media { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: var(--ds-space-6); align-items: center; }
  .ds-media--right .ds-media__fig { order: 2; }
  .ds-media__img { width: 100%; height: auto; border-radius: var(--ds-radius-lg); display: block; }
  .ds-mediatilt-on .ds-media__img { transform: rotate(var(--ds-tilt-angle, -1.5deg)); }
  .ds-media__fig { margin: 0; }
  .ds-list--numbered, .ds-list--bulleted, .ds-list--checklist { max-width: none; }
  .ds-media li { display: flex; flex-direction: column; }
  .ds-media li span { color: var(--ds-color-ink-muted); font-size: var(--ds-text-small); }

  .ds-chips, .ds-tags { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--ds-space-2); }
  .ds-chips li, .ds-tag { display: inline-flex; align-items: center; background: var(--ds-color-subtle-bg); color: var(--ds-color-ink); border-radius: var(--ds-radius-pill); padding: 6px 12px; font-size: var(--ds-text-small); font-weight: 500; text-decoration: none; min-height: 32px; }
  a.ds-tag { min-height: 44px; } a.ds-tag:hover { background: var(--ds-color-border); }
  .ds-tag--highlight { background: var(--ds-color-category); color: #fff; }

  .ds-actions { list-style: none; margin: 0; padding: 0; }
  .ds-actions__head--band { background: var(--ds-color-accent); color: var(--ds-color-on-accent); padding: var(--ds-space-4) var(--ds-space-5); margin: calc(var(--ds-space-5) * -1) calc(var(--ds-space-5) * -1) 0; border-radius: var(--ds-radius-lg) var(--ds-radius-lg) 0 0; }
  .ds-actions__head--band .ds-block__title { margin: 0; }
  .ds-actions__head p { margin: var(--ds-space-1) 0 0; font-size: var(--ds-text-small); }
  .ds-action { display: flex; align-items: center; gap: var(--ds-space-3); padding: var(--ds-space-3) 0; border-bottom: 1px solid var(--ds-color-border); text-decoration: none; color: var(--ds-color-ink); min-height: 44px; }
  .ds-action__text { display: flex; flex-direction: column; } .ds-action__text span { font-size: var(--ds-text-small); color: var(--ds-color-ink-muted); }
  .dir-aside .ds-sticky { position: sticky; top: var(--ds-sticky-offset); }

  .ds-attrs { margin: 0; display: flex; flex-direction: column; gap: var(--ds-space-3); }
  .ds-attrs dt { font-weight: 600; } .ds-attrs dd { margin: 2px 0 0; font-size: var(--ds-text-small); color: var(--ds-color-ink-muted); }
  [data-theme="inverse"] .ds-attrs dd { color: var(--ds-color-on-inverse-muted); }
  .ds-attrs__foot { display: inline-block; margin-top: var(--ds-space-3); font-weight: 600; text-decoration: underline; color: var(--ds-color-link); min-height: 44px; }

  .ds-block--hero { position: relative; display: flex; align-items: flex-end; min-height: var(--ds-hero-min-height); background: var(--ds-color-inverse-bg); color: var(--ds-color-on-inverse); overflow: hidden; }
  .ds-height-s { min-height: 300px; } .ds-height-l { min-height: 560px; }
  .ds-hero__img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .ds-hero__shade { position: absolute; inset: 0; }
  .ds-hero__shade--left-fade { background: var(--ds-overlay); }
  .ds-hero__shade--bottom-fade { background: linear-gradient(to top, rgb(0 0 0 / 0.85), rgb(0 0 0 / 0)); }
  .ds-hero__shade--full { background: rgb(0 0 0 / 0.55); } .ds-hero__shade--none { display: none; }
  .ds-hero__inner { position: relative; padding-top: var(--ds-space-7); padding-bottom: var(--ds-space-7); width: 100%; }
  .ds-hero__title { font-family: var(--ds-font-display); font-size: clamp(36px, 7vw, 72px); line-height: 1; margin: 0 0 var(--ds-space-3); }
  .ds-align-centre .ds-hero__inner { text-align: center; }
  .ds-hero__intro { font-size: calc(var(--ds-text-body) * 1.2); max-width: 52ch; margin: 0 0 var(--ds-space-4); }
  .ds-hero__actions { display: flex; flex-wrap: wrap; gap: var(--ds-space-3); }

  .ds-claim { display: flex; align-items: center; gap: var(--ds-space-4); flex-wrap: wrap; background: var(--ds-color-subtle-bg); border: 1px solid var(--ds-color-border); border-left: 4px solid var(--ds-color-callout-edge); border-radius: var(--ds-radius-md); padding: var(--ds-space-4) var(--ds-space-5); }
  .ds-claim--stacked { flex-direction: column; align-items: flex-start; }
  .ds-claim__text { flex: 1 1 240px; min-width: 0; } .ds-claim__text p { margin: 0; color: var(--ds-color-ink-muted); font-size: var(--ds-text-small); }
  .ds-claim__text .ds-block__title { margin-bottom: var(--ds-space-1); }
  .ds-claim__actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ds-space-3); }
  .ds-claim__secondary { font-weight: 600; text-decoration: underline; color: var(--ds-color-link); }

  .ds-vis-desktop { display: block; } .ds-vis-mobile { display: none; }
  @media (max-width: 899px) {
    .ds-vis-desktop { display: none; } .ds-vis-mobile { display: block; }
    .ds-media { grid-template-columns: minmax(0, 1fr); } .ds-media--right .ds-media__fig { order: 0; }
    .ds-cols-3, .ds-cols-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .dir-aside .ds-sticky { position: static; }
    .ds-stats--overlap { margin-top: 0; }
  }
  @media (max-width: 560px) { .ds-cols-2, .ds-cols-3, .ds-cols-4 { grid-template-columns: minmax(0, 1fr); } }
`;

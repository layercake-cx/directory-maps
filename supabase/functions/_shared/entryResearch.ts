// Stage 1 of AI listing generation: research. Collects the supplier's own website pages and, where the
// configured AI provider supports it, independent sources via web search, and returns structured,
// source-backed findings. The write stage only ever sees these findings, never the entry's
// placeholder notes, so the listing is built from research and not from the database record.
//
// If research does not turn up enough, ResearchInsufficientError is thrown and the caller must NOT
// write or overwrite anything.

import { AiUnavailableError, directoryMapsContext, generate, requireToolInput } from "./ai/gateway.ts";
import type { AiScope } from "./ai/gateway.ts";
import type { AiMessage, AiToolDef } from "./ai/types.ts";

const TOOL_NAME = "record_research";

export type EntryResearch = {
  business_summary: string;
  history_and_story: string[];
  products: string[];
  producers_and_sourcing: string[];
  philosophy_and_practices: string[];
  verified_certifications: { name: string; evidence: string }[];
  /** Specific, interesting, supplier-only facts: the hooks the listing is built around. */
  distinctive_details: string[];
  sources: { url: string; title: string }[];
  /** Internal only. Never published. */
  unverified_or_missing: string[];
  confidence: "good" | "partial" | "poor";
};

export type ResearchEntry = {
  name: string;
  address: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  website_url: string | null;
};

/** Research did not find enough to write a worthwhile listing. The existing listing must be left alone. */
export class ResearchInsufficientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchInsufficientError";
  }
}

// ── Fetching the supplier's own website ────────────────────────────────────────────────────────────

const USER_AGENT = "LayercakeDirectoryResearch/1.0";
const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;
const MAX_PAGE_CHARS = 5000;
const MAX_TOTAL_CHARS = 16000;
const MAX_EXTRA_PAGES = 3;

/**
 * The URL is admin-entered data, so it is fetched from a server: only public http(s) hosts are allowed.
 * Blocks localhost, private/link-local IPv4 literals, IPv6 literals, credentials in the URL and single-label hosts.
 * (DNS names that resolve to private addresses are not detected here; the functions run with no access to a private network.)
 */
export function parsePublicUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return null;
  if (host.includes(":") || host.startsWith("[")) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return null;
  }
  if (!host.includes(".")) return null;
  return u;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));
}

/** Readable text from an HTML page: drops scripts, styles, navigation chrome and tags. */
export function htmlToText(html: string): string {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
  const meta = /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1] ?? "";
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|nav|footer|form|iframe)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const text = decodeEntities(body).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  return [title && `Page title: ${decodeEntities(title).trim()}`, meta && `Meta description: ${decodeEntities(meta).trim()}`, text]
    .filter(Boolean)
    .join("\n");
}

const LINK_KEYWORDS = ["about", "story", "our-", "farm", "ethos", "who-we", "how-it-works", "how-we", "products", "boxes", "sourcing", "produce", "organic", "philosophy", "values", "history", "meet", "growers", "producers"];
const SKIP_EXT = /\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|css|js)(\?|$)/i;

/** Up to `limit` same-site links most likely to explain who the supplier is and what they sell. */
export function pickInformativeLinks(html: string, base: URL, limit = MAX_EXTRA_PAGES): string[] {
  const scored = new Map<string, number>();
  const re = /<a\b[^>]*\bhref=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let target: URL;
    try {
      target = new URL(m[1], base);
    } catch {
      continue;
    }
    if (target.hostname !== base.hostname || SKIP_EXT.test(target.pathname)) continue;
    target.hash = "";
    const path = target.pathname.toLowerCase();
    if (path === "/" || path === base.pathname.toLowerCase()) continue;
    const label = decodeEntities(m[2].replace(/<[^>]+>/g, " ")).toLowerCase();
    let score = 0;
    for (const k of LINK_KEYWORDS) {
      if (path.includes(k)) score += 2;
      if (label.includes(k.replace(/-$/, ""))) score += 1;
    }
    if (score > 0) scored.set(target.toString(), Math.max(scored.get(target.toString()) ?? 0, score));
  }
  return [...scored.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([u]) => u);
}

async function fetchHtml(start: URL): Promise<{ url: URL; html: string } | null> {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: "manual",
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      return null;
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      const next = loc ? parsePublicUrl(new URL(loc, current).toString()) : null;
      if (!next) return null;
      current = next;
      continue;
    }
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!/html|text/i.test(type)) return null;
    const html = (await res.text()).slice(0, 400_000);
    return { url: current, html };
  }
  return null;
}

export type SupplierPage = { url: string; text: string };

/** The homepage plus up to three informative same-site pages, as readable text. Never throws: failures just mean fewer pages. */
export async function gatherSupplierPages(websiteUrl: string | null): Promise<SupplierPage[]> {
  const start = parsePublicUrl(websiteUrl);
  if (!start) return [];
  const home = await fetchHtml(start);
  if (!home) return [];
  const pages: SupplierPage[] = [{ url: home.url.toString(), text: htmlToText(home.html).slice(0, MAX_PAGE_CHARS) }];
  let total = pages[0].text.length;
  for (const link of pickInformativeLinks(home.html, home.url)) {
    if (total >= MAX_TOTAL_CHARS) break;
    const target = parsePublicUrl(link);
    if (!target) continue;
    const page = await fetchHtml(target);
    if (!page) continue;
    const text = htmlToText(page.html).slice(0, Math.min(MAX_PAGE_CHARS, MAX_TOTAL_CHARS - total));
    if (text.length < 200) continue;
    pages.push({ url: page.url.toString(), text });
    total += text.length;
  }
  return pages;
}

// ── The research call ──────────────────────────────────────────────────────────────────────────────

const STRING_ARRAY = { type: "array", items: { type: "string" } };

const RESEARCH_TOOL: AiToolDef = {
  name: TOOL_NAME,
  description: "Record the structured, source-backed research findings for this supplier.",
  inputSchema: {
    type: "object",
    properties: {
      business_summary: { type: "string", description: "What the business is and does, in one or two plain sentences." },
      history_and_story: { ...STRING_ARRAY, description: "Founding story, people, milestones: specific, sourced facts." },
      products: { ...STRING_ARRAY, description: "Specific products, box formats, ranges and what makes them appealing." },
      producers_and_sourcing: { ...STRING_ARRAY, description: "Named farms, growers or producers and where food comes from." },
      philosophy_and_practices: { ...STRING_ARRAY, description: "Farming methods, ethos, values and how they put them into practice." },
      verified_certifications: {
        type: "array",
        items: { type: "object", properties: { name: { type: "string" }, evidence: { type: "string" } }, required: ["name", "evidence"] },
        description: "Only certifications or credentials confirmed by a source, with the evidence.",
      },
      distinctive_details: { ...STRING_ARRAY, description: "The most interesting, specific facts only this supplier could claim. At least three if the research supports it." },
      sources: {
        type: "array",
        items: { type: "object", properties: { url: { type: "string" }, title: { type: "string" } }, required: ["url", "title"] },
        description: "Every page the facts above came from. Do not include individual customer reviews.",
      },
      unverified_or_missing: { ...STRING_ARRAY, description: "Internal notes: claims you could not confirm and information you could not find." },
      confidence: { type: "string", enum: ["good", "partial", "poor"], description: "How well the research supports a genuinely informative listing." },
    },
    required: ["business_summary", "distinctive_details", "sources", "unverified_or_missing", "confidence"],
  },
};

const RESEARCH_SYSTEM =
  "You are a careful food-and-drink researcher preparing notes for an editor. " +
  "Research one supplier: read the supplier's own website pages provided, and use web search to find independent sources " +
  "(press, producer or certifier listings, review sites) that confirm or add to what the supplier says about itself. " +
  "Summarise review sites in general terms only; never record individual customer reviews. " +
  "Record only facts you can support from the pages provided or from sources you found, and list those sources. " +
  "Prefer specific, vivid, checkable details (named farms, methods, products, dates, people) over generalities. " +
  "Anything you cannot confirm, and anything you could not find, goes in unverified_or_missing. Never guess or fill gaps. " +
  `Finish by calling the ${TOOL_NAME} tool.`;

function strings(v: unknown, max = 12): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean).slice(0, max).map((s) => s.slice(0, 500));
}

/** Coerces the model's tool input into a well-formed EntryResearch, dropping anything malformed. */
export function normaliseResearch(input: Record<string, unknown>): EntryResearch {
  const certs = Array.isArray(input.verified_certifications) ? input.verified_certifications : [];
  const sources = Array.isArray(input.sources) ? input.sources : [];
  const confidence = input.confidence === "good" || input.confidence === "partial" ? input.confidence : "poor";
  return {
    business_summary: typeof input.business_summary === "string" ? input.business_summary.trim().slice(0, 600) : "",
    history_and_story: strings(input.history_and_story),
    products: strings(input.products),
    producers_and_sourcing: strings(input.producers_and_sourcing),
    philosophy_and_practices: strings(input.philosophy_and_practices),
    verified_certifications: certs
      .filter((c): c is { name: string; evidence: string } => !!c && typeof c.name === "string" && typeof c.evidence === "string")
      .slice(0, 8)
      .map((c) => ({ name: c.name.trim().slice(0, 200), evidence: c.evidence.trim().slice(0, 300) })),
    distinctive_details: strings(input.distinctive_details, 10),
    sources: sources
      .filter((s): s is { url: string; title: string } => !!s && typeof s.url === "string" && /^https?:\/\//i.test(s.url))
      .slice(0, 12)
      .map((s) => ({ url: s.url.trim().slice(0, 500), title: typeof s.title === "string" ? s.title.trim().slice(0, 200) : "" })),
    unverified_or_missing: strings(input.unverified_or_missing, 15),
    confidence,
  };
}

/** Throws ResearchInsufficientError unless the findings can support a listing with real substance. */
export function assertResearchSufficient(research: EntryResearch, entryName: string, hadWebsite: boolean): void {
  const reasons: string[] = [];
  if (research.confidence === "poor") reasons.push("the research was not confident enough");
  if (research.distinctive_details.length < 3) reasons.push(`only ${research.distinctive_details.length} distinctive detail${research.distinctive_details.length === 1 ? "" : "s"} found (3 needed)`);
  if (research.sources.length === 0) reasons.push("no sources were found");
  if (reasons.length === 0) return;
  const hint = hadWebsite ? "Check the website address is correct and publicly reachable." : "This entry has no website address, which gives research little to go on.";
  throw new ResearchInsufficientError(`Couldn't research ${entryName} well enough to write a listing: ${reasons.join("; ")}. ${hint} The existing listing was left unchanged.`);
}

function researchMessage(entry: ResearchEntry, pages: SupplierPage[], brief: string): string {
  const where = [entry.address, entry.city, entry.postcode, entry.country].filter(Boolean).join(", ");
  return [
    `Supplier: ${entry.name}`,
    where ? `Location on record: ${where}` : null,
    entry.website_url ? `Website: ${entry.website_url}` : "Website: none on record",
    "",
    "What the directory wants to know (use it to decide what to look for; the editor writes the listing later):",
    brief.slice(0, 4000),
    "",
    pages.length
      ? "Pages fetched from the supplier's own website:\n\n" + pages.map((p) => `--- ${p.url}\n${p.text}`).join("\n\n")
      : "No pages could be fetched from the supplier's website. Rely on web search if it is available, and say what you could not confirm.",
    "",
    `Now research this supplier and call ${TOOL_NAME}.`,
  ].filter((l) => l !== null).join("\n");
}

/**
 * Researches one supplier. Uses provider web search when the organisation's AI provider supports it;
 * otherwise falls back to the supplier's own pages only, and the sufficiency check decides whether that is enough.
 */
export async function researchEntry(scope: AiScope, entry: ResearchEntry, brief: string): Promise<EntryResearch> {
  const pages = await gatherSupplierPages(entry.website_url);
  const ctx = directoryMapsContext(scope, "content_generation");
  const messages: AiMessage[] = [{ role: "user", content: researchMessage(entry, pages, brief) }];

  const forced = { type: "tool", name: TOOL_NAME } as const;
  let result;
  try {
    result = await generate(ctx, {
      maxTokens: 4096,
      system: RESEARCH_SYSTEM,
      tools: [RESEARCH_TOOL],
      toolChoice: { type: "auto" },
      webSearch: { maxUses: 4 },
      messages,
    });
  } catch (err) {
    if (!(err instanceof AiUnavailableError) || err.code !== "capability_unsupported") throw err;
    result = await generate(ctx, { maxTokens: 4096, system: RESEARCH_SYSTEM, tools: [RESEARCH_TOOL], toolChoice: forced, messages });
  }

  if (!result.toolCalls.some((c) => c.name === TOOL_NAME)) {
    // The model searched (or paused mid-search) without recording yet: hand its work back and require the tool call.
    result = await generate(ctx, {
      maxTokens: 4096,
      system: RESEARCH_SYSTEM,
      tools: [RESEARCH_TOOL],
      toolChoice: forced,
      messages: [
        ...messages,
        { role: "assistant", content: [{ type: "provider_raw", provider: result.provider, blocks: result.rawAssistantContent }] },
        { role: "user", content: `Call ${TOOL_NAME} now with your findings.` },
      ],
    });
  }

  const research = normaliseResearch(requireToolInput(result, TOOL_NAME));
  assertResearchSufficient(research, entry.name, !!entry.website_url);
  return research;
}

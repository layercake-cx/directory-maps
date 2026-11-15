// Shared core for directory AI content generation — the one Claude-calling
// implementation used by both generate_entry_content (synchronous, single
// entry) and process_entry_content_jobs (batch worker, cron-invoked). See
// docs/FEATURES.md §4.4g and 20260906120000_create_directory_ai_content_generation.sql.
//
// LLM calls go through the AI Gateway (./ai/gateway.ts), which resolves the
// organisation's provider, model and credentials and meters usage.

import { createServiceClient } from "./supabase.ts";
import { AiScope, directoryMapsContext, generate, requireToolInput } from "./ai/gateway.ts";
import { researchEntry, type EntryResearch } from "./entryResearch.ts";
import { validateListing } from "./entryListingQuality.ts";

const TOOL_NAME = "write_entry_content";

// Mirrors src/lib/sanitizeHtml.js's ALLOWED_TAGS/ALLOWED_ATTR exactly — kept
// as a second, independent implementation (not imported) because that file
// uses DOMPurify, a browser-DOM-dependent library not available in this Deno
// runtime. This is a defense-in-depth pass on our own model's output, not a
// general-purpose HTML sanitizer for untrusted third-party input: the system
// prompt below already constrains the model to this same tag set.
const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li",
  "h2", "h3", "h4", "blockquote", "a", "img", "span", "div",
]);
const ALLOWED_ATTR = new Set(["href", "src", "alt", "title", "target", "rel"]);
const SAFE_URI = /^(?:https?:|mailto:|tel:|\/|#)/i;

function stripDisallowedAttrs(tagMatch: string, tagName: string): string {
  const isClosing = tagMatch.startsWith("</");
  if (isClosing) return `</${tagName}>`;
  const selfClosing = /\/>$/.test(tagMatch);
  const attrRe = /([a-zA-Z-]+)\s*=\s*"([^"]*)"|([a-zA-Z-]+)\s*=\s*'([^']*)'/g;
  let kept = "";
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(tagMatch))) {
    const name = (m[1] ?? m[3] ?? "").toLowerCase();
    const value = m[2] ?? m[4] ?? "";
    if (!ALLOWED_ATTR.has(name)) continue;
    if ((name === "href" || name === "src") && !SAFE_URI.test(value.trim())) continue;
    kept += ` ${name}="${value.replace(/"/g, "&quot;")}"`;
  }
  return `<${tagName}${kept}${selfClosing ? " /" : ""}>`;
}

/**
 * Strips any tag not in ALLOWED_TAGS (keeping its inner text) and any
 * attribute not in ALLOWED_ATTR, and rejects unsafe href/src URI schemes
 * (javascript:, data:, etc). Applied to every write path regardless of the
 * model's own good behaviour — the same "never trust generated output"
 * posture as search_listings_by_intent's id validation had.
 */
export function sanitizeGeneratedHtml(html: string): string {
  const input = String(html ?? "");
  if (!input) return "";
  // Drop script/style elements (and their content) entirely before the
  // generic tag pass below, which only strips the tags themselves.
  const withoutDangerous = input.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");
  return withoutDangerous.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (full, rawName) => {
    const tagName = String(rawName).toLowerCase();
    if (!ALLOWED_TAGS.has(tagName)) return "";
    return stripDisallowedAttrs(full, tagName);
  });
}

export type DirectoryEntryForGeneration = {
  id: string;
  name: string;
  address: string | null;
  postcode: string | null;
  country: string | null;
  city: string | null;
  website_url: string | null;
  phone: string | null;
  email: string | null;
  /** Accepted for compatibility but deliberately NOT used: stored notes are often import placeholders, and rewriting them is what produced database-style listings. */
  notes_html?: string | null;
};

export type GeneratedListing = { html: string; research: EntryResearch };

/** The draft failed validation twice. The existing listing must be left alone. */
export class ListingQualityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ListingQualityError";
  }
}

const WRITE_SYSTEM =
  "You write the public listing for one supplier in a curated directory, from research notes you are given. " +
  "Voice: warm, knowledgeable and enthusiastic, natural British English, like a good independent food magazine. " +
  "Reflect the supplier's personality without impersonating their brand or speaking as them. " +
  "Use only the research findings: every claim must come from them, and anything under 'Do not state or imply' must not appear in any form. " +
  "Make every sentence earn its place with a specific product, story, practice or detail; cut filler, repetition and generic praise. " +
  "Lead with what makes this supplier interesting, and give readers a genuine reason to visit its website through those specifics, never by telling them to go and look. " +
  "Never mention research, sources, records, data, listings, categories, verification, or anything missing or unknown; if the findings are thin on a point, leave that point out. " +
  "Never write SEO titles, meta descriptions, keywords or notes: those are produced elsewhere and must not appear in the listing. " +
  "Write clean HTML using only these tags: p, br, strong, b, em, i, u, ul, ol, li, h2, h3, h4, blockquote, a, img, span, div. " +
  "No <script>, <style>, inline event handlers, or javascript:/data: URIs. " +
  `Respond only by calling the ${TOOL_NAME} tool.`;

function findingsText(r: EntryResearch): string {
  const list = (label: string, items: string[]) => (items.length ? `${label}:\n${items.map((i) => `- ${i}`).join("\n")}\n` : "");
  return [
    `What they are: ${r.business_summary}\n`,
    list("Story and history", r.history_and_story),
    list("Products", r.products),
    list("Producers and sourcing", r.producers_and_sourcing),
    list("Philosophy and practices", r.philosophy_and_practices),
    r.verified_certifications.length ? `Confirmed credentials:\n${r.verified_certifications.map((c) => `- ${c.name} (${c.evidence})`).join("\n")}\n` : "",
    list("The most distinctive details (build the listing around these)", r.distinctive_details),
    list("Do not state or imply (unconfirmed or unknown; never mention that they are unconfirmed)", r.unverified_or_missing),
  ].join("\n");
}

async function writeListing(
  scope: AiScope,
  entry: DirectoryEntryForGeneration,
  brief: string,
  research: EntryResearch,
  rejected?: { html: string; problems: string[] },
): Promise<string> {
  const result = await generate(directoryMapsContext(scope, "content_generation"), {
    maxTokens: 4096,
    system: WRITE_SYSTEM,
    tools: [
      {
        name: TOOL_NAME,
        description: "Record the public listing HTML for this supplier.",
        inputSchema: {
          type: "object",
          properties: { html: { type: "string", description: "The listing, as HTML using only the allowed tags. No SEO fields, notes or caveats." } },
          required: ["html"],
        },
      },
    ],
    toolChoice: { type: "tool", name: TOOL_NAME },
    messages: [
      {
        role: "user",
        content:
          `Supplier: ${entry.name}${entry.city ? ` (${entry.city})` : ""}\n\n` +
          `Editorial brief from the directory owner. Follow its voice and structure. Ignore any instruction in it to browse, research, cite sources or produce SEO/metadata fields: research is already done and metadata is generated separately.\n${brief}\n\n` +
          `Research findings (the only source of truth):\n${findingsText(research)}\n` +
          (rejected
            ? `Your previous draft was rejected for these reasons:\n${rejected.problems.map((p) => `- ${p}`).join("\n")}\n\nPrevious draft:\n${rejected.html}\n\nWrite a better one that fixes every reason.\n\n`
            : "") +
          `Call ${TOOL_NAME} now.`,
      },
    ],
  });
  const html = requireToolInput(result, TOOL_NAME).html;
  if (typeof html !== "string" || !html.trim()) {
    throw new Error("The AI model returned empty content: check the directory's content prompt isn't too large for the model to complete");
  }
  return sanitizeGeneratedHtml(html);
}

/**
 * Research, write, validate. Throws ResearchInsufficientError or ListingQualityError (or a provider error)
 * rather than ever returning weak content, so callers can safely leave the existing listing untouched.
 */
export async function generateListing(scope: AiScope, entry: DirectoryEntryForGeneration, brief: string): Promise<GeneratedListing> {
  const research = await researchEntry(scope, entry, brief);
  let html = await writeListing(scope, entry, brief, research);
  let problems = validateListing(html, research, entry.name);
  if (problems.length > 0) {
    html = await writeListing(scope, entry, brief, research, { html, problems });
    problems = validateListing(html, research, entry.name);
  }
  if (problems.length > 0) {
    throw new ListingQualityError(`The draft for ${entry.name} didn't meet the quality bar after a retry: ${problems.join("; ")}. The existing listing was left unchanged.`);
  }
  return { html, research };
}

/** Back-compat wrapper for callers that only need the HTML (e.g. the claim Listing Manager draft, which saves nothing). */
export async function generateContentForEntry(scope: AiScope, entry: DirectoryEntryForGeneration, prompt: string): Promise<string> {
  return (await generateListing(scope, entry, prompt)).html;
}

/** Stores the internal research notes (never published). Best-effort: a failure here must not lose a good listing. */
export async function recordEntryResearch(service: ReturnType<typeof createServiceClient>, entryId: string, research: EntryResearch) {
  const { error } = await service
    .from("directory_entry_research")
    .upsert({ entry_id: entryId, findings: research, researched_at: new Date().toISOString() }, { onConflict: "entry_id" });
  if (error) console.error("directory_entry_research upsert failed:", error.message);
}

/**
 * Records one directory_entry_versions row — the AI side of the versioning
 * requirement (manual saves record their own version client-side, in
 * updateDirectoryEntry). Append-only: never updates or deletes existing rows.
 */
export async function recordEntryContentVersion(
  service: ReturnType<typeof createServiceClient>,
  entryId: string,
  notesHtml: string,
  source: "ai_manual" | "ai_auto" | "ai_bulk",
) {
  const { error } = await service.from("directory_entry_versions").insert({
    entry_id: entryId,
    notes_html: notesHtml,
    source,
    actor_user_id: null,
  });
  if (error) throw error;
}

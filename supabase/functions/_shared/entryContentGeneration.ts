// Shared core for directory AI content generation — the one Claude-calling
// implementation used by both generate_entry_content (synchronous, single
// entry) and process_entry_content_jobs (batch worker, cron-invoked). See
// docs/FEATURES.md §4.4g and 20260906120000_create_directory_ai_content_generation.sql.
//
// Platform: ANTHROPIC_API_KEY.

import { createServiceClient } from "./supabase.ts";

const ANTHROPIC_MODEL = "claude-haiku-4-5";
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

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
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
  notes_html: string | null;
};

async function callClaude(apiKey: string, prompt: string, entryText: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      system:
        "You write the page content for one directory entry, following the directory-specific instructions you are given. " +
        "Only use the entry data provided in the user message. Never invent, assume, or infer facts that are not present in it — " +
        "where the instructions ask for something the data doesn't cover, write around it rather than guessing. " +
        "Write clean HTML using only these tags: p, br, strong, b, em, i, u, ul, ol, li, h2, h3, h4, blockquote, a, img, span, div. " +
        "No <script>, <style>, inline event handlers, or javascript:/data: URIs. " +
        `Respond only by calling the ${TOOL_NAME} tool.`,
      tools: [
        {
          name: TOOL_NAME,
          description: "Record the generated HTML page content for this directory entry.",
          input_schema: {
            type: "object",
            properties: {
              html: { type: "string", description: "The entry's page content, as HTML using only the allowed tags." },
            },
            required: ["html"],
          },
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [
        {
          role: "user",
          content:
            `Content instructions for this directory:\n${prompt}\n\n` +
            `Entry data (the only source of truth — do not use outside knowledge):\n${entryText}\n\n` +
            "Call the tool now with the generated HTML.",
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 500)}`);
  }

  const body = await res.json();
  if (body.stop_reason === "max_tokens") {
    throw new Error("Anthropic response was truncated (max_tokens reached) before completing the tool call");
  }
  const toolUse = (body.content ?? []).find((block: { type?: string }) => block.type === "tool_use");
  if (!toolUse || typeof toolUse.input !== "object") {
    throw new Error("Anthropic response did not include a valid tool_use block");
  }
  const html = toolUse.input.html;
  if (typeof html !== "string" || !html.trim()) {
    throw new Error("Anthropic returned empty content — check the directory's content prompt isn't too large for the model to complete");
  }
  return html;
}

/** Builds the plain-text entry summary sent to Claude alongside the directory's prompt. */
export function buildEntryText(entry: DirectoryEntryForGeneration): string {
  return [
    `Name: ${entry.name}`,
    entry.address ? `Address: ${entry.address}` : null,
    entry.city ? `City: ${entry.city}` : null,
    entry.postcode ? `Postcode: ${entry.postcode}` : null,
    entry.country ? `Country: ${entry.country}` : null,
    entry.website_url ? `Website: ${entry.website_url}` : null,
    entry.phone ? `Phone: ${entry.phone}` : null,
    entry.email ? `Email: ${entry.email}` : null,
    entry.notes_html ? `Existing notes: ${stripHtml(entry.notes_html)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Calls Claude and returns sanitized HTML — the one implementation shared by both Edge Functions. */
export async function generateContentForEntry(
  apiKey: string,
  entry: DirectoryEntryForGeneration,
  prompt: string,
): Promise<string> {
  const html = await callClaude(apiKey, prompt, buildEntryText(entry));
  return sanitizeGeneratedHtml(html);
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

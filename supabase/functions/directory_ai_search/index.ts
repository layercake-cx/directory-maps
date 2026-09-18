// Directory AI intent-driven search — the directory-entry successor to the
// removed map-level "Ask AI" search (search_listings_by_intent, dropped
// 2026-09-06). A visitor's free-text query, plus this directory's entries
// and categorisation metadata, goes to Claude via forced tool-calling; every
// id it returns is re-validated against the real corpus before this
// function ever hands it back, so a hallucinated id can never surface a
// nonexistent entry — the one safety property carried over unchanged from
// the removed feature.
//
// Public, anonymous, CORS-enabled: the published directory site
// (generate_directory_site) is fully static, so its embedded search box
// calls this function directly with the anon key. There is no user auth —
// requireDirectoryAccess is for admin/client-portal actions, not visitor
// traffic — so every response here must be safe to hand to an anonymous
// caller (see 20260918120000_create_directory_ai_search.sql's header
// comment for the RLS/service-role posture this relies on).
//
// Request:  POST { directory_id: string, query: string }
// Response: { entry_ids: string[] }                     — a real result
//           { entry_ids: null, disabled: true }         — not configured,
//                                                          or rate-limited
//           { error: string } (non-2xx)                 — anything else
// The caller (buildFilterAndSearchScript's embedded script) treats every
// response shape other than a clean 200 with a real entry_ids array as "fall
// back to plain keyword search" — see docs/DIRECTORIES.md DIR-E7-S1.
//
// Platform: ANTHROPIC_API_KEY.
import { createServiceClient } from "../_shared/supabase.ts";
import { logEdgeFunctionError } from "../_shared/errorLog.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

const ANTHROPIC_MODEL = "claude-haiku-4-5";
const TOOL_NAME = "select_matching_entries";
const WEB_SEARCH_TOOL_TYPE = "web_search_20250305";
const MAX_QUERY_LENGTH = 300;
const MAX_ENTRIES = 500;
const MAX_WEB_SEARCHES = 3;
// Counts real Claude calls only (see directory_ai_search_requests' comment)
// — bounds worst-case Anthropic spend per directory independent of any
// commercial entitlement, which this feature deliberately ships without
// (see the plan's rollout recommendation).
const RATE_LIMIT_PER_MINUTE = 60;

type EntryRow = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  meta_description: string | null;
  notes_html: string | null;
  noindex: boolean | null;
};

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** Short, cheap-to-embed blurb — deliberately not a new AI-summary pipeline (directory_entries.ai_summary stays unused here, see the plan's open questions). */
function entryBlurb(entry: EntryRow): string {
  if (entry.meta_description?.trim()) return entry.meta_description.trim().slice(0, 400);
  return stripHtml(entry.notes_html).slice(0, 400);
}

/** Builds the per-entry corpus text Claude sees — id, location, real lat/lng (grounds proximity reasoning in numbers, not the model's place-name sense), category terms, and a short blurb. */
function buildEntryCorpusText(entries: EntryRow[], termsByEntry: Map<string, string[]>): string {
  return entries
    .map((e) => {
      const location = [e.address, e.city, e.postcode, e.country].filter(Boolean).join(", ");
      const coords = e.lat != null && e.lng != null ? `${e.lat.toFixed(4)}, ${e.lng.toFixed(4)}` : null;
      const terms = termsByEntry.get(e.id) ?? [];
      const blurb = entryBlurb(e);
      return [
        `id: ${e.id}`,
        `name: ${e.name}`,
        location ? `location: ${location}` : null,
        coords ? `coordinates: ${coords}` : null,
        terms.length ? `categories: ${terms.join("; ")}` : null,
        blurb ? `about: ${blurb}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n---\n");
}

function buildSystemPrompt(directoryPrompt: string, webEnabled: boolean): string {
  const base =
    "You help a visitor search a directory by matching their query's intent against the entries you are given. " +
    "Only ever select from the entry ids listed below — never invent an id, and never describe or justify an entry that isn't in the list. " +
    "Use the given coordinates to reason about real geographic proximity when the query mentions a place, rather than guessing from the place name alone. " +
    "Return the best-matching entries, most relevant first. Return an empty list if nothing genuinely matches — do not force a match. " +
    `Directory-specific instructions from this directory's admin:\n${directoryPrompt}\n\n` +
    `Respond only by calling the ${TOOL_NAME} tool.`;
  if (!webEnabled) return base;
  return (
    base +
    "\n\nYou may use web search to better understand a place, term, organisation, or accreditation mentioned in the query or in an entry's data. " +
    "Web search results may only inform your reasoning — never use them to select or justify an entry id that isn't in the given list, and never treat a web result as a fact about one of these specific entries unless that fact is already present in the entry's own data above."
  );
}

const SELECT_TOOL = {
  name: TOOL_NAME,
  description: "Record the directory entries that best match the visitor's search query.",
  input_schema: {
    type: "object",
    properties: {
      entry_ids: {
        type: "array",
        items: { type: "string" },
        description: "Ids of matching entries, most relevant first. Empty array if nothing matches.",
      },
    },
    required: ["entry_ids"],
  },
};

type ContentBlock = { type: string; name?: string; input?: unknown };
type ClaudeResponse = { stop_reason?: string; content?: ContentBlock[] };

async function callClaude(apiKey: string, body: Record<string, unknown>): Promise<ClaudeResponse> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 500)}`);
  }
  return await res.json();
}

function findToolUse(resp: ClaudeResponse, name: string): ContentBlock | null {
  return (resp.content ?? []).find((b) => b.type === "tool_use" && b.name === name) ?? null;
}

function extractEntryIds(block: ContentBlock | null): string[] | null {
  const input = block?.input as { entry_ids?: unknown } | undefined;
  if (!input || !Array.isArray(input.entry_ids)) return null;
  return input.entry_ids.filter((id): id is string => typeof id === "string");
}

/**
 * Runs the search call(s) and returns the raw (not yet id-validated) entry
 * ids Claude selected. Web search off: one forced tool call, identical shape
 * to entryContentGeneration.ts's callClaude. Web search on: tool_choice must
 * be "auto" so Claude can search before answering, so a single call can't
 * guarantee a tool_use block — if the first call doesn't already contain one
 * (the common case: Claude decided it didn't need to search, or searched and
 * came back with only text), one forced follow-up resending the same
 * conversation guarantees termination within at most 2 Anthropic calls. A
 * `pause_turn` (a long-running server-side search loop) is treated as a
 * timeout rather than resumed — resuming it requires re-including the
 * web_search tool and can loop again, which isn't worth the complexity for a
 * single directory search query; the caller falls back to keyword search.
 */
async function runSearch(apiKey: string, userMessage: string, systemPrompt: string, webEnabled: boolean): Promise<string[]> {
  if (!webEnabled) {
    const resp = await callClaude(apiKey, {
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      tools: [SELECT_TOOL],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [{ role: "user", content: userMessage }],
    });
    const ids = extractEntryIds(findToolUse(resp, TOOL_NAME));
    if (!ids) throw new Error("Anthropic response did not include a valid tool_use block");
    return ids;
  }

  const webSearchTool = { type: WEB_SEARCH_TOOL_TYPE, name: "web_search", max_uses: MAX_WEB_SEARCHES };
  const first = await callClaude(apiKey, {
    model: ANTHROPIC_MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    tools: [webSearchTool, SELECT_TOOL],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: userMessage }],
  });

  // Covers both the common case (Claude searched, then called the tool in
  // the same turn) and the rarer case where Claude calls web_search and this
  // tool "in parallel" — the API leaves web_search unresolved then, but this
  // tool's own input is already complete, and we don't need the search
  // result for anything beyond what already informed it.
  const directIds = extractEntryIds(findToolUse(first, TOOL_NAME));
  if (directIds) return directIds;

  if (first.stop_reason === "pause_turn") {
    throw new Error("Anthropic web search did not complete in time");
  }

  const second = await callClaude(apiKey, {
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    tools: [SELECT_TOOL],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [
      { role: "user", content: userMessage },
      { role: "assistant", content: first.content ?? [] },
      { role: "user", content: "Call select_matching_entries now with your final answer." },
    ],
  });
  const ids = extractEntryIds(findToolUse(second, TOOL_NAME));
  if (!ids) throw new Error("Anthropic did not return a final tool call after web search");
  return ids;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const service = createServiceClient();
  let directoryId: string | undefined;
  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      await logEdgeFunctionError({ fn: "directory_ai_search", message: "Missing ANTHROPIC_API_KEY" });
      return json({ error: "Missing ANTHROPIC_API_KEY" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    directoryId = typeof body?.directory_id === "string" ? body.directory_id : undefined;
    const rawQuery = typeof body?.query === "string" ? body.query.trim() : "";
    if (!directoryId) return json({ error: "Missing directory_id" }, 400);
    if (!rawQuery) return json({ error: "Missing query" }, 400);
    const query = rawQuery.slice(0, MAX_QUERY_LENGTH);

    const { data: directory, error: dirErr } = await service
      .from("directories")
      .select("id, ai_search_prompt, ai_search_web_enabled")
      .eq("id", directoryId)
      .eq("is_active", true)
      .maybeSingle();
    if (dirErr) throw dirErr;
    const prompt = directory?.ai_search_prompt;
    if (!directory || !prompt || !prompt.trim()) {
      return json({ entry_ids: null, disabled: true });
    }

    // Rate limit — bounds worst-case Anthropic spend on this public,
    // unauthenticated endpoint independent of any commercial entitlement.
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count: recentCount, error: rateErr } = await service
      .from("directory_ai_search_requests")
      .select("id", { count: "exact", head: true })
      .eq("directory_id", directoryId)
      .gte("occurred_at", oneMinuteAgo);
    if (rateErr) throw rateErr;
    if ((recentCount ?? 0) >= RATE_LIMIT_PER_MINUTE) {
      return json({ entry_ids: null, disabled: true });
    }

    // Same "visible on the published site" set buildDirectoryLandingPage
    // renders rows for (is_active entries, minus per-entry noindex) — an id
    // the AI selects must exist as a .dir-row for the client-side filter
    // step to find it.
    const { data: entryRows, error: entryErr } = await service
      .from("directory_entries")
      .select("id, name, address, city, postcode, country, lat, lng, meta_description, notes_html, noindex")
      .eq("directory_id", directoryId)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(MAX_ENTRIES);
    if (entryErr) throw entryErr;
    const entries = ((entryRows ?? []) as EntryRow[]).filter((e) => !e.noindex);
    if (entries.length === 0) return json({ entry_ids: [] });

    // Categorisation terms, scoped to categorisations actually attached to
    // this directory — same scoping generate_directory_site/index.ts uses
    // for the filter rail, so the AI never reasons about a category the
    // visitor can't see or filter by.
    const entryIds = entries.map((e) => e.id);
    const { data: attachmentRows, error: attachErr } = await service
      .from("categorisation_attachments")
      .select("categorisation_id")
      .eq("target_type", "directory")
      .eq("target_id", directoryId);
    if (attachErr) throw attachErr;
    const attachedCategorisationIds = new Set((attachmentRows ?? []).map((r) => r.categorisation_id));

    const termsByEntry = new Map<string, string[]>();
    if (attachedCategorisationIds.size > 0) {
      const { data: ectRows, error: ectErr } = await service
        .from("entry_category_terms")
        .select("entry_id, category_terms(label, categorisation_id, categorisations(label))")
        .in("entry_id", entryIds);
      if (ectErr) throw ectErr;
      type TermEmbed = { label: string; categorisation_id: string; categorisations: { label: string } | { label: string }[] | null };
      for (const row of (ectRows ?? []) as unknown as { entry_id: string; category_terms: TermEmbed | TermEmbed[] | null }[]) {
        const term = Array.isArray(row.category_terms) ? row.category_terms[0] : row.category_terms;
        if (!term || !attachedCategorisationIds.has(term.categorisation_id)) continue;
        const cat = Array.isArray(term.categorisations) ? term.categorisations[0] : term.categorisations;
        const label = cat ? `${cat.label}: ${term.label}` : term.label;
        const list = termsByEntry.get(row.entry_id) ?? [];
        list.push(label);
        termsByEntry.set(row.entry_id, list);
      }
    }

    const validIds = new Set(entryIds);
    const webEnabled = !!directory.ai_search_web_enabled;
    const systemPrompt = buildSystemPrompt(prompt, webEnabled);
    const userMessage =
      `Visitor's search query: "${query}"\n\n` +
      `Directory entries (the only source of truth for what exists — never invent one not listed here):\n${buildEntryCorpusText(entries, termsByEntry)}\n\n` +
      "Call the tool now with the best-matching entry ids, most relevant first.";

    const rawIds = await runSearch(apiKey, userMessage, systemPrompt, webEnabled);

    // Non-negotiable safety filter, carried over from the removed
    // search_listings_by_intent: a hallucinated id can never surface a
    // nonexistent entry.
    const safeIds = rawIds.filter((id) => validIds.has(id));

    await service.from("directory_ai_search_requests").insert({ directory_id: directoryId });

    return json({ entry_ids: safeIds });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logEdgeFunctionError({ fn: "directory_ai_search", message, context: { directory_id: directoryId } });
    return json({ error: message }, 500);
  }
});

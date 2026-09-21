// Directory AI "Help me choose" — the directory-entry successor to the
// removed map-level "Ask AI" search (search_listings_by_intent, dropped
// 2026-09-06), originally shipped as a drop-in replacement for the published
// search box (DIR-E7-S1, 2026-09-18). The published homepage now keeps
// keyword search as the primary path; this function powers the separate
// Help me choose dialogue. Same safety property: every id is re-validated
// against the real corpus before it is ever handed back.
//
// Public, anonymous, CORS-enabled: the published directory site
// (generate_directory_site) is fully static, so its embedded script
// calls this function directly with the anon key. There is no user auth —
// requireDirectoryAccess is for admin/client-portal actions, not visitor
// traffic — so every response here must be safe to hand to an anonymous
// caller (see 20260918120000_create_directory_ai_search.sql's header
// comment for the RLS/service-role posture this relies on).
//
// Request:  POST {
//   directory_id: string,
//   query?: string,                          — one-shot first user turn
//   messages?: { role, content }[],          — conversation (preferred)
//   candidate_entry_ids?: string[],          — optional restrict-to set
// }
// Response: {
//   entry_ids: string[] | null,              — null while asking a follow-up
//   follow_up: { question: string } | null,
//   reasons?: { [entry_id: string]: string },
//   based_on?: string[],
//   disabled?: true,
// }
//           { error: string } (non-2xx)
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
const SELECT_TOOL_NAME = "select_matching_entries";
const FOLLOW_UP_TOOL_NAME = "ask_follow_up";
const WEB_SEARCH_TOOL_TYPE = "web_search_20250305";
const MAX_QUERY_LENGTH = 300;
const MAX_MESSAGE_CHARS = 2000;
const MAX_MESSAGES = 16;
const MAX_ENTRIES = 500;
const MAX_WEB_SEARCHES = 3;
const RATE_LIMIT_PER_MINUTE = 60;

type EntryRow = {
  id: string;
  name: string;
  slug: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  website_url: string | null;
  meta_description: string | null;
  keywords: string | null;
  ai_summary: string | null;
  notes_html: string | null;
  noindex: boolean | null;
};

type ChatMessage = { role: "user" | "assistant"; content: string };

type TurnResult =
  | { kind: "select"; ids: string[]; reasons: Record<string, string>; basedOn: string[] }
  | { kind: "follow_up"; question: string };

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function entryBlurb(entry: EntryRow): string {
  if (entry.meta_description?.trim()) return entry.meta_description.trim().slice(0, 400);
  if (entry.ai_summary?.trim()) return entry.ai_summary.trim().slice(0, 400);
  return stripHtml(entry.notes_html).slice(0, 400);
}

function buildEntryCorpusText(entries: EntryRow[], termsByEntry: Map<string, string[]>): string {
  return entries
    .map((e) => {
      const location = [e.address, e.city, e.postcode, e.country].filter(Boolean).join(", ");
      const coords = e.lat != null && e.lng != null ? `${e.lat.toFixed(4)}, ${e.lng.toFixed(4)}` : null;
      const terms = termsByEntry.get(e.id) ?? [];
      const blurb = entryBlurb(e);
      const notes = stripHtml(e.notes_html).slice(0, 600);
      return [
        `id: ${e.id}`,
        `name: ${e.name}`,
        e.slug ? `slug: ${e.slug}` : null,
        e.website_url ? `website: ${e.website_url}` : null,
        location ? `location: ${location}` : null,
        coords ? `coordinates: ${coords}` : null,
        terms.length ? `categories: ${terms.join("; ")}` : null,
        e.keywords?.trim() ? `keywords: ${e.keywords.trim().slice(0, 300)}` : null,
        blurb ? `about: ${blurb}` : null,
        notes && notes !== blurb ? `listing: ${notes}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n---\n");
}

function buildSystemPrompt(directoryPrompt: string, webEnabled: boolean, narrowing: boolean): string {
  const base =
    "You help a visitor choose relevant directory entries by understanding their circumstances and what they want an organisation to help them with — not by treating their words as search keywords. " +
    "Only ever select from the entry ids listed below — never invent an id, and never describe or justify an entry that isn't in the list. " +
    "Use the given coordinates to reason about real geographic proximity when geography matters, rather than guessing from a place name alone. " +
    "Ask a follow-up question only when it would materially improve the result (profession or industry, career stage, type or size of business, individual vs organisational membership, goals such as training, qualifications, networking, representation, regulatory support or business development, or geography). " +
    "If the visitor has already given enough information to identify useful entries, select them now — do not ask unnecessary questions. " +
    "When you select entries, order them most relevant first. Return an empty list if nothing genuinely matches — do not force a match. " +
    "Any reason you give for an entry must be grounded only in that entry's own data below. Do not invent services, memberships, or facts. " +
    (narrowing
      ? "The visitor is narrowing an existing result set. Only select from the entries you are given. You may reduce the set; do not add ids that are not listed.\n"
      : "") +
    `Directory-specific instructions from this directory's admin:\n${directoryPrompt}\n\n` +
    `Respond only by calling either the ${FOLLOW_UP_TOOL_NAME} tool or the ${SELECT_TOOL_NAME} tool.`;
  if (!webEnabled) return base;
  return (
    base +
    "\n\nYou may use web search to better understand a place, term, organisation, or accreditation mentioned by the visitor or in an entry's data. " +
    "Web search results may only inform your reasoning — never use them to select or justify an entry id that isn't in the given list, and never treat a web result as a fact about one of these specific entries unless that fact is already present in the entry's own data above."
  );
}

const SELECT_TOOL = {
  name: SELECT_TOOL_NAME,
  description: "Record the directory entries that best match the visitor's needs, with optional grounded reasons.",
  input_schema: {
    type: "object",
    properties: {
      entry_ids: {
        type: "array",
        items: { type: "string" },
        description: "Ids of matching entries, most relevant first. Empty array if nothing matches.",
      },
      reasons: {
        type: "array",
        items: {
          type: "object",
          properties: {
            entry_id: { type: "string" },
            reason: { type: "string", description: "One or two sentences grounded in that entry's own listing data." },
          },
          required: ["entry_id", "reason"],
        },
        description: "Optional per-entry explanations. Only include entries you selected.",
      },
      based_on: {
        type: "array",
        items: { type: "string" },
        description: "Short labels for the needs you used (e.g. profession, career stage, networking), taken from the conversation and listing categories.",
      },
    },
    required: ["entry_ids"],
  },
};

const FOLLOW_UP_TOOL = {
  name: FOLLOW_UP_TOOL_NAME,
  description: "Ask the visitor one clarifying question when their needs are still too vague to pick useful entries.",
  input_schema: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "A single, specific question that would materially improve the result.",
      },
    },
    required: ["question"],
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

function parseSelect(block: ContentBlock | null): TurnResult | null {
  const input = block?.input as { entry_ids?: unknown; reasons?: unknown; based_on?: unknown } | undefined;
  if (!input || !Array.isArray(input.entry_ids)) return null;
  const ids = input.entry_ids.filter((id): id is string => typeof id === "string");
  const reasons: Record<string, string> = {};
  if (Array.isArray(input.reasons)) {
    for (const row of input.reasons) {
      if (!row || typeof row !== "object") continue;
      const rec = row as { entry_id?: unknown; reason?: unknown };
      if (typeof rec.entry_id === "string" && typeof rec.reason === "string" && rec.reason.trim()) {
        reasons[rec.entry_id] = rec.reason.trim().slice(0, 400);
      }
    }
  }
  const basedOn = Array.isArray(input.based_on)
    ? input.based_on.filter((s): s is string => typeof s === "string" && !!s.trim()).map((s) => s.trim().slice(0, 80)).slice(0, 8)
    : [];
  return { kind: "select", ids, reasons, basedOn };
}

function parseFollowUp(block: ContentBlock | null): TurnResult | null {
  const input = block?.input as { question?: unknown } | undefined;
  if (!input || typeof input.question !== "string" || !input.question.trim()) return null;
  return { kind: "follow_up", question: input.question.trim().slice(0, 500) };
}

function parseTurn(resp: ClaudeResponse): TurnResult | null {
  const selected = parseSelect(findToolUse(resp, SELECT_TOOL_NAME));
  if (selected && selected.kind === "select" && selected.ids.length > 0) return selected;
  const follow = parseFollowUp(findToolUse(resp, FOLLOW_UP_TOOL_NAME));
  if (follow) return follow;
  if (selected) return selected;
  return null;
}

function toClaudeMessages(messages: ChatMessage[], userMessage: string): { role: "user" | "assistant"; content: string }[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const text = m.content.trim().slice(0, MAX_MESSAGE_CHARS);
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) {
      last.content = `${last.content}\n${text}`;
    } else {
      out.push({ role: m.role, content: text });
    }
  }
  if (out.length === 0 || out[out.length - 1].role !== "user") {
    out.push({ role: "user", content: userMessage });
  } else {
    out[out.length - 1].content = `${out[out.length - 1].content}\n\n${userMessage}`;
  }
  if (out[0].role !== "user") out.unshift({ role: "user", content: "(The visitor opened Help me choose.)" });
  return out.slice(-MAX_MESSAGES);
}

async function runTurn(
  apiKey: string,
  claudeMessages: { role: "user" | "assistant"; content: string }[],
  systemPrompt: string,
  webEnabled: boolean,
): Promise<TurnResult> {
  const decisionTools = [FOLLOW_UP_TOOL, SELECT_TOOL];
  if (!webEnabled) {
    const resp = await callClaude(apiKey, {
      model: ANTHROPIC_MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      tools: decisionTools,
      tool_choice: { type: "any" },
      messages: claudeMessages,
    });
    const parsed = parseTurn(resp);
    if (!parsed) throw new Error("Anthropic response did not include a valid tool_use block");
    return parsed;
  }

  const webSearchTool = { type: WEB_SEARCH_TOOL_TYPE, name: "web_search", max_uses: MAX_WEB_SEARCHES };
  const first = await callClaude(apiKey, {
    model: ANTHROPIC_MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    tools: [webSearchTool, ...decisionTools],
    tool_choice: { type: "auto" },
    messages: claudeMessages,
  });

  const direct = parseTurn(first);
  if (direct) return direct;

  if (first.stop_reason === "pause_turn") {
    throw new Error("Anthropic web search did not complete in time");
  }

  const second = await callClaude(apiKey, {
    model: ANTHROPIC_MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    tools: decisionTools,
    tool_choice: { type: "any" },
    messages: [
      ...claudeMessages,
      { role: "assistant", content: first.content ?? [] },
      { role: "user", content: `Call either ${FOLLOW_UP_TOOL_NAME} or ${SELECT_TOOL_NAME} now with your final answer.` },
    ] as { role: string; content: unknown }[],
  });
  const parsed = parseTurn(second);
  if (!parsed) throw new Error("Anthropic did not return a final tool call after web search");
  return parsed;
}

function parseMessages(body: Record<string, unknown>): ChatMessage[] {
  if (Array.isArray(body.messages)) {
    const out: ChatMessage[] = [];
    for (const raw of body.messages.slice(0, MAX_MESSAGES)) {
      if (!raw || typeof raw !== "object") continue;
      const rec = raw as { role?: unknown; content?: unknown };
      if (rec.role !== "user" && rec.role !== "assistant") continue;
      if (typeof rec.content !== "string") continue;
      const content = rec.content.trim().slice(0, MAX_MESSAGE_CHARS);
      if (!content) continue;
      out.push({ role: rec.role, content });
    }
    return out;
  }
  const rawQuery = typeof body.query === "string" ? body.query.trim() : "";
  if (rawQuery) return [{ role: "user", content: rawQuery.slice(0, MAX_QUERY_LENGTH) }];
  return [];
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

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    directoryId = typeof body?.directory_id === "string" ? body.directory_id : undefined;
    if (!directoryId) return json({ error: "Missing directory_id" }, 400);
    const messages = parseMessages(body);
    if (messages.length === 0) return json({ error: "Missing query" }, 400);

    const { data: directory, error: dirErr } = await service
      .from("directories")
      .select("id, ai_search_prompt, ai_search_web_enabled")
      .eq("id", directoryId)
      .eq("is_active", true)
      .maybeSingle();
    if (dirErr) throw dirErr;
    const prompt = directory?.ai_search_prompt;
    if (!directory || !prompt || !prompt.trim()) {
      return json({ entry_ids: null, follow_up: null, disabled: true });
    }

    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count: recentCount, error: rateErr } = await service
      .from("directory_ai_search_requests")
      .select("id", { count: "exact", head: true })
      .eq("directory_id", directoryId)
      .gte("occurred_at", oneMinuteAgo);
    if (rateErr) throw rateErr;
    if ((recentCount ?? 0) >= RATE_LIMIT_PER_MINUTE) {
      return json({ entry_ids: null, follow_up: null, disabled: true });
    }

    const { data: entryRows, error: entryErr } = await service
      .from("directory_entries")
      .select("id, name, slug, address, city, postcode, country, lat, lng, website_url, meta_description, keywords, ai_summary, notes_html, noindex")
      .eq("directory_id", directoryId)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(MAX_ENTRIES);
    if (entryErr) throw entryErr;
    let entries = ((entryRows ?? []) as EntryRow[]).filter((e) => !e.noindex);
    if (entries.length === 0) return json({ entry_ids: [], follow_up: null });

    const candidateRaw = body.candidate_entry_ids;
    let narrowing = false;
    if (Array.isArray(candidateRaw)) {
      const wanted = new Set(candidateRaw.filter((id): id is string => typeof id === "string"));
      entries = entries.filter((e) => wanted.has(e.id));
      narrowing = true;
      if (entries.length === 0) return json({ entry_ids: [], follow_up: null });
    }

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
    const systemPrompt = buildSystemPrompt(prompt, webEnabled, narrowing);
    const corpus = buildEntryCorpusText(entries, termsByEntry);
    const userSuffix =
      `Directory entries (the only source of truth for what exists — never invent one not listed here):\n${corpus}\n\n` +
      `Call ${FOLLOW_UP_TOOL_NAME} if you need one clarifying question, otherwise call ${SELECT_TOOL_NAME} with the best-matching entry ids, most relevant first.`;
    const claudeMessages = toClaudeMessages(messages, userSuffix);

    const turn = await runTurn(apiKey, claudeMessages, systemPrompt, webEnabled);

    await service.from("directory_ai_search_requests").insert({ directory_id: directoryId });

    if (turn.kind === "follow_up") {
      return json({ entry_ids: null, follow_up: { question: turn.question } });
    }

    const safeIds = turn.ids.filter((id) => validIds.has(id));
    const reasons: Record<string, string> = {};
    for (const id of safeIds) {
      if (turn.reasons[id]) reasons[id] = turn.reasons[id];
    }
    return json({
      entry_ids: safeIds,
      follow_up: null,
      reasons,
      based_on: turn.basedOn,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logEdgeFunctionError({ fn: "directory_ai_search", message, context: { directory_id: directoryId } });
    return json({ error: message }, 500);
  }
});

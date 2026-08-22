// Intent-based AI search for a map's listings — a small multi-turn chat, not
// one-shot Q&A. Called from the public embed/map view (anonymous visitors) —
// never returns anything not already public listing data. Grounds Claude
// Haiku 4.5 to the map's own listing corpus (core fields + listing_research
// enrichment) and validates every returned id against the real listing set
// before responding, so a hallucinated id can never surface a listing that
// doesn't exist.
//
// The client sends the full conversation each turn (stateless server, like
// any chat API) — this lets a follow-up ("I'm based in Chiang Mai") narrow
// down a broad first answer without re-explaining the original intent.
//
// Platform: ANTHROPIC_API_KEY (same secret as process_listing_enrichment).
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
const TOOL_NAME = "select_matching_listings";
const MAX_MESSAGE_LENGTH = 500;
// Bounds conversation length (and therefore token cost) per search session.
const MAX_MESSAGES = 20;
// Safety cap so a pathologically large directory can't blow up token cost/latency
// on a single search. Not expected to bind in practice — per-map corpora are
// typically dozens to low hundreds of listings.
const MAX_LISTINGS = 300;

type Listing = {
  id: string;
  name: string;
  address: string | null;
  postcode: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
};

type ChatMessage = { role: "user" | "assistant"; content: string };

function buildListingBlock(listing: Listing, research: Record<string, unknown> | null): string {
  const location = [listing.address, listing.postcode, listing.country].filter(Boolean).join(", ");
  const hasCoords = typeof listing.lat === "number" && typeof listing.lng === "number";
  const lines = [
    `id: ${listing.id}`,
    `name: ${listing.name}`,
    location ? `location: ${location}` : null,
    // Raw coordinates so distance/proximity questions can be reasoned about numerically
    // instead of guessed from place names alone (e.g. "near Bangkok" vs "in Thailand").
    hasCoords ? `coordinates: ${listing.lat!.toFixed(4)}, ${listing.lng!.toFixed(4)}` : null,
    research ? `research: ${JSON.stringify(research)}` : null,
  ].filter(Boolean);
  return lines.join(" | ");
}

function parseMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null;
  const out: ChatMessage[] = [];
  for (const m of raw) {
    const role = (m as { role?: unknown })?.role;
    const content = (m as { content?: unknown })?.content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || !content.trim()) return null;
    out.push({ role, content: content.trim().slice(0, MAX_MESSAGE_LENGTH) });
  }
  if (out[out.length - 1].role !== "user") return null;
  return out;
}

type ClaudeSearchResult = { listingIds: string[]; responseText: string };

async function callClaude(apiKey: string, corpus: string, conversation: ChatMessage[]): Promise<ClaudeSearchResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system:
        "You help a map visitor discover listings in a directory through a short conversation, like a helpful " +
        "chat assistant. Only choose from the listing ids given below — never invent one, and never rely on " +
        "outside knowledge about a business beyond what's given here. If nothing reasonably matches, return an " +
        "empty array and say so honestly rather than forcing a match. " +
        "If the visitor's intent is broad or the matches span a wide area (e.g. results scattered across an " +
        "entire country or region), don't just describe everything you found — proactively ask ONE short " +
        "clarifying question that would meaningfully narrow it down (e.g. their location, dates, budget, or a " +
        "preference), the way you would in a real conversation. " +
        "Only ask a clarifying question when the answer would actually help — never ask one out of habit. If the " +
        "visitor asks about something specific the data simply doesn't cover (accessibility, medical, dietary, or " +
        "other individual needs), don't paper over that gap by pivoting to an unrelated question like location — " +
        "that reads as dismissive of what they actually asked. Instead, say plainly and warmly that this directory " +
        "doesn't list that detail, and where it genuinely helps, suggest something useful: contacting a listing " +
        "directly to ask, or noting which listings' available details (e.g. small groups, observation-only, " +
        "private/flexible visits) might make them more likely to accommodate — without overstating what isn't " +
        "evidenced. Match your tone to the visitor's; be especially warm and careful when they mention a child, a " +
        "health or access need, or another sensitive personal circumstance — a flat 'no' followed by a routine " +
        "narrowing question reads as tone-deaf there. " +
        "When a visitor asks for something 'near' a place, reason from the numeric coordinates given for each " +
        "listing, not from loose impressions of place names — two listings can be in the same country and still be " +
        "many hours apart. listing_ids should only include what's genuinely near what they asked for; don't pad it " +
        "with the 'closest of the rest' if that's still an impractical distance for what they're asking (e.g. a " +
        "day trip). If only one listing is genuinely close, say that plainly, and only mention that other listings " +
        "exist in other regions as separate context — don't include those distant ones in listing_ids just to " +
        "avoid a short answer.\n\n" +
        `Respond only by calling the ${TOOL_NAME} tool, every turn.\n\n` +
        `Listings on this map:\n${corpus}`,
      tools: [
        {
          name: TOOL_NAME,
          description: "Return the ids of listings that match the conversation so far, plus a short conversational reply.",
          input_schema: {
            type: "object",
            properties: {
              listing_ids: {
                type: "array",
                items: { type: "string" },
                description: "Best-current matching listing ids given the whole conversation, most relevant first. Empty array if nothing matches yet.",
              },
              response_text: {
                type: "string",
                description:
                  "Your conversational reply (1-3 sentences) — either summarizing what matched and why, asking one " +
                  "clarifying question to narrow a broad result, or saying honestly that nothing matched. Never " +
                  "claim a match that isn't in listing_ids.",
              },
            },
            required: ["listing_ids", "response_text"],
          },
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: conversation.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 500)}`);
  }

  const body = await res.json();
  const toolUse = (body.content ?? []).find((block: { type?: string }) => block.type === "tool_use");
  if (!toolUse || typeof toolUse.input !== "object") {
    throw new Error("Anthropic response did not include a valid tool_use block");
  }
  const ids = toolUse.input.listing_ids;
  const responseText = toolUse.input.response_text;
  return {
    listingIds: Array.isArray(ids) ? ids.filter((id: unknown) => typeof id === "string") : [],
    responseText: typeof responseText === "string" ? responseText.slice(0, 2000) : "",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  let mapId: string | null = null;
  let messages: ChatMessage[] | null = null;
  try {
    const body = await req.json();
    mapId = typeof body?.mapId === "string" ? body.mapId : null;
    messages = parseMessages(body?.messages);
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  if (!mapId || !messages) return json({ error: "mapId and a valid messages array are required" }, 400);

  const service = createServiceClient();
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    await logEdgeFunctionError({ fn: "search_listings_by_intent", message: "Missing ANTHROPIC_API_KEY" });
    return json({ error: "AI search is not available right now" }, 500);
  }

  try {
    const { data: map, error: mapErr } = await service
      .from("maps")
      .select("id, client_id, ai_search_enrichment_prompt")
      .eq("id", mapId)
      .maybeSingle();
    if (mapErr) throw new Error(mapErr.message);
    if (!map || !map.ai_search_enrichment_prompt) {
      // Not an error — AI search just isn't configured for this map. Defense in depth:
      // the frontend should already hide the UI in this case.
      return json({ listingIds: [], disabled: true });
    }

    // Entitlement check (Professional plan and above, or a per-client override) —
    // defense in depth alongside the enrichment trigger's own check, so a client that
    // loses the entitlement after publishing can't keep spending tokens on search either.
    const { data: entitled, error: entitlementErr } = await service.rpc("resolve_ai_search_entitlement", {
      p_client_id: map.client_id,
    });
    if (entitlementErr) throw new Error(entitlementErr.message);
    if (!entitled) {
      return json({ listingIds: [], disabled: true });
    }

    const { data: listings, error: listingsErr } = await service
      .from("listings")
      .select("id, name, address, postcode, country, lat, lng")
      .eq("map_id", mapId)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(MAX_LISTINGS);
    if (listingsErr) throw new Error(listingsErr.message);
    if (!listings || listings.length === 0) return json({ listingIds: [] });

    const validIds = new Set(listings.map((l) => l.id));

    const { data: research, error: researchErr } = await service
      .from("listing_research")
      .select("listing_id, data")
      .in("listing_id", Array.from(validIds));
    if (researchErr) throw new Error(researchErr.message);
    const researchByListing = new Map((research ?? []).map((r) => [r.listing_id, r.data]));

    const corpus = listings
      .map((l) => buildListingBlock(l, researchByListing.get(l.id) ?? null))
      .join("\n");

    const { listingIds: rawIds, responseText } = await callClaude(apiKey, corpus, messages);
    const listingIds = rawIds.filter((id) => validIds.has(id));

    return json({ listingIds, responseText });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logEdgeFunctionError({ fn: "search_listings_by_intent", message, context: { mapId } });
    return json({ error: "AI search failed. Please try a different query." }, 500);
  }
});

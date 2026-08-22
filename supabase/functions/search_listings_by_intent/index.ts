// Intent-based AI search for a map's listings. Called from the public
// embed/map view (anonymous visitors) — never returns anything not already
// public listing data. Grounds Claude Haiku 4.5 to the map's own listing
// corpus (core fields + listing_research enrichment) and validates every
// returned id against the real listing set before responding, so a
// hallucinated id can never surface a listing that doesn't exist.
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
const MAX_QUERY_LENGTH = 500;
// Safety cap so a pathologically large directory can't blow up token cost/latency
// on a single search. Not expected to bind in practice — per-map corpora are
// typically dozens to low hundreds of listings.
const MAX_LISTINGS = 300;

type Listing = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
};

function buildListingBlock(listing: Listing, research: Record<string, unknown> | null): string {
  const location = [listing.address, listing.city, listing.postcode, listing.country].filter(Boolean).join(", ");
  const lines = [
    `id: ${listing.id}`,
    `name: ${listing.name}`,
    location ? `location: ${location}` : null,
    research ? `research: ${JSON.stringify(research)}` : null,
  ].filter(Boolean);
  return lines.join(" | ");
}

async function callClaude(apiKey: string, query: string, corpus: string): Promise<string[]> {
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
        "You match a visitor's free-text intent against a directory's listings for discovery on a map. " +
        "Only choose from the listing ids given in the user message — never invent an id, and never rely on outside " +
        "knowledge about a business beyond what's given. If nothing in the list reasonably matches the visitor's " +
        `intent, return an empty array. Respond only by calling the ${TOOL_NAME} tool.`,
      tools: [
        {
          name: TOOL_NAME,
          description: "Return the ids of listings that match the visitor's intent, most relevant first.",
          input_schema: {
            type: "object",
            properties: {
              listing_ids: { type: "array", items: { type: "string" } },
            },
            required: ["listing_ids"],
          },
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [
        {
          role: "user",
          content: `Visitor's search intent: "${query}"\n\nListings on this map:\n${corpus}\n\nCall the tool now with the matching listing ids.`,
        },
      ],
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
  return Array.isArray(ids) ? ids.filter((id: unknown) => typeof id === "string") : [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  let mapId: string | null = null;
  let query: string | null = null;
  try {
    const body = await req.json();
    mapId = typeof body?.mapId === "string" ? body.mapId : null;
    query = typeof body?.query === "string" ? body.query.trim().slice(0, MAX_QUERY_LENGTH) : null;
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  if (!mapId || !query) return json({ error: "mapId and query are required" }, 400);

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
      .select("id, name, address, city, postcode, country, lat, lng")
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

    const rawIds = await callClaude(apiKey, query, corpus);
    const listingIds = rawIds.filter((id) => validIds.has(id));

    return json({ listingIds });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logEdgeFunctionError({ fn: "search_listings_by_intent", message, context: { mapId } });
    return json({ error: "AI search failed. Please try a different query." }, 500);
  }
});

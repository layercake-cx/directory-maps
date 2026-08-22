// AI search enrichment worker. Invoked every 2 minutes by the
// process-listing-enrichment-dispatch pg_cron job (see
// 20260821130000_ai_search_enrichment_worker_cron.sql) — never called
// directly by client code. Claims a small batch of pending
// listing_enrichment_jobs, asks Claude Haiku 4.5 to produce structured
// research for each listing following that listing's map.ai_search_enrichment_prompt,
// and writes the result to listing_research.
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

const DEFAULT_BATCH_SIZE = 5;
const ANTHROPIC_MODEL = "claude-haiku-4-5";
const TOOL_NAME = "record_listing_research";

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

type EnrichmentJob = {
  id: string;
  listing_id: string;
  map_id: string;
  attempt_count: number;
};

async function callClaude(apiKey: string, enrichmentPrompt: string, listingText: string): Promise<Record<string, unknown>> {
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
        "You extract structured research data about one directory listing, following the map-specific instructions you are given. " +
        "Only use the listing data provided in the user message. Never invent, assume, or infer facts that are not present in it — " +
        "where the instructions ask for something the data doesn't cover, use null for that field rather than guessing. " +
        `Respond only by calling the ${TOOL_NAME} tool.`,
      tools: [
        {
          name: TOOL_NAME,
          description: "Record structured research data for this listing, shaped by the enrichment instructions given in the prompt.",
          input_schema: {
            type: "object",
            properties: {
              data: {
                type: "object",
                description: "Structured fields as described by the map's enrichment instructions. Use null for anything not covered by the listing data.",
              },
            },
            required: ["data"],
          },
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [
        {
          role: "user",
          content:
            `Enrichment instructions for this map:\n${enrichmentPrompt}\n\n` +
            `Listing data (the only source of truth — do not use outside knowledge):\n${listingText}\n\n` +
            "Call the tool now with the structured research data.",
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
  return toolUse.input.data ?? {};
}

async function processJob(service: ReturnType<typeof createServiceClient>, apiKey: string, job: EnrichmentJob) {
  const [{ data: listing, error: listingErr }, { data: map, error: mapErr }] = await Promise.all([
    service
      .from("listings")
      .select("id, name, address, postcode, country, city, website_url, notes_html")
      .eq("id", job.listing_id)
      .maybeSingle(),
    service.from("maps").select("ai_search_enrichment_prompt").eq("id", job.map_id).maybeSingle(),
  ]);

  if (listingErr || !listing) throw new Error(listingErr?.message ?? "Listing not found");
  if (mapErr) throw new Error(mapErr.message);
  const prompt = map?.ai_search_enrichment_prompt;
  if (!prompt) throw new Error("Map has no ai_search_enrichment_prompt configured");

  const listingText = [
    `Name: ${listing.name}`,
    listing.address ? `Address: ${listing.address}` : null,
    listing.city ? `City: ${listing.city}` : null,
    listing.postcode ? `Postcode: ${listing.postcode}` : null,
    listing.country ? `Country: ${listing.country}` : null,
    listing.website_url ? `Website: ${listing.website_url}` : null,
    listing.notes_html ? `Notes: ${stripHtml(listing.notes_html)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const data = await callClaude(apiKey, prompt, listingText);

  const { error: upsertErr } = await service.from("listing_research").upsert(
    {
      listing_id: job.listing_id,
      map_id: job.map_id,
      job_id: job.id,
      data,
      model: ANTHROPIC_MODEL,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "listing_id" },
  );
  if (upsertErr) throw new Error(upsertErr.message);

  await service
    .from("listing_enrichment_jobs")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", job.id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const service = createServiceClient();
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    await logEdgeFunctionError({ fn: "process_listing_enrichment", message: "Missing ANTHROPIC_API_KEY" });
    return json({ error: "Missing ANTHROPIC_API_KEY" }, 500);
  }

  let batchSize = DEFAULT_BATCH_SIZE;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.batch_size === "number" && body.batch_size > 0) batchSize = body.batch_size;
  } catch {
    // no body — use default batch size
  }

  const { data: jobs, error: claimErr } = await service.rpc("claim_pending_listing_enrichment_jobs", {
    p_batch_size: batchSize,
  });
  if (claimErr) {
    await logEdgeFunctionError({ fn: "process_listing_enrichment", message: claimErr.message });
    return json({ error: claimErr.message }, 500);
  }

  const results = { processed: 0, failed: 0 };
  for (const job of (jobs ?? []) as EnrichmentJob[]) {
    try {
      await processJob(service, apiKey, job);
      results.processed += 1;
    } catch (err) {
      results.failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      await logEdgeFunctionError({
        fn: "process_listing_enrichment",
        message,
        context: { listing_id: job.listing_id, map_id: job.map_id, job_id: job.id },
      });
      await service
        .from("listing_enrichment_jobs")
        .update({
          status: "failed",
          error: message.slice(0, 2000),
          attempt_count: (job.attempt_count ?? 0) + 1,
        })
        .eq("id", job.id);
    }
  }

  return json(results);
});

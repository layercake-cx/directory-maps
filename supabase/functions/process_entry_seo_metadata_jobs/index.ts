// Directory entry SEO metadata backfill worker. Invoked every 2 minutes by
// the process-entry-seo-metadata-dispatch pg_cron job (see
// 20260919130000_directory_seo_metadata_backfill_queue.sql) — never called
// directly by client code. Claims a small batch of pending
// entry_seo_metadata_jobs (both 'auto', from the empty-on-insert trigger,
// and 'bulk', from the AI tab's "Backfill missing metadata" action), asks
// Claude Haiku 4.5 to draft each entry's SEO/social metadata, and writes
// only whichever of the six fields were actually empty — the same
// non-destructive rule the single-entry "Generate with AI" button and the
// (now-removed) inline per-publish backfill both followed.
//
// Platform: ANTHROPIC_API_KEY.
import { createServiceClient } from "../_shared/supabase.ts";
import { logEdgeFunctionError } from "../_shared/errorLog.ts";
import { generateEntrySeoMetadataDraft } from "../_shared/seoMetadataGeneration.ts";
import { computeSeoMetadataUpdate, type EntrySeoBackfillRow } from "../_shared/seoMetadataBackfill.ts";

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

type SeoMetadataJob = {
  id: string;
  entry_id: string;
  directory_id: string;
  requested_by: "auto" | "bulk";
  attempt_count: number;
};

async function processJob(service: ReturnType<typeof createServiceClient>, apiKey: string, job: SeoMetadataJob) {
  const { data: entry, error: entryErr } = await service
    .from("directory_entries")
    .select("id, directory_id, name, address, postcode, country, city, website_url, notes_html, meta_title, meta_description, keywords, og_title, og_description, ai_summary")
    .eq("id", job.entry_id)
    .maybeSingle();
  if (entryErr) throw entryErr;
  if (!entry) throw new Error("Entry not found");

  const { data: directory, error: dirErr } = await service
    .from("directories")
    .select("name")
    .eq("id", job.directory_id)
    .maybeSingle();
  if (dirErr) throw dirErr;

  const draft = await generateEntrySeoMetadataDraft(apiKey, entry as unknown as EntrySeoBackfillRow, directory?.name ?? "this directory");
  const update = computeSeoMetadataUpdate(entry as unknown as EntrySeoBackfillRow, draft);

  if (update) {
    const { error: updateErr } = await service.from("directory_entries").update(update).eq("id", job.entry_id);
    if (updateErr) throw updateErr;
  }

  await service
    .from("entry_seo_metadata_jobs")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", job.id);
}

/**
 * For each directory touched by a 'bulk' job this tick, bumps the progress
 * counter and — once no bulk jobs from this run remain pending/processing —
 * flips seo_metadata_backfill_status to succeeded/failed. Mirrors
 * process_entry_content_jobs' updateDirectoryProgress exactly, scoped to
 * jobs created at-or-after seo_metadata_backfill_started_at.
 */
async function updateDirectoryProgress(service: ReturnType<typeof createServiceClient>, directoryId: string) {
  const { data: directory, error: dirErr } = await service
    .from("directories")
    .select("client_id, seo_metadata_backfill_started_at, seo_metadata_backfill_processed")
    .eq("id", directoryId)
    .maybeSingle();
  if (dirErr || !directory?.seo_metadata_backfill_started_at) return;

  const startedAt = directory.seo_metadata_backfill_started_at;

  const { count: remaining } = await service
    .from("entry_seo_metadata_jobs")
    .select("id", { count: "exact", head: true })
    .eq("directory_id", directoryId)
    .eq("requested_by", "bulk")
    .gte("created_at", startedAt)
    .in("status", ["pending", "processing"]);

  const processed = (directory.seo_metadata_backfill_processed ?? 0) + 1;

  if ((remaining ?? 0) > 0) {
    await service.from("directories").update({ seo_metadata_backfill_processed: processed }).eq("id", directoryId);
    return;
  }

  const { count: failed } = await service
    .from("entry_seo_metadata_jobs")
    .select("id", { count: "exact", head: true })
    .eq("directory_id", directoryId)
    .eq("requested_by", "bulk")
    .gte("created_at", startedAt)
    .eq("status", "failed");

  await service
    .from("directories")
    .update({
      seo_metadata_backfill_status: (failed ?? 0) > 0 ? "failed" : "succeeded",
      seo_metadata_backfill_error: (failed ?? 0) > 0 ? `${failed} of the queued entries failed to generate` : null,
      seo_metadata_backfill_processed: processed,
      seo_metadata_backfill_completed_at: new Date().toISOString(),
    })
    .eq("id", directoryId);

  await service.from("admin_events").insert({
    event_type: "directory_ai_content_bulk_completed",
    meta: {
      client_id: directory.client_id,
      directory_id: directoryId,
      target: "seo_metadata",
      entries_processed: processed - (failed ?? 0),
      entries_failed: failed ?? 0,
      source: "edge_function",
    },
  }).then(() => {});
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const service = createServiceClient();
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    await logEdgeFunctionError({ fn: "process_entry_seo_metadata_jobs", message: "Missing ANTHROPIC_API_KEY" });
    return json({ error: "Missing ANTHROPIC_API_KEY" }, 500);
  }

  let batchSize = DEFAULT_BATCH_SIZE;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.batch_size === "number" && body.batch_size > 0) batchSize = body.batch_size;
  } catch {
    // no body — use default batch size
  }

  const { data: jobs, error: claimErr } = await service.rpc("claim_pending_entry_seo_metadata_jobs", {
    p_batch_size: batchSize,
  });
  if (claimErr) {
    await logEdgeFunctionError({ fn: "process_entry_seo_metadata_jobs", message: claimErr.message });
    return json({ error: claimErr.message }, 500);
  }

  const results = { processed: 0, failed: 0 };
  for (const job of (jobs ?? []) as SeoMetadataJob[]) {
    try {
      await processJob(service, apiKey, job);
      results.processed += 1;
    } catch (err) {
      results.failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      await logEdgeFunctionError({
        fn: "process_entry_seo_metadata_jobs",
        message,
        context: { entry_id: job.entry_id, directory_id: job.directory_id, job_id: job.id },
      });
      await service
        .from("entry_seo_metadata_jobs")
        .update({
          status: "failed",
          error: message.slice(0, 2000),
          attempt_count: (job.attempt_count ?? 0) + 1,
        })
        .eq("id", job.id);
    }

    if (job.requested_by === "bulk") {
      await updateDirectoryProgress(service, job.directory_id);
    }
  }

  return json(results);
});

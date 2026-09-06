// Directory AI content generation worker. Invoked every 2 minutes by the
// process-entry-content-dispatch pg_cron job (see
// 20260906130000_entry_content_generation_worker_cron.sql) — never called
// directly by client code. Claims a small batch of pending entry_content_jobs
// (both 'auto', from the empty-on-insert trigger, and 'bulk', from the
// directory-wide "Generate all entry content" action), asks Claude Haiku 4.5
// to write each entry's page content following that entry's directory's
// ai_content_prompt, and writes the result to directory_entries.notes_html.
//
// Platform: ANTHROPIC_API_KEY.
import { createServiceClient } from "../_shared/supabase.ts";
import { logEdgeFunctionError } from "../_shared/errorLog.ts";
import { generateContentForEntry, recordEntryContentVersion } from "../_shared/entryContentGeneration.ts";

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

type ContentJob = {
  id: string;
  entry_id: string;
  directory_id: string;
  requested_by: "auto" | "bulk";
  attempt_count: number;
};

async function processJob(service: ReturnType<typeof createServiceClient>, apiKey: string, job: ContentJob) {
  const { data: entry, error: entryErr } = await service
    .from("directory_entries")
    .select("id, directory_id, name, address, postcode, country, city, website_url, phone, email, notes_html")
    .eq("id", job.entry_id)
    .maybeSingle();
  if (entryErr) throw entryErr;
  if (!entry) throw new Error("Entry not found");

  const { data: directory, error: dirErr } = await service
    .from("directories")
    .select("ai_content_prompt")
    .eq("id", job.directory_id)
    .maybeSingle();
  if (dirErr) throw dirErr;
  const prompt = directory?.ai_content_prompt;
  if (!prompt || !prompt.trim()) throw new Error("Directory has no ai_content_prompt configured");

  const html = await generateContentForEntry(apiKey, entry, prompt);

  const { error: updateErr } = await service
    .from("directory_entries")
    .update({ notes_html: html, allow_html: true, ai_content_generated_at: new Date().toISOString() })
    .eq("id", job.entry_id);
  if (updateErr) throw updateErr;

  await recordEntryContentVersion(service, job.entry_id, html, job.requested_by === "auto" ? "ai_auto" : "ai_bulk");

  await service
    .from("entry_content_jobs")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", job.id);
}

/**
 * For each directory touched by a 'bulk' job this tick, bumps the progress
 * counter and — once no bulk jobs from this run remain pending/processing —
 * flips ai_content_generation_status to succeeded/failed. Scoped to jobs
 * created at-or-after ai_content_generation_started_at so an older bulk
 * run's history doesn't leak into this run's completion check.
 */
async function updateDirectoryProgress(service: ReturnType<typeof createServiceClient>, directoryId: string) {
  const { data: directory, error: dirErr } = await service
    .from("directories")
    .select("client_id, ai_content_generation_started_at, ai_content_generation_processed")
    .eq("id", directoryId)
    .maybeSingle();
  if (dirErr || !directory?.ai_content_generation_started_at) return;

  const startedAt = directory.ai_content_generation_started_at;

  const { count: remaining } = await service
    .from("entry_content_jobs")
    .select("id", { count: "exact", head: true })
    .eq("directory_id", directoryId)
    .eq("requested_by", "bulk")
    .gte("created_at", startedAt)
    .in("status", ["pending", "processing"]);

  const processed = (directory.ai_content_generation_processed ?? 0) + 1;

  if ((remaining ?? 0) > 0) {
    await service.from("directories").update({ ai_content_generation_processed: processed }).eq("id", directoryId);
    return;
  }

  const { count: failed } = await service
    .from("entry_content_jobs")
    .select("id", { count: "exact", head: true })
    .eq("directory_id", directoryId)
    .eq("requested_by", "bulk")
    .gte("created_at", startedAt)
    .eq("status", "failed");

  await service
    .from("directories")
    .update({
      ai_content_generation_status: (failed ?? 0) > 0 ? "failed" : "succeeded",
      ai_content_generation_error: (failed ?? 0) > 0 ? `${failed} of the queued entries failed to generate` : null,
      ai_content_generation_processed: processed,
      ai_content_generated_at: new Date().toISOString(),
    })
    .eq("id", directoryId);

  await service.from("admin_events").insert({
    event_type: "directory_ai_content_bulk_completed",
    meta: {
      client_id: directory.client_id,
      directory_id: directoryId,
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
    await logEdgeFunctionError({ fn: "process_entry_content_jobs", message: "Missing ANTHROPIC_API_KEY" });
    return json({ error: "Missing ANTHROPIC_API_KEY" }, 500);
  }

  let batchSize = DEFAULT_BATCH_SIZE;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.batch_size === "number" && body.batch_size > 0) batchSize = body.batch_size;
  } catch {
    // no body — use default batch size
  }

  const { data: jobs, error: claimErr } = await service.rpc("claim_pending_entry_content_jobs", {
    p_batch_size: batchSize,
  });
  if (claimErr) {
    await logEdgeFunctionError({ fn: "process_entry_content_jobs", message: claimErr.message });
    return json({ error: claimErr.message }, 500);
  }

  const results = { processed: 0, failed: 0 };
  for (const job of (jobs ?? []) as ContentJob[]) {
    try {
      await processJob(service, apiKey, job);
      results.processed += 1;
    } catch (err) {
      results.failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      await logEdgeFunctionError({
        fn: "process_entry_content_jobs",
        message,
        context: { entry_id: job.entry_id, directory_id: job.directory_id, job_id: job.id },
      });
      await service
        .from("entry_content_jobs")
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

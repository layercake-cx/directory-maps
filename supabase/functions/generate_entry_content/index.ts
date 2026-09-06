// Synchronous single-entry AI content generation — invoked directly by the
// "Generate with AI" button on the entry's Content tab. Bypasses the
// empty-notes_html check that gates the automatic/bulk paths (see
// enqueue_entry_content_job() in 20260906120000_create_directory_ai_content_generation.sql)
// since a human explicitly asked for this one entry, right now.
//
// Body: { entry_id: string }
// Auth: requires a signed-in user with access to the entry's directory
// (requireDirectoryAccess) — this is a user-invoked action, not a
// service-role-only worker like process_entry_content_jobs.
//
// Platform: ANTHROPIC_API_KEY.
import { createServiceClient, requireDirectoryAccess } from "../_shared/supabase.ts";
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const service = createServiceClient();
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    await logEdgeFunctionError({ fn: "generate_entry_content", message: "Missing ANTHROPIC_API_KEY" });
    return json({ error: "Missing ANTHROPIC_API_KEY" }, 500);
  }

  let entryId: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    entryId = typeof body?.entry_id === "string" ? body.entry_id : undefined;
    if (!entryId) return json({ error: "Missing entry_id" }, 400);

    const { data: entry, error: entryErr } = await service
      .from("directory_entries")
      .select("id, directory_id, name, address, postcode, country, city, website_url, phone, email, notes_html")
      .eq("id", entryId)
      .maybeSingle();
    if (entryErr) throw entryErr;
    if (!entry) return json({ error: "Entry not found" }, 404);

    await requireDirectoryAccess(req, entry.directory_id);

    const { data: directory, error: dirErr } = await service
      .from("directories")
      .select("ai_content_prompt")
      .eq("id", entry.directory_id)
      .maybeSingle();
    if (dirErr) throw dirErr;
    const prompt = directory?.ai_content_prompt;
    if (!prompt || !prompt.trim()) {
      return json({ error: "AI content generation is not configured for this directory" }, 400);
    }

    const html = await generateContentForEntry(apiKey, entry, prompt);

    const { error: updateErr } = await service
      .from("directory_entries")
      .update({ notes_html: html, allow_html: true, ai_content_generated_at: new Date().toISOString() })
      .eq("id", entryId);
    if (updateErr) throw updateErr;

    await recordEntryContentVersion(service, entryId, html, "ai_manual");

    return json({ notes_html: html });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logEdgeFunctionError({ fn: "generate_entry_content", message, context: { entry_id: entryId } });
    return json({ error: message }, 500);
  }
});

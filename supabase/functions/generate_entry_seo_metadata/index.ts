// Synchronous single-entry AI SEO/social metadata generation — invoked by
// the "Generate with AI" button on EntrySeoTab.jsx. Unlike
// generate_entry_content, this never writes to the database: it returns a
// draft the client places into its own (unsaved) form state, so the
// editor's existing "Save metadata" button is what actually persists it —
// matching the product doc's "generated copy always lands in the editable
// field for review before publish" rule.
//
// Body: { entry_id: string }
// Auth: requires a signed-in user with access to the entry's directory.
//
// LLM calls go through the AI Gateway (_shared/ai/gateway.ts): the organisation's own
// connected provider, or a clear "AI unavailable" response if there is none.
import { createServiceClient, requireDirectoryAccess } from "../_shared/supabase.ts";
import { logEdgeFunctionError } from "../_shared/errorLog.ts";
import { AiUnavailableError, aiUnavailableBody, getDirectoryClientId } from "../_shared/ai/gateway.ts";
import { generateEntrySeoMetadataDraft } from "../_shared/seoMetadataGeneration.ts";

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
  let entryId: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    entryId = typeof body?.entry_id === "string" ? body.entry_id : undefined;
    if (!entryId) return json({ error: "Missing entry_id" }, 400);

    const { data: entry, error: entryErr } = await service
      .from("directory_entries")
      .select("id, directory_id, name, address, postcode, country, city, website_url, notes_html")
      .eq("id", entryId)
      .maybeSingle();
    if (entryErr) throw entryErr;
    if (!entry) return json({ error: "Entry not found" }, 404);

    await requireDirectoryAccess(req, entry.directory_id);

    const { data: directory, error: dirErr } = await service
      .from("directories")
      .select("name")
      .eq("id", entry.directory_id)
      .maybeSingle();
    if (dirErr) throw dirErr;

    const clientId = await getDirectoryClientId(service, entry.directory_id);
    const draft = await generateEntrySeoMetadataDraft(
      { db: service, clientId, productInstanceId: entry.directory_id },
      entry,
      directory?.name ?? "this directory",
    );

    return json(draft);
  } catch (err) {
    if (err instanceof AiUnavailableError) return json(aiUnavailableBody(err));
    const message = err instanceof Error ? err.message : String(err);
    await logEdgeFunctionError({ fn: "generate_entry_seo_metadata", message, context: { entry_id: entryId } });
    return json({ error: message }, 500);
  }
});

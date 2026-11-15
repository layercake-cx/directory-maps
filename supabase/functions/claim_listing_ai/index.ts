// AI drafting for the claimed-listing "Listing Manager" (claim users have no directory access, so they
// cannot call generate_entry_content). Two actions, one function:
//
//   { entry_id, action: "prompt" }  -> { text }            the directory's admin-set drafting prompt, read-only
//   { entry_id, action: "draft" }   -> { html }            a draft for the editor; NOTHING is saved here
//   409 { error: "no_web_address" } when the entry has no website_url.
//
// Auth: requireDirectoryItemPublishAccess -- an admin/directory contact, or an owner/editor of the entry's
// ACTIVE claim. The client never sends the prompt or the URL; both are read server-side so users cannot
// alter them. The draft lands in the user's (unsaved) editor; Save and Publish stay their own actions.
import { createServiceClient, requireDirectoryItemPublishAccess } from "../_shared/supabase.ts";
import { logEdgeFunctionError } from "../_shared/errorLog.ts";
import { AiUnavailableError, aiUnavailableBody, getDirectoryClientId } from "../_shared/ai/gateway.ts";
import { generateContentForEntry } from "../_shared/entryContentGeneration.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  let entryId: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    entryId = typeof body?.entry_id === "string" ? body.entry_id : undefined;
    const action = body?.action === "prompt" ? "prompt" : body?.action === "draft" ? "draft" : null;
    if (!entryId || !action) return json({ error: "Missing entry_id or action" }, 400);

    let access;
    try {
      access = await requireDirectoryItemPublishAccess(req, entryId);
    } catch {
      return json({ error: "Access denied" }, 403);
    }

    const service = createServiceClient();
    const { data: directory, error: dirErr } = await service
      .from("directories")
      .select("ai_content_prompt")
      .eq("id", access.directoryId)
      .maybeSingle();
    if (dirErr) throw dirErr;
    const prompt = directory?.ai_content_prompt?.trim() ?? "";

    if (action === "prompt") return json({ text: prompt });

    if (!prompt) return json({ error: "AI drafting is not configured for this directory" }, 400);

    const { data: entry, error: entryErr } = await service
      .from("directory_entries")
      .select("id, directory_id, name, address, postcode, country, city, website_url, phone, email, notes_html")
      .eq("id", entryId)
      .maybeSingle();
    if (entryErr) throw entryErr;
    if (!entry) return json({ error: "Entry not found" }, 404);
    if (!entry.website_url?.trim()) return json({ error: "no_web_address" }, 409);

    const clientId = await getDirectoryClientId(service, entry.directory_id);
    const html = await generateContentForEntry({ db: service, clientId, productInstanceId: entry.directory_id }, entry, prompt);
    return json({ html });
  } catch (err) {
    if (err instanceof AiUnavailableError) return json(aiUnavailableBody(err));
    const message = err instanceof Error ? err.message : String(err);
    await logEdgeFunctionError({ fn: "claim_listing_ai", message, context: { entry_id: entryId } });
    return json({ error: message }, 500);
  }
});

// Synchronous directory-level AI SEO metadata generation — invoked by the
// "Generate with AI" action on DirectoryGeneralSettingsPanel.jsx's SEO
// settings section. Same non-persisting contract as
// generate_entry_seo_metadata: returns a draft, the editor's existing
// "Save settings" button is what actually writes it to
// directories.seo_defaults_json.
//
// Body: { directory_id: string }
// Auth: requires a signed-in user with access to the directory.
//
// Platform: ANTHROPIC_API_KEY.
import { createServiceClient, requireDirectoryAccess } from "../_shared/supabase.ts";
import { logEdgeFunctionError } from "../_shared/errorLog.ts";
import { generateDirectorySeoMetadataDraft } from "../_shared/seoMetadataGeneration.ts";

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
    await logEdgeFunctionError({ fn: "generate_directory_seo_metadata", message: "Missing ANTHROPIC_API_KEY" });
    return json({ error: "Missing ANTHROPIC_API_KEY" }, 500);
  }

  let directoryId: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    directoryId = typeof body?.directory_id === "string" ? body.directory_id : undefined;
    if (!directoryId) return json({ error: "Missing directory_id" }, 400);

    await requireDirectoryAccess(req, directoryId);

    const { data: directory, error: dirErr } = await service
      .from("directories")
      .select("id, name, description")
      .eq("id", directoryId)
      .maybeSingle();
    if (dirErr) throw dirErr;
    if (!directory) return json({ error: "Directory not found" }, 404);

    const { count: entryCount, error: countErr } = await service
      .from("directory_entries")
      .select("id", { count: "exact", head: true })
      .eq("directory_id", directoryId)
      .eq("is_active", true);
    if (countErr) throw countErr;

    const { data: attachments, error: attErr } = await service
      .from("categorisation_attachments")
      .select("categorisation_id")
      .eq("target_type", "directory")
      .eq("target_id", directoryId);
    if (attErr) throw attErr;

    let categorisationLabels: string[] = [];
    const categorisationIds = (attachments ?? []).map((a) => a.categorisation_id);
    if (categorisationIds.length) {
      const { data: categorisations, error: catErr } = await service
        .from("categorisations")
        .select("label")
        .in("id", categorisationIds);
      if (catErr) throw catErr;
      categorisationLabels = (categorisations ?? []).map((c) => c.label).filter(Boolean);
    }

    const draft = await generateDirectorySeoMetadataDraft(
      apiKey,
      directory.name,
      directory.description,
      entryCount ?? 0,
      categorisationLabels,
    );

    return json(draft);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logEdgeFunctionError({ fn: "generate_directory_seo_metadata", message, context: { directory_id: directoryId } });
    return json({ error: message }, 500);
  }
});

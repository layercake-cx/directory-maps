// Synchronous AI drafting for one directory content page — invoked by the
// "Generate with AI" action on the Pages tab. Never writes to the database:
// returns a draft, and the editor's own (unsaved) rich text editor is what
// holds it until they click Save — same review-before-publish contract as
// every other "Generate with AI" action in this plan.
//
// Body (JSON): { page_id: string, outline: string }
// Auth: requires a signed-in user with access to the page's directory.
//
// Platform: ANTHROPIC_API_KEY.
import { createServiceClient, requireDirectoryAccess } from "../_shared/supabase.ts";
import { logEdgeFunctionError } from "../_shared/errorLog.ts";
import { generatePageContentDraft } from "../_shared/pageContentGeneration.ts";

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
    await logEdgeFunctionError({ fn: "generate_content_page_draft", message: "Missing ANTHROPIC_API_KEY" });
    return json({ error: "Missing ANTHROPIC_API_KEY" }, 500);
  }

  let pageId: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    pageId = typeof body?.page_id === "string" ? body.page_id : undefined;
    const outline = typeof body?.outline === "string" ? body.outline.trim() : "";
    if (!pageId) return json({ error: "Missing page_id" }, 400);
    if (!outline) return json({ error: "Missing outline" }, 400);

    const { data: page, error: pageErr } = await service
      .from("directory_content_pages")
      .select("id, directory_id, title")
      .eq("id", pageId)
      .maybeSingle();
    if (pageErr) throw pageErr;
    if (!page) return json({ error: "Page not found" }, 404);

    await requireDirectoryAccess(req, page.directory_id);

    const { data: directory, error: dirErr } = await service
      .from("directories")
      .select("name")
      .eq("id", page.directory_id)
      .maybeSingle();
    if (dirErr) throw dirErr;

    const html = await generatePageContentDraft(apiKey, directory?.name ?? "this directory", page.title, outline);

    return json({ body_html: html });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logEdgeFunctionError({ fn: "generate_content_page_draft", message, context: { page_id: pageId } });
    return json({ error: message }, 500);
  }
});

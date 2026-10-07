// Synchronous AI drafting of the SEO fields (meta title + meta description) for one
// directory content page — invoked by the "Generate SEO with AI" action on the Pages
// tab. Separate from generate_content_page_draft so editors can regenerate the page
// body and its SEO independently. Never writes to the database: returns a draft, and
// the editor's own Save button is what persists it.
//
// Body (JSON): { page_id: string, body_html?: string }
//   body_html — the editor's current (possibly unsaved) content; falls back to the saved body.
// Auth: requires a signed-in user with access to the page's directory.
//
// LLM calls go through the AI Gateway (_shared/ai/gateway.ts): the organisation's own
// connected provider, or a clear "AI unavailable" response if there is none.
import { createServiceClient, requireDirectoryAccess } from "../_shared/supabase.ts";
import { logEdgeFunctionError } from "../_shared/errorLog.ts";
import { AiUnavailableError, aiUnavailableBody, getDirectoryClientId } from "../_shared/ai/gateway.ts";
import { generateContentPageSeoMetadataDraft } from "../_shared/seoMetadataGeneration.ts";

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
  let pageId: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    pageId = typeof body?.page_id === "string" ? body.page_id : undefined;
    if (!pageId) return json({ error: "Missing page_id" }, 400);

    const { data: page, error: pageErr } = await service
      .from("directory_content_pages")
      .select("id, directory_id, title, body_html")
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

    const bodyHtml = typeof body?.body_html === "string" ? body.body_html : page.body_html;
    const clientId = await getDirectoryClientId(service, page.directory_id);
    const draft = await generateContentPageSeoMetadataDraft(
      { db: service, clientId, productInstanceId: page.directory_id },
      directory?.name ?? "this directory",
      page.title,
      bodyHtml,
    );

    return json(draft);
  } catch (err) {
    if (err instanceof AiUnavailableError) return json(aiUnavailableBody(err));
    const message = err instanceof Error ? err.message : String(err);
    await logEdgeFunctionError({ fn: "generate_content_page_seo", message, context: { page_id: pageId } });
    return json({ error: message }, 500);
  }
});

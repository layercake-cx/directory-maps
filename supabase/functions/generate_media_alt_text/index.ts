// Synchronous, single-image AI alt-text generation — invoked by the
// "Generate with AI" action in MediaAssetsEditor.jsx, before the image is
// even uploaded (the image bytes are sent directly to Claude's vision API;
// nothing is persisted here — the caller gets back a suggested alt_text and
// decides whether to use it, same review-before-save pattern as every other
// "Generate with AI" action in this codebase).
//
// Body (JSON): { entry_id: string, image_base64: string, media_type: string,
//                image_kind?: "hero" | "gallery" }
// Auth: requires a signed-in user with access to the entry's directory.
//
// Platform: ANTHROPIC_API_KEY.
import { createServiceClient, requireDirectoryAccess } from "../_shared/supabase.ts";
import { logEdgeFunctionError } from "../_shared/errorLog.ts";
import { generateImageAltText, isSupportedImageMediaType } from "../_shared/imageAltTextGeneration.ts";

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

// Matches the client's own MAX_BYTES cap (src/lib/mediaAssets.js) — base64
// inflates size by ~4/3, so this is that same 5MB ceiling on the decoded
// image, checked against the encoded string length.
const MAX_BASE64_LENGTH = Math.ceil((5 * 1024 * 1024 * 4) / 3);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const service = createServiceClient();
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    await logEdgeFunctionError({ fn: "generate_media_alt_text", message: "Missing ANTHROPIC_API_KEY" });
    return json({ error: "Missing ANTHROPIC_API_KEY" }, 500);
  }

  let entryId: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    entryId = typeof body?.entry_id === "string" ? body.entry_id : undefined;
    const imageBase64 = typeof body?.image_base64 === "string" ? body.image_base64 : undefined;
    const mediaType = typeof body?.media_type === "string" ? body.media_type : undefined;
    const imageKind = body?.image_kind === "hero" ? "hero" : "gallery";

    if (!entryId) return json({ error: "Missing entry_id" }, 400);
    if (!imageBase64) return json({ error: "Missing image_base64" }, 400);
    if (!mediaType || !isSupportedImageMediaType(mediaType)) return json({ error: "Unsupported media_type — use image/jpeg, image/png or image/webp" }, 400);
    if (imageBase64.length > MAX_BASE64_LENGTH) return json({ error: "Image too large (max 5 MB)" }, 400);

    const { data: entry, error: entryErr } = await service
      .from("directory_entries")
      .select("id, directory_id, name")
      .eq("id", entryId)
      .maybeSingle();
    if (entryErr) throw entryErr;
    if (!entry) return json({ error: "Entry not found" }, 404);

    await requireDirectoryAccess(req, entry.directory_id);

    const altText = await generateImageAltText(apiKey, imageBase64, mediaType, entry.name, imageKind);

    return json({ alt_text: altText });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logEdgeFunctionError({ fn: "generate_media_alt_text", message, context: { entry_id: entryId } });
    return json({ error: message }, 500);
  }
});

import { requireMapAccess, createServiceClient } from "../_shared/supabase.ts";
import { refreshAccessToken, getGoogleAppId } from "../_shared/google.ts";

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

  try {
    const { mapId } = await req.json();
    if (!mapId) return json({ error: "Missing mapId" }, 400);
    await requireMapAccess(req, mapId);

    const service = createServiceClient();
    const { data, error } = await service
      .from("map_data_sources")
      .select("refresh_token")
      .eq("map_id", mapId)
      .eq("provider", "google_sheets")
      .maybeSingle();

    if (error) throw error;
    if (!data?.refresh_token) return json({ error: "Not connected" }, 400);

    // Short-lived token only, to hand to the Google Picker widget in the browser.
    // The refresh_token itself never leaves the server.
    const tok = await refreshAccessToken(data.refresh_token);
    return json({ accessToken: tok.access_token, expiresIn: tok.expires_in, appId: getGoogleAppId() });
  } catch (e) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

import { requireMapAccess, createServiceClient } from "../_shared/supabase.ts";
import { buildGoogleAuthUrl } from "../_shared/google.ts";

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
    const { mapId, returnTo } = await req.json();
    await requireMapAccess(req, mapId);
    if (!mapId) return json({ error: "Missing mapId" }, 400);

    const redirectUri = Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI");
    if (!redirectUri) throw new Error("Missing env var: GOOGLE_OAUTH_REDIRECT_URI");

    const state = btoa(
      JSON.stringify({
        mapId,
        returnTo: returnTo || "/#/admin/clients",
        t: Date.now(),
      }),
    );

    const authUrl = buildGoogleAuthUrl({
      redirectUri,
      state,
      scopes: [
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/spreadsheets.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
    });

    const service = createServiceClient();
    await service.from("maps").select("id").eq("id", mapId).maybeSingle();

    return json({ authUrl });
  } catch (e) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

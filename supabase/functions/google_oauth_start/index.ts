import { requireAdmin, createServiceClient } from "../_shared/supabase.ts";
import { buildGoogleAuthUrl } from "../_shared/google.ts";

Deno.serve(async (req) => {
  try {
    await requireAdmin(req);
    const { mapId, returnTo } = await req.json();
    if (!mapId) return new Response("Missing mapId", { status: 400 });

    const redirectUri = Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI");
    if (!redirectUri) throw new Error("Missing env var: GOOGLE_OAUTH_REDIRECT_URI");

    // State is simple JSON; in production you should sign this.
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

    // Create/ensure a placeholder row? We don't store anything yet (callback stores refresh_token).
    // This is just to make sure map exists and edge function has permission.
    const service = createServiceClient();
    await service.from("maps").select("id").eq("id", mapId).maybeSingle();

    return Response.json({ authUrl });
  } catch (e) {
    return Response.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
});


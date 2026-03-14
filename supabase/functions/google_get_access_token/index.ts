import { requireAdmin, createServiceClient } from "../_shared/supabase.ts";
import { refreshAccessToken } from "../_shared/google.ts";

Deno.serve(async (req) => {
  try {
    await requireAdmin(req);
    const { mapId } = await req.json();
    if (!mapId) return new Response("Missing mapId", { status: 400 });

    const service = createServiceClient();
    const { data, error } = await service
      .from("map_data_sources")
      .select("refresh_token")
      .eq("map_id", mapId)
      .eq("provider", "google_sheets")
      .maybeSingle();

    if (error) throw error;
    if (!data?.refresh_token) return new Response("Not connected", { status: 400 });

    const tok = await refreshAccessToken(data.refresh_token);
    return Response.json({ accessToken: tok.access_token, expiresIn: tok.expires_in });
  } catch (e) {
    return Response.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
});


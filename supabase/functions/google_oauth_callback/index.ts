import { createServiceClient } from "../_shared/supabase.ts";
import { exchangeCodeForTokens, fetchGoogleUserEmail } from "../_shared/google.ts";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state");
    const err = url.searchParams.get("error");

    if (err) {
      return new Response(`Google OAuth error: ${err}`, { status: 400 });
    }
    if (!code || !stateRaw) return new Response("Missing code/state", { status: 400 });

    const redirectUri = Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI");
    if (!redirectUri) throw new Error("Missing env var: GOOGLE_OAUTH_REDIRECT_URI");

    const state = JSON.parse(atob(stateRaw));
    const mapId = state?.mapId;
    const returnTo = state?.returnTo || "/#/admin/clients";
    if (!mapId) return new Response("Invalid state", { status: 400 });

    const tokens = await exchangeCodeForTokens({ code, redirectUri });
    if (!tokens.refresh_token) {
      return new Response("No refresh_token returned. (Try disconnecting the app in Google and re-consenting.)", { status: 400 });
    }

    const email = await fetchGoogleUserEmail(tokens.access_token).catch(() => null);

    const service = createServiceClient();
    const { error } = await service.from("map_data_sources").upsert(
      {
        map_id: mapId,
        provider: "google_sheets",
        refresh_token: tokens.refresh_token,
        enabled: true,
        last_sync_status: "CONNECTED",
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "map_id" },
    );
    if (error) throw error;

    const redirect = new URL(returnTo, url.origin);
    // If returnTo is a hash route, keep it simple:
    return new Response(null, {
      status: 302,
      headers: { Location: returnTo.includes("#") ? returnTo : redirect.toString() },
    });
  } catch (e) {
    return new Response(e?.message ?? String(e), { status: 500 });
  }
});


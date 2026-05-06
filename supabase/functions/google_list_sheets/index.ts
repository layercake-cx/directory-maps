import { requireMapAccess, createServiceClient } from "../_shared/supabase.ts";
import { refreshAccessToken } from "../_shared/google.ts";

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
    const { mapId, query } = await req.json();
    await requireMapAccess(req, mapId);
    if (!mapId) return json({ error: "Missing mapId" }, 400);

    const service = createServiceClient();
    const { data: src, error } = await service
      .from("map_data_sources")
      .select("refresh_token")
      .eq("map_id", mapId)
      .eq("provider", "google_sheets")
      .maybeSingle();

    if (error) throw error;
    if (!src?.refresh_token) return json({ error: "Not connected" }, 400);

    const { access_token } = await refreshAccessToken(src.refresh_token);

    const mimeTypes = [
      "application/vnd.google-apps.spreadsheet",
      "text/csv",
      "application/csv",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ].map((m) => `mimeType='${m}'`).join(" or ");

    const nameFilter = query?.trim()
      ? ` and name contains '${query.trim().replace(/'/g, "\\'")}'`
      : "";

    const q = `(${mimeTypes}) and trashed=false${nameFilter}`;

    const u = new URL("https://www.googleapis.com/drive/v3/files");
    u.searchParams.set("q", q);
    u.searchParams.set("fields", "files(id,name,mimeType,modifiedTime)");
    u.searchParams.set("orderBy", "modifiedTime desc");
    u.searchParams.set("pageSize", "50");
    u.searchParams.set("includeItemsFromAllDrives", "true");
    u.searchParams.set("supportsAllDrives", "true");
    u.searchParams.set("corpora", "allDrives");

    const res = await fetch(u.toString(), {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const driveData = await res.json();
    if (!res.ok) throw new Error(`Drive API error: ${JSON.stringify(driveData)}`);

    return json({ files: driveData.files ?? [] });
  } catch (e) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

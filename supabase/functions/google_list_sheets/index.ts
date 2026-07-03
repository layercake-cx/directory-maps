import { requireMapAccess, createServiceClient } from "../_shared/supabase.ts";
import { refreshAccessToken, describeGoogleApiError } from "../_shared/google.ts";

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

const FILE_MIME_TYPES = [
  "application/vnd.google-apps.spreadsheet",
  "text/csv",
  "application/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  try {
    const { mapId, query, folderId } = await req.json();
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

    const commonParams = {
      fields: "files(id,name,mimeType,modifiedTime)",
      pageSize: "100",
      includeItemsFromAllDrives: "true",
      supportsAllDrives: "true",
      corpora: "allDrives",
    };

    if (query?.trim()) {
      // Search mode: filter by accepted file types + name query, return flat file list
      const mimeFilter = FILE_MIME_TYPES.map((m) => `mimeType='${m}'`).join(" or ");
      const nameFilter = ` and name contains '${query.trim().replace(/'/g, "\\'")}'`;
      const q = `(${mimeFilter}) and trashed=false${nameFilter}`;

      const u = new URL("https://www.googleapis.com/drive/v3/files");
      u.searchParams.set("q", q);
      u.searchParams.set("orderBy", "modifiedTime desc");
      Object.entries(commonParams).forEach(([k, v]) => u.searchParams.set(k, v));

      const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${access_token}` } });
      const driveData = await res.json();
      if (!res.ok) throw new Error(describeGoogleApiError("Drive API error", driveData));

      return json({ files: driveData.files ?? [] });
    }

    // Browse mode: list folders and accepted files inside the given folder (or root)
    const parent = folderId ?? "root";
    const q = `'${parent}' in parents and trashed=false`;

    const u = new URL("https://www.googleapis.com/drive/v3/files");
    u.searchParams.set("q", q);
    u.searchParams.set("orderBy", "folder,name");
    Object.entries(commonParams).forEach(([k, v]) => u.searchParams.set(k, v));

    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${access_token}` } });
    const driveData = await res.json();
    if (!res.ok) throw new Error(describeGoogleApiError("Drive API error", driveData));

    const all: Array<{ id: string; name: string; mimeType: string; modifiedTime: string }> = driveData.files ?? [];
    const folders = all.filter((f) => f.mimeType === "application/vnd.google-apps.folder");
    const files = all.filter((f) => FILE_MIME_TYPES.includes(f.mimeType));

    return json({ folders, files });
  } catch (e) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

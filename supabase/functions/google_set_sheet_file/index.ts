import { requireMapAccess, createServiceClient } from "../_shared/supabase.ts";
import { refreshAccessToken, fetchSpreadsheetMeta } from "../_shared/google.ts";

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

function extractSpreadsheetId(input: string) {
  const m = input.match(/\/spreadsheets\/d\/([^/]+)/);
  return m?.[1] ?? input;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  try {
    const { mapId, spreadsheetId, mimeType, fileName } = await req.json();
    await requireMapAccess(req, mapId);
    if (!mapId) return json({ error: "Missing mapId" }, 400);
    if (!spreadsheetId) return json({ error: "Missing spreadsheetId" }, 400);

    const id = extractSpreadsheetId(spreadsheetId);
    const isGoogleSheet = !mimeType || mimeType === "application/vnd.google-apps.spreadsheet";

    const service = createServiceClient();
    const { data, error } = await service
      .from("map_data_sources")
      .select("refresh_token")
      .eq("map_id", mapId)
      .eq("provider", "google_sheets")
      .maybeSingle();

    if (error) throw error;
    if (!data?.refresh_token) return json({ error: "Not connected" }, 400);

    let sheetName: string | null = fileName ?? null;
    let sheetId: number | null = null;

    if (isGoogleSheet) {
      const { access_token } = await refreshAccessToken(data.refresh_token);
      const meta = await fetchSpreadsheetMeta(access_token, id);
      const first = meta?.sheets?.[0]?.properties;
      sheetName = first?.title ?? "Sheet1";
      sheetId = first?.sheetId ?? null;
    }

    const { error: upErr } = await service.from("map_data_sources").update({
      spreadsheet_id: id,
      sheet_name: sheetName,
      sheet_id: sheetId,
      updated_at: new Date().toISOString(),
    }).eq("map_id", mapId);
    if (upErr) throw upErr;

    return json({ ok: true, spreadsheetId: id, sheetName, sheetId, mimeType: mimeType ?? null });
  } catch (e) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

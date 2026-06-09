import { requireMapAccess, createServiceClient } from "../_shared/supabase.ts";
import { refreshAccessToken, fetchSheetValues, fetchDriveFileAsText } from "../_shared/google.ts";
import { parseCSV, validateSheetRows } from "../_shared/sheetData.ts";
import { logEdgeFunctionError } from "../_shared/errorLog.ts";

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
    await requireMapAccess(req, mapId);
    if (!mapId) return json({ error: "Missing mapId" }, 400);

    const service = createServiceClient();
    const { data: src, error } = await service
      .from("map_data_sources")
      .select("refresh_token, spreadsheet_id, sheet_name, sheet_id, enabled, last_synced_at, last_sync_status, last_sync_error")
      .eq("map_id", mapId)
      .eq("provider", "google_sheets")
      .maybeSingle();

    if (error) throw error;
    if (!src) return json({ connected: false });
    if (!src.spreadsheet_id) {
      return json({ connected: true, configured: false, last_sync_status: src.last_sync_status, last_sync_error: src.last_sync_error });
    }

    const { access_token } = await refreshAccessToken(src.refresh_token);
    let rows: string[][] = [];
    if (src.sheet_id === null) {
      const text = await fetchDriveFileAsText(access_token, src.spreadsheet_id);
      rows = parseCSV(text);
    } else {
      const values = await fetchSheetValues(access_token, src.spreadsheet_id, src.sheet_name);
      rows = values.values ?? [];
    }

    const validation = validateSheetRows(rows);

    return json({
      connected: true,
      configured: true,
      ok: validation.ok,
      issues: validation.issues,
      headers: validation.headers,
      dataRowCount: validation.dataRowCount,
      rowsWithName: validation.rowsWithName,
      sample: rows.slice(1, 6),
      sheet: { spreadsheet_id: src.spreadsheet_id, sheet_name: src.sheet_name },
      last_synced_at: src.last_synced_at,
      last_sync_status: src.last_sync_status,
      last_sync_error: src.last_sync_error,
    });
  } catch (e) {
    logEdgeFunctionError({ fn: "validate_sheet_source", message: e?.message ?? String(e) });
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

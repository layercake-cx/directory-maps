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
    try {
      if (src.sheet_id === null) {
        const text = await fetchDriveFileAsText(access_token, src.spreadsheet_id);
        rows = parseCSV(text);
      } else {
        const values = await fetchSheetValues(access_token, src.spreadsheet_id, src.sheet_name);
        rows = values.values ?? [];
      }
    } catch (readErr) {
      // A read failure here (e.g. a picked file that never got a real per-file grant
      // under drive.file) must not collapse the whole response into "not connected" —
      // that hides the Change file / Disconnect recovery buttons on a map that IS
      // still connected, just pointing at an unreadable file. Report it as an issue
      // on an otherwise-connected, otherwise-configured source instead.
      const msg = readErr?.message ?? String(readErr);
      const friendly = /not found/i.test(msg)
        ? "The connected file couldn't be found or accessed by this app — click Change file to re-select it."
        : msg;
      return json({
        connected: true,
        configured: true,
        ok: false,
        issues: [friendly],
        sheet: { spreadsheet_id: src.spreadsheet_id, sheet_name: src.sheet_name },
        last_synced_at: src.last_synced_at,
        last_sync_status: src.last_sync_status,
        last_sync_error: src.last_sync_error,
      });
    }

    const validation = validateSheetRows(rows);

    // Report presence of custom filter field columns (filter_<key>). Absence is
    // informational (those listings simply won't be tagged), not a hard failure.
    let filterColumns: Array<{ key: string; label: string; column: string; present: boolean }> = [];
    try {
      const { data: fieldRows } = await service
        .from("map_filter_fields")
        .select("key, label, is_active")
        .eq("map_id", mapId)
        .eq("is_active", true);
      filterColumns = (fieldRows ?? []).map((f: any) => ({
        key: f.key,
        label: f.label,
        column: `filter_${f.key}`,
        present: validation.headers.includes(`filter_${f.key}`),
      }));
      const missing = filterColumns.filter((c) => !c.present);
      if (missing.length) {
        validation.issues.push(
          `Optional: no column${missing.length === 1 ? "" : "s"} for filter field${missing.length === 1 ? "" : "s"} ${missing.map((m) => m.column).join(", ")} — add ${missing.length === 1 ? "it" : "them"} to tag listings on sync.`
        );
      }
    } catch { /* filter columns are optional; ignore lookup errors */ }

    return json({
      connected: true,
      configured: true,
      ok: validation.ok,
      issues: validation.issues,
      headers: validation.headers,
      filterColumns,
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

import { requireMapAccess, createServiceClient } from "../_shared/supabase.ts";
import { refreshAccessToken, fetchSheetValues } from "../_shared/google.ts";

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

const REQUIRED_HEADERS = ["id", "name"];

function normalizeHeader(h: string) {
  return String(h ?? "").trim().toLowerCase();
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

    // CSV / non-Google-Sheet files: sheet_id is null, skip Sheets API
    if (src.sheet_id === null) {
      return json({
        connected: true, configured: true, ok: true, issues: [],
        sheet: { spreadsheet_id: src.spreadsheet_id, sheet_name: src.sheet_name },
        last_synced_at: src.last_synced_at, last_sync_status: src.last_sync_status, last_sync_error: src.last_sync_error,
      });
    }

    const { access_token } = await refreshAccessToken(src.refresh_token);
    const values = await fetchSheetValues(access_token, src.spreadsheet_id, src.sheet_name);
    const rows = values.values ?? [];
    if (rows.length < 2) {
      return json({ connected: true, configured: true, ok: false, issues: ["Sheet looks empty (needs header + at least 1 row)."] });
    }

    const headers = (rows[0] ?? []).map(normalizeHeader);
    const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
    const issues: string[] = [];
    if (missing.length) issues.push(`Missing required column(s): ${missing.join(", ")}`);

    const idIdx = headers.indexOf("id");
    if (idIdx >= 0) {
      const seen = new Set<string>();
      for (let i = 1; i < Math.min(rows.length, 2001); i++) {
        const id = String(rows[i]?.[idIdx] ?? "").trim();
        if (!id) continue;
        if (seen.has(id)) {
          issues.push(`Duplicate id found: ${id}`);
          break;
        }
        seen.add(id);
      }
    }

    return json({
      connected: true,
      configured: true,
      ok: issues.length === 0,
      issues,
      headers,
      sample: rows.slice(1, 6),
      sheet: { spreadsheet_id: src.spreadsheet_id, sheet_name: src.sheet_name },
      last_synced_at: src.last_synced_at,
      last_sync_status: src.last_sync_status,
      last_sync_error: src.last_sync_error,
    });
  } catch (e) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

import { requireAdmin, createServiceClient } from "../_shared/supabase.ts";
import { refreshAccessToken, fetchSheetValues } from "../_shared/google.ts";

const REQUIRED_HEADERS = ["id", "name"];

function normalizeHeader(h: string) {
  return String(h ?? "").trim().toLowerCase();
}

Deno.serve(async (req) => {
  try {
    await requireAdmin(req);
    const { mapId } = await req.json();
    if (!mapId) return new Response("Missing mapId", { status: 400 });

    const service = createServiceClient();
    const { data: src, error } = await service
      .from("map_data_sources")
      .select("refresh_token, spreadsheet_id, sheet_name, enabled, last_synced_at, last_sync_status, last_sync_error")
      .eq("map_id", mapId)
      .eq("provider", "google_sheets")
      .maybeSingle();

    if (error) throw error;
    if (!src) return Response.json({ connected: false });
    if (!src.spreadsheet_id || !src.sheet_name) {
      return Response.json({ connected: true, configured: false, last_sync_status: src.last_sync_status, last_sync_error: src.last_sync_error });
    }

    const { access_token } = await refreshAccessToken(src.refresh_token);
    const values = await fetchSheetValues(access_token, src.spreadsheet_id, src.sheet_name);
    const rows = values.values ?? [];
    if (rows.length < 2) {
      return Response.json({ connected: true, configured: true, ok: false, issues: ["Sheet looks empty (needs header + at least 1 row)."] });
    }

    const headers = (rows[0] ?? []).map(normalizeHeader);
    const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
    const issues: string[] = [];
    if (missing.length) issues.push(`Missing required column(s): ${missing.join(", ")}`);

    // quick uniqueness check for id (first 2000 rows)
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

    return Response.json({
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
    return Response.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
});


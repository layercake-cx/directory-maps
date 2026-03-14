import { requireAdmin, createServiceClient } from "../_shared/supabase.ts";
import { refreshAccessToken, fetchSpreadsheetMeta } from "../_shared/google.ts";

function extractSpreadsheetId(input: string) {
  // Accept raw id or full URL.
  const m = input.match(/\/spreadsheets\/d\/([^/]+)/);
  return m?.[1] ?? input;
}

Deno.serve(async (req) => {
  try {
    await requireAdmin(req);
    const { mapId, spreadsheetId } = await req.json();
    if (!mapId) return new Response("Missing mapId", { status: 400 });
    if (!spreadsheetId) return new Response("Missing spreadsheetId", { status: 400 });

    const id = extractSpreadsheetId(spreadsheetId);
    const service = createServiceClient();
    const { data, error } = await service
      .from("map_data_sources")
      .select("refresh_token")
      .eq("map_id", mapId)
      .eq("provider", "google_sheets")
      .maybeSingle();

    if (error) throw error;
    if (!data?.refresh_token) return new Response("Not connected", { status: 400 });

    const { access_token } = await refreshAccessToken(data.refresh_token);
    const meta = await fetchSpreadsheetMeta(access_token, id);
    const first = meta?.sheets?.[0]?.properties;
    const sheetName = first?.title ?? "Sheet1";
    const sheetId = first?.sheetId ?? null;

    const { error: upErr } = await service.from("map_data_sources").update({
      spreadsheet_id: id,
      sheet_name: sheetName,
      sheet_id: sheetId,
      updated_at: new Date().toISOString(),
    }).eq("map_id", mapId);
    if (upErr) throw upErr;

    return Response.json({ ok: true, spreadsheetId: id, sheetName, sheetId });
  } catch (e) {
    return Response.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
});


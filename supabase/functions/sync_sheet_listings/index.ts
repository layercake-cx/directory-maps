import { requireMapAccess, createServiceClient } from "../_shared/supabase.ts";
import { refreshAccessToken, fetchSheetValues, fetchDriveFileAsText } from "../_shared/google.ts";
import { normalizeHeader, parseCSV, validateSheetRows } from "../_shared/sheetData.ts";
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

function boolish(v: unknown) {
  const s = String(v ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  return null;
}

async function geocodeGoogle(apiKey: string, address: string) {
  const url =
    "https://maps.googleapis.com/maps/api/geocode/json?address=" +
    encodeURIComponent(address) +
    "&key=" +
    encodeURIComponent(apiKey);
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== "OK" || !data.results?.length) {
    return { ok: false, status: data.status || "ERROR", lat: null as number | null, lng: null as number | null };
  }
  const loc = data.results[0].geometry.location;
  return { ok: true, status: "OK", lat: loc.lat as number, lng: loc.lng as number };
}

async function fetchRows(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string | null,
  sheetId: number | null,
): Promise<string[][]> {
  if (sheetId === null) {
    // CSV / non-Google-Sheet: download directly from Drive
    const text = await fetchDriveFileAsText(accessToken, spreadsheetId);
    return parseCSV(text);
  }
  // Google Sheet: use Sheets API
  const values = await fetchSheetValues(accessToken, spreadsheetId, sheetName!);
  return values.values ?? [];
}

async function stableId(mapId: string, name: string): Promise<string> {
  const data = new TextEncoder().encode(`${mapId}:${name.trim().toLowerCase()}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const h = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}

function deriveErrorCode(e: unknown): string {
  const msg = String((e as any)?.message ?? e ?? "").toLowerCase();
  if (msg.includes("missing required")) return "MISSING_COLUMNS";
  if (msg.includes("empty")) return "SHEET_EMPTY";
  if (msg.includes("no file selected")) return "NO_FILE";
  if (msg.includes("fetch") || msg.includes("network")) return "NETWORK_ERROR";
  return "UNKNOWN";
}

type SyncDiagnostics = {
  rows: number;
  dataRowCount: number;
  skippedNoName: number;
  warnings: string[];
  headers: string[];
  insertCount: number;
  updateCount: number;
};

async function syncSource(
  service: ReturnType<typeof createServiceClient>,
  src: { map_id: string; client_id: string; refresh_token: string; spreadsheet_id: string; sheet_name: string | null; sheet_id: number | null },
  geocodeKey: string,
): Promise<SyncDiagnostics> {
  const { access_token } = await refreshAccessToken(src.refresh_token);
  const rows = await fetchRows(access_token, src.spreadsheet_id, src.sheet_name, src.sheet_id);

  const validation = validateSheetRows(rows);
  if (!validation.ok && validation.issues.some((i) => i.includes("Missing required"))) {
    throw new Error(validation.issues.join(" "));
  }
  if (rows.length < 2) throw new Error("File is empty (needs header row + at least 1 data row)");

  const headers = validation.headers;
  const idx = (name: string) => headers.indexOf(name);
  const idIdx = idx("id");
  const nameIdx = idx("name");
  if (idIdx < 0 || nameIdx < 0) throw new Error("Missing required columns: id, name");

  let skippedNoName = 0;

  const groupNameIdx = idx("group_name") >= 0 ? idx("group_name") : idx("group");

  // Collect unique group names from the data
  const csvGroupNames = new Set<string>();
  if (groupNameIdx >= 0) {
    for (let i = 1; i < rows.length; i++) {
      const raw = String(rows[i]?.[groupNameIdx] ?? "").trim();
      if (raw) csvGroupNames.add(raw);
    }
  }

  // Load existing groups
  const { data: existingGroups, error: gErr } = await service
    .from("groups")
    .select("id,name")
    .eq("map_id", src.map_id);
  if (gErr) throw gErr;

  const groupLookup = new Map<string, string>();
  (existingGroups ?? []).forEach((g: any) =>
    groupLookup.set(String(g.name ?? "").trim().toLowerCase(), g.id)
  );

  // Create any groups that exist in the CSV but not in the DB
  const missingGroups = [...csvGroupNames].filter(
    (n) => !groupLookup.has(n.toLowerCase())
  );
  if (missingGroups.length) {
    const toInsert = missingGroups.map((name, i) => ({
      map_id: src.map_id,
      name,
      sort_order: (existingGroups?.length ?? 0) + i,
    }));
    const { data: created, error: cErr } = await service
      .from("groups")
      .insert(toInsert)
      .select("id,name");
    if (cErr) throw cErr;
    (created ?? []).forEach((g: any) =>
      groupLookup.set(String(g.name ?? "").trim().toLowerCase(), g.id)
    );
  }

  const cleaned: any[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const name = String(r[nameIdx] ?? "").trim();
    if (!name) {
      skippedNoName++;
      continue;
    }
    const id = String(r[idIdx] ?? "").trim() || await stableId(src.map_id, name);

    const get = (h: string) => {
      const j = idx(h);
      return j >= 0 ? (r[j] ?? "") : "";
    };

    const address = String(get("address")).trim() || null;
    const postcode = String(get("postcode")).trim() || null;
    const country = String(get("country")).trim() || null;

    const latRaw = String(get("lat")).trim();
    const lngRaw = String(get("lng")).trim();
    let lat = latRaw === "" ? null : Number(latRaw);
    let lng = lngRaw === "" ? null : Number(lngRaw);
    if (Number.isNaN(lat as any)) lat = null;
    if (Number.isNaN(lng as any)) lng = null;

    const groupRaw = groupNameIdx >= 0 ? String(r[groupNameIdx] ?? "").trim().toLowerCase() : "";
    const group_id = groupRaw ? groupLookup.get(groupRaw) ?? null : null;

    const notesRaw = String(get("notes_html") || get("description")).trim() || null;
    const explicitAllowHtml = boolish(get("allow_html"));
    const hasHtmlTags = notesRaw ? /<[a-z][\s\S]*>/i.test(notesRaw) : false;

    const record: any = {
      id,
      map_id: src.map_id,
      name,
      address,
      postcode,
      country,
      lat,
      lng,
      website_url: String(get("website_url")).trim() || null,
      email: String(get("email")).trim() || null,
      phone: String(get("phone")).trim() || null,
      logo_url: String(get("logo_url")).trim() || null,
      notes_html: notesRaw,
      allow_html: explicitAllowHtml ?? hasHtmlTags,
      group_id,
      is_active: boolish(get("is_active")) ?? true,
      source: "integration",
    };

    if ((record.lat == null || record.lng == null) && geocodeKey) {
      const parts = [record.address, record.postcode, record.country].filter(Boolean);
      if (parts.length) {
        const geo = await geocodeGoogle(geocodeKey, parts.join(", "));
        record.geocode_status = geo.ok ? "OK" : geo.status;
        record.geocoded_at = new Date().toISOString();
        if (geo.ok) { record.lat = geo.lat; record.lng = geo.lng; }
        await new Promise((res) => setTimeout(res, 120));
      }
    }

    cleaned.push(record);
  }

  // Deduplicate by id — keep last occurrence (latest row wins)
  const deduped = [...new Map(cleaned.map((r: any) => [r.id, r])).values()];

  const { data: existing } = await service.from("listings").select("id").eq("map_id", src.map_id);
  const existingIds = new Set((existing ?? []).map((r: any) => r.id));
  const insertCount = deduped.filter((r: any) => !existingIds.has(r.id)).length;
  const updateCount = deduped.filter((r: any) => existingIds.has(r.id)).length;

  const { error: upErr } = await service.from("listings").upsert(deduped, { onConflict: "id" });
  if (upErr) throw upErr;

  const warnings = [...validation.issues];
  if (skippedNoName > 0) {
    warnings.push(`${skippedNoName} row(s) skipped because the name column was empty.`);
  }
  if (deduped.length === 0) {
    warnings.push("No listings were imported. Add data rows with id and name, or use the Spreadsheet / CSV tab to upload a file directly.");
  }

  return {
    rows: deduped.length,
    dataRowCount: validation.dataRowCount,
    skippedNoName,
    warnings,
    headers,
    insertCount,
    updateCount,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const service = createServiceClient();
  const geocodeKey = Deno.env.get("GOOGLE_GEOCODING_API_KEY") ?? "";

  // Parse body — may be empty for cron calls
  let targetMapId: string | null = null;
  let targetSchedule: string | null = null;
  try {
    const body = await req.json();
    if (body?.mapId) {
      await requireMapAccess(req, body.mapId);
      targetMapId = body.mapId;
    } else if (body?.schedule) {
      targetSchedule = body.schedule;
    }
  } catch {
    // Cron mode or unauthenticated — process all enabled sources
  }

  let query = service
    .from("map_data_sources")
    .select("map_id, client_id, refresh_token, spreadsheet_id, sheet_name, sheet_id")
    .eq("provider", "google_sheets")
    .eq("enabled", true);

  if (targetMapId) query = query.eq("map_id", targetMapId);
  else if (targetSchedule) query = query.eq("sync_schedule", targetSchedule);

  const { data: sources, error: srcErr } = await query;

  if (srcErr) return json({ error: srcErr.message }, 500);

  if (targetMapId && (!sources || sources.length === 0)) {
    return json({
      ok: true,
      results: [{
        map_id: targetMapId,
        ok: false,
        error: "No enabled Google sync source for this map. Connect Google Drive, choose a spreadsheet or CSV file, then try again.",
      }],
    });
  }

  const results: any[] = [];

  for (const src of sources ?? []) {
    const startedAt = new Date().toISOString();

    const { data: logRow } = await service.from("sync_logs").insert({
      map_id: src.map_id,
      client_id: src.client_id,
      provider: "google_sheets",
      started_at: startedAt,
      status: "running",
    }).select("id").single();
    const logId = logRow?.id ?? null;

    try {
      if (!src.spreadsheet_id) {
        results.push({ map_id: src.map_id, ok: false, error: "No file selected" });
        if (logId) {
          await service.from("sync_logs").update({
            status: "error",
            completed_at: new Date().toISOString(),
            error_code: "NO_FILE",
            error_message: "No file selected",
          }).eq("id", logId);
        }
        continue;
      }

      const syncResult = await syncSource(service, src as any, geocodeKey);
      const syncWarning = syncResult.warnings.length ? syncResult.warnings.join(" ") : null;

      await service.from("map_data_sources").update({
        last_synced_at: new Date().toISOString(),
        last_sync_status: syncResult.rows > 0 ? "OK" : "WARNING",
        last_sync_error: syncWarning,
        updated_at: new Date().toISOString(),
      }).eq("map_id", src.map_id);

      if (logId) {
        await service.from("sync_logs").update({
          status: syncResult.warnings.length ? "warning" : "success",
          completed_at: new Date().toISOString(),
          total_rows: syncResult.rows,
          inserted_count: syncResult.insertCount,
          updated_count: syncResult.updateCount,
        }).eq("id", logId);
      }

      service.from("admin_events").insert({
        event_type: "data_sync_completed",
        meta: {
          actor_admin_scope: "platform_superadmin",
          client_id: src.client_id,
          map_id: src.map_id,
          provider: "google_sheets",
          rows_synced: syncResult.rows,
          warnings: syncResult.warnings,
          source: "edge_function",
        }
      }).then(() => {});

      results.push({
        map_id: src.map_id,
        ok: true,
        rows: syncResult.rows,
        dataRowCount: syncResult.dataRowCount,
        skippedNoName: syncResult.skippedNoName,
        warnings: syncResult.warnings,
        headers: syncResult.headers,
        startedAt,
      });

      // Regenerate the public snapshot so the embed reflects the updated data
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      fetch(`${supabaseUrl}/functions/v1/generate_map_snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ map_id: src.map_id }),
      }).catch(() => {}); // fire-and-forget; don't fail the sync if snapshot errors

    } catch (e) {
      await service.from("map_data_sources").update({
        last_sync_status: "ERROR",
        last_sync_error: e?.message ?? String(e),
        updated_at: new Date().toISOString(),
      }).eq("map_id", src.map_id);

      if (logId) {
        await service.from("sync_logs").update({
          status: "error",
          completed_at: new Date().toISOString(),
          error_code: deriveErrorCode(e),
          error_message: e?.message ?? String(e),
          error_detail: JSON.stringify(e),
        }).eq("id", logId);
      }

      service.from("admin_events").insert({
        event_type: "data_sync_failed",
        meta: {
          actor_admin_scope: "platform_superadmin",
          client_id: src.client_id,
          map_id: src.map_id,
          provider: "google_sheets",
          error: e?.message ?? String(e),
          source: "edge_function",
        }
      }).then(() => {});

      logEdgeFunctionError({ fn: "sync_sheet_listings", message: e?.message ?? String(e), context: { map_id: src.map_id, client_id: src.client_id } });
      results.push({ map_id: src.map_id, ok: false, error: e?.message ?? String(e), startedAt });
    }
  }

  return json({ ok: true, results });
});

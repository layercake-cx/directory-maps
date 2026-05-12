import { requireMapAccess, createServiceClient } from "../_shared/supabase.ts";
import { refreshAccessToken, fetchSheetValues, fetchDriveFileAsText } from "../_shared/google.ts";

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

function normalizeHeader(h: string) {
  return String(h ?? "").trim().toLowerCase();
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

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const cols: string[] = [];
  let cur = "", inQuote = false;

  for (let i = 0; i <= text.length; i++) {
    const ch = i < text.length ? text[i] : "\n";
    if (ch === '"') {
      if (inQuote && text[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      cols.push(cur); cur = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuote) {
      cols.push(cur); cur = "";
      if (cols.length > 1 || cols[0] !== "") rows.push([...cols]);
      cols.length = 0;
      if (ch === "\r" && text[i + 1] === "\n") i++;
    } else {
      cur += ch;
    }
  }

  return rows;
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

async function syncSource(
  service: ReturnType<typeof createServiceClient>,
  src: { map_id: string; refresh_token: string; spreadsheet_id: string; sheet_name: string | null; sheet_id: number | null },
  geocodeKey: string,
) {
  const { access_token } = await refreshAccessToken(src.refresh_token);
  const rows = await fetchRows(access_token, src.spreadsheet_id, src.sheet_name, src.sheet_id);

  if (rows.length < 2) throw new Error("File is empty (needs header row + at least 1 data row)");

  const headers = (rows[0] ?? []).map(normalizeHeader);
  const idx = (name: string) => headers.indexOf(name);
  const idIdx = idx("id");
  const nameIdx = idx("name");
  if (idIdx < 0 || nameIdx < 0) throw new Error("Missing required columns: id, name");

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
    const id = String(r[idIdx] ?? "").trim();
    const name = String(r[nameIdx] ?? "").trim();
    if (!id || !name) continue;

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

  const { error: upErr } = await service.from("listings").upsert(deduped, { onConflict: "id" });
  if (upErr) throw upErr;

  return deduped.length;
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
    .select("map_id, refresh_token, spreadsheet_id, sheet_name, sheet_id")
    .eq("provider", "google_sheets")
    .eq("enabled", true);

  if (targetMapId) query = query.eq("map_id", targetMapId);
  else if (targetSchedule) query = query.eq("sync_schedule", targetSchedule);

  const { data: sources, error: srcErr } = await query;

  if (srcErr) return json({ error: srcErr.message }, 500);

  const results: any[] = [];

  for (const src of sources ?? []) {
    const startedAt = new Date().toISOString();
    try {
      if (!src.spreadsheet_id) {
        results.push({ map_id: src.map_id, ok: false, error: "No file selected" });
        continue;
      }

      const rowCount = await syncSource(service, src as any, geocodeKey);

      await service.from("map_data_sources").update({
        last_synced_at: new Date().toISOString(),
        last_sync_status: "OK",
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      }).eq("map_id", src.map_id);

      results.push({ map_id: src.map_id, ok: true, rows: rowCount, startedAt });
    } catch (e) {
      await service.from("map_data_sources").update({
        last_sync_status: "ERROR",
        last_sync_error: e?.message ?? String(e),
        updated_at: new Date().toISOString(),
      }).eq("map_id", src.map_id);
      results.push({ map_id: src.map_id, ok: false, error: e?.message ?? String(e), startedAt });
    }
  }

  return json({ ok: true, results });
});

import { createServiceClient } from "../_shared/supabase.ts";
import { refreshAccessToken, fetchSheetValues } from "../_shared/google.ts";

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
  const json = await res.json();
  if (json.status !== "OK" || !json.results?.length) {
    return { ok: false, status: json.status || "ERROR", lat: null as number | null, lng: null as number | null };
  }
  const loc = json.results[0].geometry.location;
  return { ok: true, status: "OK", lat: loc.lat as number, lng: loc.lng as number };
}

function normalizeHeader(h: string) {
  return String(h ?? "").trim().toLowerCase();
}

Deno.serve(async (_req) => {
  const service = createServiceClient();
  const geocodeKey = Deno.env.get("GOOGLE_GEOCODING_API_KEY") ?? "";

  const { data: sources, error: srcErr } = await service
    .from("map_data_sources")
    .select("map_id, refresh_token, spreadsheet_id, sheet_name")
    .eq("provider", "google_sheets")
    .eq("enabled", true);

  if (srcErr) return Response.json({ error: srcErr.message }, { status: 500 });

  const results: any[] = [];

  for (const src of sources ?? []) {
    const startedAt = new Date().toISOString();
    try {
      if (!src.spreadsheet_id || !src.sheet_name) {
        results.push({ map_id: src.map_id, ok: false, error: "Not configured" });
        continue;
      }

      const { access_token } = await refreshAccessToken(src.refresh_token);
      const values = await fetchSheetValues(access_token, src.spreadsheet_id, src.sheet_name);
      const rows = values.values ?? [];
      if (rows.length < 2) throw new Error("Sheet empty");

      const headers = (rows[0] ?? []).map(normalizeHeader);
      const idx = (name: string) => headers.indexOf(name);
      const idIdx = idx("id");
      const nameIdx = idx("name");
      if (idIdx < 0 || nameIdx < 0) throw new Error("Missing required columns: id, name");

      // load groups for map (to resolve group_name)
      const { data: groups, error: gErr } = await service
        .from("groups")
        .select("id,name")
        .eq("map_id", src.map_id);
      if (gErr) throw gErr;
      const groupLookup = new Map<string, string>();
      (groups ?? []).forEach((g: any) => groupLookup.set(String(g.name ?? "").trim().toLowerCase(), g.id));

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

        const groupName = String(get("group_name")).trim().toLowerCase();
        const group_id = groupName ? groupLookup.get(groupName) ?? null : null;

        const allow_html = boolish(get("allow_html")) ?? false;
        const is_active = boolish(get("is_active")) ?? true;

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
          notes_html: String(get("notes_html")).trim() || null,
          allow_html,
          group_id,
          is_active,
        };

        if ((record.lat == null || record.lng == null) && geocodeKey) {
          const parts = [record.address, record.postcode, record.country].filter(Boolean);
          if (parts.length) {
            const geo = await geocodeGoogle(geocodeKey, parts.join(", "));
            record.geocode_status = geo.ok ? "OK" : geo.status;
            record.geocoded_at = new Date().toISOString();
            if (geo.ok) {
              record.lat = geo.lat;
              record.lng = geo.lng;
            }
            // light throttle
            await new Promise((res) => setTimeout(res, 120));
          }
        }

        cleaned.push(record);
      }

      const { error: upErr } = await service.from("listings").upsert(cleaned, { onConflict: "id" });
      if (upErr) throw upErr;

      await service.from("map_data_sources").update({
        last_synced_at: new Date().toISOString(),
        last_sync_status: "OK",
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      }).eq("map_id", src.map_id);

      results.push({ map_id: src.map_id, ok: true, rows: cleaned.length, startedAt });
    } catch (e) {
      await service.from("map_data_sources").update({
        last_sync_status: "ERROR",
        last_sync_error: e?.message ?? String(e),
        updated_at: new Date().toISOString(),
      }).eq("map_id", src.map_id);
      results.push({ map_id: src.map_id, ok: false, error: e?.message ?? String(e), startedAt });
    }
  }

  return Response.json({ ok: true, results });
});


import { requireMapAccess, createServiceClient } from "../_shared/supabase.ts";

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

async function geocode(apiKey: string, address: string) {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const mapId = body?.mapId;
    if (!mapId) return json({ error: "mapId required" }, 400);

    await requireMapAccess(req, mapId);

    const apiKey = Deno.env.get("GOOGLE_GEOCODING_API_KEY") ?? Deno.env.get("GOOGLE_MAPS_API_KEY") ?? "";
    if (!apiKey) return json({ error: "Geocoding API key not configured" }, 500);

    const service = createServiceClient();

    const { data: listings, error: fetchErr } = await service
      .from("listings")
      .select("id, address, postcode, country, name")
      .eq("map_id", mapId)
      .is("lat", null);

    if (fetchErr) return json({ error: fetchErr.message }, 500);

    let geocoded = 0;
    let failed = 0;

    for (const listing of listings ?? []) {
      const parts = [listing.address, listing.postcode, listing.country].filter(Boolean);
      const address = parts.length ? parts.join(", ") : listing.name;
      if (!address) { failed++; continue; }

      const geo = await geocode(apiKey, address);
      const update: any = {
        geocode_status: geo.ok ? "OK" : geo.status,
        geocoded_at: new Date().toISOString(),
      };
      if (geo.ok) { update.lat = geo.lat; update.lng = geo.lng; geocoded++; }
      else failed++;

      await service.from("listings").update(update).eq("id", listing.id);
      await new Promise((r) => setTimeout(r, 120));
    }

    return json({ ok: true, geocoded, failed });
  } catch (e) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

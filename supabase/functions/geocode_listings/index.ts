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

async function runGeocoding(mapId: string, apiKey: string) {
  const service = createServiceClient();

  const { data: listings, error: fetchErr } = await service
    .from("listings")
    .select("id, address, postcode, country, name")
    .eq("map_id", mapId)
    .is("lat", null);

  if (fetchErr) return;

  for (const listing of listings ?? []) {
    const parts = [listing.address, listing.postcode, listing.country].filter(Boolean);
    const address = parts.length ? parts.join(", ") : listing.name;
    if (!address) {
      await service.from("listings").update({
        geocode_status: "NO_ADDRESS",
        geocoded_at: new Date().toISOString(),
      }).eq("id", listing.id);
      continue;
    }

    const geo = await geocode(apiKey, address);
    const update: Record<string, unknown> = {
      geocode_status: geo.ok ? "OK" : geo.status,
      geocoded_at: new Date().toISOString(),
    };
    if (geo.ok) { update.lat = geo.lat; update.lng = geo.lng; }

    await service.from("listings").update(update).eq("id", listing.id);
    await new Promise((r) => setTimeout(r, 100));
  }
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
    const { count } = await service
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("map_id", mapId)
      .is("lat", null);

    // Kick off geocoding in the background — browser gets an instant response
    // @ts-ignore: EdgeRuntime is available in Supabase edge functions
    EdgeRuntime.waitUntil(runGeocoding(mapId, apiKey));

    return json({ ok: true, queued: count ?? 0 });
  } catch (e) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

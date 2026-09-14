import { requireDirectoryAccess, createServiceClient } from "../_shared/supabase.ts";

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

async function runGeocoding(directoryId: string, apiKey: string) {
  const service = createServiceClient();

  const { data: entries, error: fetchErr } = await service
    .from("directory_entries")
    .select("id, address, postcode, country, name")
    .eq("directory_id", directoryId)
    .is("lat", null);

  if (fetchErr) return;

  for (const entry of entries ?? []) {
    const parts = [entry.address, entry.postcode, entry.country].filter(Boolean);
    const address = parts.length ? parts.join(", ") : entry.name;
    if (!address) {
      await service.from("directory_entries").update({
        geocode_status: "NO_ADDRESS",
        geocoded_at: new Date().toISOString(),
      }).eq("id", entry.id);
      continue;
    }

    const geo = await geocode(apiKey, address);
    const update: Record<string, unknown> = {
      geocode_status: geo.ok ? "OK" : geo.status,
      geocoded_at: new Date().toISOString(),
    };
    if (geo.ok) { update.lat = geo.lat; update.lng = geo.lng; }

    await service.from("directory_entries").update(update).eq("id", entry.id);
    await new Promise((r) => setTimeout(r, 100));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const directoryId = body?.directoryId;
    if (!directoryId) return json({ error: "directoryId required" }, 400);

    await requireDirectoryAccess(req, directoryId);

    const apiKey = Deno.env.get("GOOGLE_GEOCODING_API_KEY") ?? Deno.env.get("GOOGLE_MAPS_API_KEY") ?? "";
    if (!apiKey) return json({ error: "Geocoding API key not configured" }, 500);

    const service = createServiceClient();
    const { count } = await service
      .from("directory_entries")
      .select("id", { count: "exact", head: true })
      .eq("directory_id", directoryId)
      .is("lat", null);

    // Kick off geocoding in the background — browser gets an instant response
    // @ts-ignore: EdgeRuntime is available in Supabase edge functions
    EdgeRuntime.waitUntil(runGeocoding(directoryId, apiKey));

    return json({ ok: true, queued: count ?? 0 });
  } catch (e) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

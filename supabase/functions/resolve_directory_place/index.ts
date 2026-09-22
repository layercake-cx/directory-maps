// Public place lookup for a published directory's Distance from filter.
// Called only when location search is on and the place is not in the
// page's local town list. Cache hits do not call Google. Visitor GPS
// ("near me") never reaches this function.
//
// Request:  POST { directory_id: string, place: string, region?: string }
// Response: { ok: true, label, lat, lng } | { ok: false, error }
import { createServiceClient } from "../_shared/supabase.ts";
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

const MAX_PLACE_LENGTH = 80;
const RATE_LIMIT_PER_MINUTE = 30;

function placeKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function regionCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(value)) return null;
  return value;
}

function countryComponent(region: string | null): string | null {
  if (!region) return null;
  if (region === "uk") return "GB";
  return region.toUpperCase();
}

type GeocodeResult = {
  formatted_address?: string;
  address_components?: { long_name?: string; types?: string[] }[];
  geometry?: { location?: { lat?: number; lng?: number } };
};

function shortLabel(result: GeocodeResult, fallback: string): string {
  const comps = result.address_components || [];
  for (const type of ["postal_town", "locality", "postal_code", "administrative_area_level_2"]) {
    const match = comps.find((component) => (component.types || []).includes(type));
    if (match?.long_name) return match.long_name;
  }
  return fallback;
}

async function geocode(place: string, region: string | null, apiKey: string): Promise<GeocodeResult | null> {
  async function once(withCountry: boolean): Promise<GeocodeResult | null> {
    const params = new URLSearchParams({ address: place, key: apiKey, language: "en" });
    if (region) params.set("region", region);
    const country = withCountry ? countryComponent(region) : null;
    if (country) params.set("components", `country:${country}`);
    const res = await fetch("https://maps.googleapis.com/maps/api/geocode/json?" + params.toString());
    const body = await res.json();
    if (body?.status === "OK" && Array.isArray(body.results) && body.results.length) return body.results[0];
    return null;
  }
  return (await once(true)) ?? (await once(false));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  const service = createServiceClient();
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const directoryId = typeof body.directory_id === "string" ? body.directory_id.trim() : "";
    const place = typeof body.place === "string" ? body.place.trim().slice(0, MAX_PLACE_LENGTH) : "";
    const region = regionCode(body.region);
    const key = placeKey(place);
    if (!directoryId || !key || key.length < 2) return json({ ok: false, error: "invalid" }, 400);

    const { data: directory, error: dirErr } = await service
      .from("directories")
      .select("id, location_search_enabled, is_active")
      .eq("id", directoryId)
      .maybeSingle();
    if (dirErr) throw dirErr;
    if (!directory?.is_active || !directory.location_search_enabled) {
      return json({ ok: false, error: "disabled" });
    }

    const cacheKey = `${region || "_"}|${key}`;
    const { data: cached, error: cacheErr } = await service
      .from("place_geocode_cache")
      .select("label, lat, lng")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (cacheErr) throw cacheErr;
    if (cached && typeof cached.lat === "number" && typeof cached.lng === "number") {
      return json({ ok: true, label: cached.label, lat: cached.lat, lng: cached.lng });
    }

    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count: recentCount, error: rateErr } = await service
      .from("directory_place_resolve_requests")
      .select("id", { count: "exact", head: true })
      .eq("directory_id", directoryId)
      .gte("occurred_at", oneMinuteAgo);
    if (rateErr) throw rateErr;
    if ((recentCount ?? 0) >= RATE_LIMIT_PER_MINUTE) {
      return json({ ok: false, error: "rate_limited" });
    }

    const apiKey = Deno.env.get("GOOGLE_GEOCODING_API_KEY") ?? Deno.env.get("GOOGLE_MAPS_API_KEY") ?? "";
    if (!apiKey) {
      await logEdgeFunctionError({ fn: "resolve_directory_place", message: "Missing geocoding API key" });
      return json({ ok: false, error: "unavailable" }, 500);
    }

    const { error: insertErr } = await service
      .from("directory_place_resolve_requests")
      .insert({ directory_id: directoryId });
    if (insertErr) throw insertErr;

    const result = await geocode(place, region, apiKey);
    const lat = result?.geometry?.location?.lat;
    const lng = result?.geometry?.location?.lng;
    if (!result || typeof lat !== "number" || typeof lng !== "number") {
      return json({ ok: false, error: "not_found" });
    }
    const label = shortLabel(result, place);
    const { error: saveErr } = await service.from("place_geocode_cache").insert({
      cache_key: cacheKey,
      label,
      lat,
      lng,
    });
    // A parallel request may have won the insert. The coordinates are still valid.
    if (saveErr && !String(saveErr.message || "").toLowerCase().includes("duplicate")) {
      console.error(`place_geocode_cache insert failed: ${saveErr.message}`);
    }
    return json({ ok: true, label, lat, lng });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await logEdgeFunctionError({ fn: "resolve_directory_place", message });
    return json({ ok: false, error: "error" }, 500);
  }
});

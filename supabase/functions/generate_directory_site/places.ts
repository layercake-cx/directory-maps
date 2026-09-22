// UK populated places (population over 5,000) used to resolve a town in the
// published directory search without a network call.
// Source: GeoNames cities5000 (https://www.geonames.org/), CC-BY 4.0.
// Country code GB, feature class P. One row per normalised name, keeping
// the highest-population duplicate.
import placesGb from "./placesGb.json" with { type: "json" };

export type PlacePoint = { lat: number; lng: number; label: string };

type PlaceEntry = {
  lat: number | null;
  lng: number | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
};

export const PLACES_GB = placesGb as Record<string, PlacePoint>;

export function placeKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Outward half of a UK postcode ("GL5 1AB" → "GL5"), or null. */
export function outwardPostcode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.trim().toUpperCase().match(/^((?:GIR|[A-PR-UWYZ][A-HK-Y]?[0-9][0-9A-HJKMNPR-Y]?))/);
  return m ? m[1] : null;
}

/**
 * Average coordinates of this directory's own cities and outward postcodes.
 * Overlays the national list so a village that appears on a listing resolves
 * even when it is not in the GeoNames extract.
 */
export function directoryPlaceCentroids(entries: PlaceEntry[]): Record<string, PlacePoint> {
  const buckets = new Map<string, { label: string; lat: number; lng: number; n: number }>();
  function add(label: string, lat: number, lng: number) {
    const key = placeKey(label);
    if (!key) return;
    const existing = buckets.get(key);
    if (!existing) buckets.set(key, { label: label.trim(), lat, lng, n: 1 });
    else {
      existing.lat += lat;
      existing.lng += lng;
      existing.n += 1;
    }
  }
  for (const entry of entries) {
    if (typeof entry.lat !== "number" || typeof entry.lng !== "number") continue;
    if (!Number.isFinite(entry.lat) || !Number.isFinite(entry.lng)) continue;
    if (entry.city?.trim()) add(entry.city, entry.lat, entry.lng);
    const outward = outwardPostcode(entry.postcode);
    if (outward) add(outward, entry.lat, entry.lng);
  }
  const out: Record<string, PlacePoint> = {};
  for (const [key, bucket] of buckets) {
    out[key] = {
      lat: Math.round((bucket.lat / bucket.n) * 10000) / 10000,
      lng: Math.round((bucket.lng / bucket.n) * 10000) / 10000,
      label: bucket.label,
    };
  }
  return out;
}

const UK_NAMES = new Set([
  "uk",
  "u k",
  "united kingdom",
  "gb",
  "great britain",
  "england",
  "scotland",
  "wales",
  "northern ireland",
]);

/** Google Geocoding region bias from the directory's most common country. */
export function dominantGeocodeRegion(entries: PlaceEntry[]): string | null {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const country = placeKey(entry.country || "");
    if (!country) continue;
    counts.set(country, (counts.get(country) || 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [country, n] of counts) {
    if (n > bestN) {
      best = country;
      bestN = n;
    }
  }
  if (!best) return null;
  if (UK_NAMES.has(best)) return "uk";
  if (best === "us" || best === "usa" || best === "united states" || best === "united states of america") return "us";
  if (/^[a-z]{2}$/.test(best)) return best;
  return null;
}

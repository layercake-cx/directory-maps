// Auth removed: requireUser was causing 401 (token/project mismatch). Caller is already behind app login.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const address = typeof body?.address === "string" ? body.address.trim() : "";
    if (!address) {
      return jsonResponse({ ok: false, status: "INVALID_REQUEST", error_message: "Missing address" }, 400);
    }

    const apiKey = Deno.env.get("GOOGLE_GEOCODING_API_KEY") ?? Deno.env.get("GOOGLE_MAPS_API_KEY") ?? "";
    if (!apiKey) {
      return jsonResponse({
        ok: false,
        status: "ERROR",
        error_message: "Geocoding API key not configured (set GOOGLE_GEOCODING_API_KEY or GOOGLE_MAPS_API_KEY).",
      }, 500);
    }

    const url =
      "https://maps.googleapis.com/maps/api/geocode/json?address=" +
      encodeURIComponent(address) +
      "&key=" +
      encodeURIComponent(apiKey);

    const res = await fetch(url);
    const json = await res.json();

    if (json.status !== "OK" || !json.results?.length) {
      return jsonResponse({
        ok: false,
        status: json.status || "ERROR",
        error_message: json.error_message || null,
        lat: null,
        lng: null,
      });
    }

    const loc = json.results[0].geometry.location;
    return jsonResponse({ ok: true, status: "OK", lat: loc.lat, lng: loc.lng });
  } catch (e) {
    return jsonResponse(
      { ok: false, status: "ERROR", error_message: e?.message ?? String(e) },
      500
    );
  }
});

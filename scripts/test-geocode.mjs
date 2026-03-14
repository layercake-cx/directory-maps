#!/usr/bin/env node
/**
 * Test the geocode_address Edge Function (no auth).
 * Usage: node scripts/test-geocode.mjs [SUPABASE_URL]
 * Example: node scripts/test-geocode.mjs https://abcdefgh.supabase.co
 * Or set SUPABASE_URL in env.
 */
const baseUrl = process.argv[2] || process.env.SUPABASE_URL;
if (!baseUrl) {
  console.error("Usage: node scripts/test-geocode.mjs <SUPABASE_URL>");
  console.error("Example: node scripts/test-geocode.mjs https://xxxx.supabase.co");
  process.exit(1);
}

const url = `${baseUrl.replace(/\/$/, "")}/functions/v1/geocode_address`;
const address = process.argv[3] || "London, UK";

console.log("POST", url);
console.log("Body:", { address });
console.log("");

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ address }),
});

const data = await res.json().catch(() => ({}));
console.log("Status:", res.status);
console.log("Response:", JSON.stringify(data, null, 2));

if (res.status === 401) {
  console.error("\n401 = Supabase gateway rejected the request (no JWT or invalid JWT).");
  console.error("Redeploy with: supabase functions deploy geocode_address --no-verify-jwt");
  process.exit(1);
}
process.exit(res.ok ? 0 : 1);

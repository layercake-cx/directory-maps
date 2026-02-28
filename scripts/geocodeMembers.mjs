import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

// ---- Load env (single source of truth) ----
const envPath = ".env.local";
if (!fs.existsSync(envPath)) {
  throw new Error(`Can't find ${envPath}. Run this from the project root.`);
}
dotenv.config({ path: envPath });

console.log("Loaded env from", envPath);
console.log("Has SUPABASE URL:", !!process.env.VITE_SUPABASE_URL);
console.log("Has GEOCODING KEY:", !!process.env.GOOGLE_GEOCODING_API_KEY);

// ---- Env vars ----
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const GOOGLE_KEY = process.env.GOOGLE_GEOCODING_API_KEY;

// ✅ CHANGE THESE
const TABLE = "listings";
const ID_COL = "id";
const ADDRESS_COL = "address";

// Optional fields to update (must exist)
const LAT_COL = "lat";
const LNG_COL = "lng";
const STATUS_COL = "geocode_status";
const TS_COL = "geocoded_at";

// Batch controls
const FETCH_LIMIT = 500;
const MAX_GEOCODES_THIS_RUN = 200; // start lower to avoid quota
const SLEEP_MS = 250;
const COUNTRY_BIAS = "UK";

if (!SUPABASE_URL) throw new Error("Missing VITE_SUPABASE_URL");
if (!SUPABASE_ANON_KEY) throw new Error("Missing VITE_SUPABASE_ANON_KEY");
if (!GOOGLE_KEY) throw new Error("Missing GOOGLE_GEOCODING_API_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normaliseAddress(a) {
  const s = (a || "").trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  const hasCountry =
    lower.includes(" united kingdom") ||
    lower.endsWith(" uk") ||
    lower.includes(", uk") ||
    lower.includes(" england") ||
    lower.includes(" scotland") ||
    lower.includes(" wales") ||
    lower.includes(" northern ireland");
  return hasCountry ? s : `${s}, United Kingdom`;
}

async function geocode(address) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", GOOGLE_KEY);
  url.searchParams.set("region", COUNTRY_BIAS.toLowerCase());

  const res = await fetch(url.toString());
  if (!res.ok) return { ok: false, status: `HTTP_${res.status}` };

  const json = await res.json();
  const status = json.status;

  if (status === "OK" && json.results?.[0]?.geometry?.location) {
    const { lat, lng } = json.results[0].geometry.location;
    return { ok: true, status, lat, lng };
  }
  return { ok: false, status };
}

function ensureOutDir() {
  const outDir = path.join(process.cwd(), "scripts", "out");
  fs.mkdirSync(outDir, { recursive: true });
  return outDir;
}

function writeFailuresCsv(failures) {
  const outDir = ensureOutDir();
  const file = path.join(outDir, `geocode_failures_${Date.now()}.csv`);
  const header = ["id", "address", "status"].join(",");
  const lines = failures.map((f) =>
    [
      String(f.id).replaceAll('"', '""'),
      `"${String(f.address).replaceAll('"', '""')}"`,
      f.status,
    ].join(",")
  );
  fs.writeFileSync(file, [header, ...lines].join("\n"), "utf8");
  return file;
}

async function main() {
  console.log("Fetching rows missing lat/lng…");

  const { data, error } = await supabase
    .from(TABLE)
    .select(`${ID_COL}, ${ADDRESS_COL}, ${LAT_COL}, ${LNG_COL}`)
    .or(`${LAT_COL}.is.null,${LNG_COL}.is.null`)
    .not(ADDRESS_COL, "is", null)
    .limit(FETCH_LIMIT);

  if (error) throw error;

  const rows = (data ?? []).filter((r) => (r[ADDRESS_COL] || "").trim().length > 0);
  console.log(`Found ${rows.length} rows needing geocode (up to ${FETCH_LIMIT}).`);

  let processed = 0;
  const stats = {};
  const failures = [];

  for (const r of rows) {
    if (processed >= MAX_GEOCODES_THIS_RUN) break;

    const id = r[ID_COL];
    const rawAddress = r[ADDRESS_COL];
    const address = normaliseAddress(rawAddress);

    const g = await geocode(address);
    stats[g.status] = (stats[g.status] || 0) + 1;

    if (g.ok) {
      const patch = {
        [LAT_COL]: g.lat,
        [LNG_COL]: g.lng,
        [STATUS_COL]: g.status,
        [TS_COL]: new Date().toISOString(),
      };

      const { error: upErr } = await supabase.from(TABLE).update(patch).eq(ID_COL, id);
      if (upErr) {
        failures.push({ id, address, status: `SUPABASE_UPDATE_${upErr.code || "ERR"}` });
      }
    } else {
      failures.push({ id, address, status: g.status });
      await supabase
        .from(TABLE)
        .update({ [STATUS_COL]: g.status, [TS_COL]: new Date().toISOString() })
        .eq(ID_COL, id);
    }

    processed += 1;
    if (processed % 25 === 0) console.log(`Processed ${processed}…`);
    await sleep(SLEEP_MS);
  }

  console.log("Done.");
  console.log("Stats:", stats);

  if (failures.length) {
    const file = writeFailuresCsv(failures);
    console.log(`Failures: ${failures.length}. CSV written to: ${file}`);
  } else {
    console.log("No failures 🎉");
  }

  console.log(
    `Updated up to ${processed} rows this run. Re-run until it says 'Found 0 rows needing geocode'.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
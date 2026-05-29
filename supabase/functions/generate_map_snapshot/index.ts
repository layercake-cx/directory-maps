/**
 * generate_map_snapshot
 *
 * Builds a self-contained JSON snapshot of a published map (config + listings
 * + groups) and uploads it to Vercel Blob storage at a deterministic path:
 *
 *   maps/<map_id>/snapshot.json
 *
 * The embed reads from this URL first (no Supabase call needed). If the file
 * is missing or the fetch times out, the embed falls back to live Supabase
 * queries — preserving the existing behaviour.
 *
 * Called:
 *   - After every successful publish (fire-and-forget from the dashboard)
 *   - Via nightly cron for all published maps (body: { all: true })
 *
 * Body (JSON):
 *   { map_id: string }        — regenerate one map
 *   { all: true }             — regenerate all published maps
 *
 * Auth: service-role only (called server-side / from cron).
 */

import { createServiceClient } from "../_shared/supabase.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/** Upload JSON to Vercel Blob. Returns the public URL. */
async function uploadToBlob(pathname: string, data: unknown): Promise<string> {
  const token = Deno.env.get("BLOB_READ_WRITE_TOKEN");
  if (!token) throw new Error("Missing BLOB_READ_WRITE_TOKEN");

  const res = await fetch(`https://blob.vercel-storage.com/${pathname}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-api-version": "7",
      "Content-Type": "application/json",
      // Make the file publicly readable (no token needed to GET from CDN)
      "x-access": "public",
      // Deterministic path — no random suffix appended by Vercel Blob
      // (required so the embed can construct the URL from map_id alone)
      "x-add-random-suffix": "0",
      // CDN edge caches for 1 year; origin revalidates on next upload
      "x-cache-control": "max-age=0, s-maxage=31536000",
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`Blob upload failed ${res.status}: ${text}`);
  }

  const result = await res.json();
  // Vercel Blob returns { url, downloadUrl, pathname, ... }
  return result.url as string;
}

/** Generate and upload the snapshot for a single map. */
async function generateForMap(mapId: string): Promise<{ map_id: string; snapshot_url: string }> {
  const db = createServiceClient();

  // 1. Confirm the map is published
  const { data: mapRow, error: mapErr } = await db
    .from("maps")
    .select("id, current_publication_id")
    .eq("id", mapId)
    .single();

  if (mapErr) throw new Error(`Map query failed: ${mapErr.message}`);
  if (!mapRow?.current_publication_id) {
    throw new Error(`Map ${mapId} has no current publication — publish it first`);
  }

  // 2. Fetch publication config (map config + group styling snapshot)
  const { data: pubRow, error: pubErr } = await db
    .from("map_publications")
    .select("config")
    .eq("id", mapRow.current_publication_id)
    .single();

  if (pubErr) throw new Error(`Publication query failed: ${pubErr.message}`);

  // 3. Fetch all published listings for this map
  const { data: listings, error: listErr } = await db
    .from("public_listings")
    .select("*")
    .eq("map_id", mapId);

  if (listErr) throw new Error(`Listings query failed: ${listErr.message}`);

  // 4. Fetch groups
  const { data: groups, error: grpErr } = await db
    .from("groups")
    .select("id, name, sort_order, color, theme_json")
    .eq("map_id", mapId)
    .order("sort_order", { ascending: true });

  if (grpErr) throw new Error(`Groups query failed: ${grpErr.message}`);

  // 5. Build snapshot bundle
  const snapshot = {
    /**
     * schemaVersion 2 — includes listings array.
     * schemaVersion 1 was the DB-only publication config (no listings).
     */
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    publicationId: mapRow.current_publication_id,
    /** map config + group styling (schemaVersion 1 publication shape) */
    config: pubRow?.config ?? null,
    /** All listing rows at time of publish */
    listings: listings ?? [],
    /** Group rows at time of publish */
    groups: groups ?? [],
  };

  // 6. Upload to Vercel Blob at a deterministic path
  const pathname = `maps/${mapId}/snapshot.json`;
  const snapshotUrl = await uploadToBlob(pathname, snapshot);

  // 7. Write the URL back to maps so dashboards can display it
  const { error: updateErr } = await db
    .from("maps")
    .update({
      snapshot_url: snapshotUrl,
      snapshot_generated_at: new Date().toISOString(),
    })
    .eq("id", mapId);

  if (updateErr) {
    // Non-fatal: the blob is uploaded; the URL just won't be in the DB yet.
    console.error(`Failed to update maps.snapshot_url for ${mapId}:`, updateErr.message);
  }

  return { map_id: mapId, snapshot_url: snapshotUrl };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { map_id, all } = body as { map_id?: string; all?: boolean };

    if (all) {
      // Bulk regeneration — cron or admin-triggered
      const db = createServiceClient();
      const { data: maps, error } = await db
        .from("maps")
        .select("id")
        .not("current_publication_id", "is", null);

      if (error) throw new Error(`Maps query failed: ${error.message}`);

      const results = await Promise.allSettled(
        (maps ?? []).map((m) => generateForMap(m.id))
      );

      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results
        .filter((r) => r.status === "rejected")
        .map((r) => (r as PromiseRejectedResult).reason?.message ?? "unknown");

      return json({ ok: true, total: results.length, succeeded, failed });
    }

    if (!map_id) {
      return json({ error: "Provide map_id or all: true" }, 400);
    }

    const result = await generateForMap(map_id);
    return json({ ok: true, ...result });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("generate_map_snapshot error:", msg);
    return json({ error: msg }, 500);
  }
});

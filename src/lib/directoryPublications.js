/**
 * Directory publish/rollback (DIR-E2) — thin RPC wrappers, peer of the
 * publish_map/rollback_map_to calls in ClientMapDashboard.jsx/
 * AdminMapDashboard.jsx. See 20260827120000_directory_publish_foundation.sql.
 *
 * config shape: { schemaVersion: 1, directory: {...settings/seo_defaults...},
 * categorisations: {...taxonomy structure snapshot...} }. directory_entries
 * and live tag assignments are NOT snapshotted — the (not-yet-built) static
 * generator reads them live at generation time, mirroring how EmbedMap.jsx
 * reads public_listings live regardless of a map's publication version.
 */

import { supabase, invokeFunction } from "./supabase";

/**
 * Builds the config snapshot passed to publish_directory. Covers directory
 * settings (name/description/SEO defaults) and the categorisation taxonomy
 * structure — NOT entries or their tags, which the generator reads live
 * (see 20260827120000_directory_publish_foundation.sql's header comment).
 * No theme/branding yet — directories.theme_json lands with Phase 4.
 */
export function buildDirectoryPublicationConfig({ directory, categorisations }) {
  return {
    schemaVersion: 1,
    directory: {
      name: directory?.name ?? null,
      description: directory?.description ?? null,
      seo_defaults_json: directory?.seo_defaults_json ?? null,
    },
    categorisations: (categorisations || []).map((c) => ({
      id: c.id,
      key: c.key,
      label: c.label,
      terms: (c.terms || []).map((t) => ({ id: t.id, label: t.label, slug: t.slug, color: t.color ?? null })),
    })),
  };
}

/**
 * Fire-and-forget regeneration of the Directory entity's static pages after
 * a publish. Peer of triggerDirectoryPagesRegeneration (src/lib/mapPublication.js)
 * for the unrelated map feature — same retry-once-then-log shape.
 *
 * `generate_directory_site`'s server-side flag check only honours an
 * explicit per-client `directories` override/default — unlike the
 * client-side `get_my_feature_flags()` the rest of the app uses, it does NOT
 * grant internal @layercake-cx.biz staff an automatic bypass (deliberately —
 * that bypass exists so staff can navigate an unreleased feature's UI, not
 * so a client that was never actually granted the flag gets a real public
 * site generated). That split means a staff member can publish a directory
 * for a client with no explicit grant and see it "succeed" with nothing
 * actually generated — HTTP 200, `{skipped: "flag_disabled"}`, which reads
 * as success to a naive fire-and-forget caller. `onResult` exists
 * specifically so callers can surface that distinction instead of silently
 * reporting success.
 */
export function triggerDirectorySiteRegeneration(directoryId, { onResult } = {}) {
  const attempt = () => invokeFunction("generate_directory_site", { body: { directory_id: directoryId } });
  const report = (res) => {
    if (res?.error) throw res.error;
    onResult?.(res?.data ?? null);
  };
  attempt()
    .then(report)
    .catch(() =>
      attempt()
        .then(report)
        .catch((e) => {
          console.warn("Directory site generation failed after retry (non-fatal):", e);
          onResult?.({ error: e?.message ?? String(e) });
        }),
    );
}

export async function publishDirectory(directoryId, config, note) {
  const { data, error } = await supabase.rpc("publish_directory", {
    p_directory_id: directoryId,
    p_config: config,
    p_note: note || null,
  });
  if (error) throw error;
  return data;
}

export async function rollbackDirectoryTo(directoryId, publicationId) {
  const { data, error } = await supabase.rpc("rollback_directory_to", {
    p_directory_id: directoryId,
    p_publication_id: publicationId,
  });
  if (error) throw error;
  return data;
}

export async function listDirectoryPublications(directoryId) {
  const { data, error } = await supabase.rpc("list_directory_publications", { p_directory_id: directoryId });
  if (error) throw error;
  return data ?? [];
}

/**
 * Persistent generate_directory_site status (docs/DEPLOYMENTS.md,
 * "Publish status visibility" — a real production failure was invisible
 * until manually investigated, since triggerDirectorySiteRegeneration above
 * is fire-and-forget and its result only ever reached whichever browser tab
 * triggered it). Written by the Edge Function itself; read-only here.
 */
export async function getDirectorySiteGenerationStatus(directoryId) {
  const { data, error } = await supabase
    .from("directories")
    .select("site_generation_status, site_generation_started_at, site_generated_at, site_generation_error")
    .eq("id", directoryId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

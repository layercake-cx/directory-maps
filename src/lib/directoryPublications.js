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
      applies_to: c.applies_to,
      terms: (c.terms || []).map((t) => ({ id: t.id, label: t.label, slug: t.slug, color: t.color ?? null })),
    })),
  };
}

/**
 * Fire-and-forget regeneration of the Directory entity's static pages after
 * a publish. Peer of triggerDirectoryPagesRegeneration (src/lib/mapPublication.js)
 * for the unrelated map feature — same retry-once-then-log shape. No-ops
 * server-side (skipped, not an error) for clients without the `directories`
 * flag — safe to call unconditionally.
 */
export function triggerDirectorySiteRegeneration(directoryId) {
  const attempt = () => invokeFunction("generate_directory_site", { body: { directory_id: directoryId } });
  attempt()
    .then((res) => {
      if (res?.error) throw res.error;
    })
    .catch(() =>
      attempt().catch((e) => console.warn("Directory site generation failed after retry (non-fatal):", e)),
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

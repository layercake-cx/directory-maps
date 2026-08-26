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

import { supabase } from "./supabase";

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

/**
 * Directory <-> Map association — shared data access (docs/DIRECTORIES.md,
 * epic DIR-E8). Covers the 'embedded_on_directory' role only — a map shown
 * on a directory's (future public, and for now authenticated-portal preview)
 * pages. The 'directory_as_datasource' role is reserved for DIR-E4 and has
 * no helpers here yet.
 *
 * See 20260716120000_create_directory_map_associations.sql for the schema.
 */

import { supabase } from "./supabase";

const ROLE = "embedded_on_directory";

/** Maps currently linked to a directory, in display order. */
export async function listLinkedMaps(directoryId) {
  if (!directoryId) return [];
  const { data, error } = await supabase
    .from("directory_map_associations")
    .select("map_id, sort_order, maps(id, name, slug)")
    .eq("directory_id", directoryId)
    .eq("role", ROLE)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .filter((row) => row.maps)
    .map((row) => ({ map_id: row.map_id, sort_order: row.sort_order, ...row.maps }));
}

/** All of a client's maps (for the "associate a map" picker). */
export async function listClientMaps(clientId) {
  if (!clientId) return [];
  const { data, error } = await supabase
    .from("maps")
    .select("id, name, slug")
    .eq("client_id", clientId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Link a map to a directory, appended to the end of the display order. */
export async function addLinkedMap(directoryId, mapId) {
  const { data: existing, error: existingErr } = await supabase
    .from("directory_map_associations")
    .select("sort_order")
    .eq("directory_id", directoryId)
    .eq("role", ROLE)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (existingErr) throw existingErr;
  const nextSortOrder = existing?.[0] ? existing[0].sort_order + 1 : 0;

  const { error } = await supabase.from("directory_map_associations").insert({
    directory_id: directoryId,
    map_id: mapId,
    role: ROLE,
    sort_order: nextSortOrder,
  });
  if (error) {
    if (error.code === "23505") throw new Error("This map is already linked to the directory.");
    throw error;
  }
}

export async function removeLinkedMap(directoryId, mapId) {
  const { error } = await supabase
    .from("directory_map_associations")
    .delete()
    .eq("directory_id", directoryId)
    .eq("map_id", mapId)
    .eq("role", ROLE);
  if (error) throw error;
}

/** Persist a new display order. orderedMapIds is the full list, in the desired order. */
export async function reorderLinkedMaps(directoryId, orderedMapIds) {
  await Promise.all(
    orderedMapIds.map((mapId, index) =>
      supabase
        .from("directory_map_associations")
        .update({ sort_order: index })
        .eq("directory_id", directoryId)
        .eq("map_id", mapId)
        .eq("role", ROLE)
        .then(({ error }) => {
          if (error) throw error;
        }),
    ),
  );
}

/** Public embed URL for a map (mirrors the embedSrc convention in AdminMapDashboard/ClientMapDashboard). */
export function buildMapEmbedSrc({ clientSlug, mapSlug, mapId }) {
  if (clientSlug && mapSlug) {
    return `${window.location.origin}/${clientSlug}/${mapSlug}`;
  }
  return `${window.location.origin}/embed?map=${encodeURIComponent(mapId)}`;
}

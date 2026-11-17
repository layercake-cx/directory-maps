import { supabase } from "./supabase";

/**
 * Maps for a list screen, with the extras the shared MapsList needs: listing count, data source,
 * and the directory a map reads its pins from. One shape for the client portal, a customer's Maps
 * tab and the platform-wide All maps list (omit `clientId` for every customer).
 */
export async function fetchMapsForList({ clientId } = {}) {
  let query = supabase
    .from("maps")
    .select("id,name,slug,client_id,updated_at,published_at,map_data_sources(provider,spreadsheet_id,sheet_name),listings(count)")
    .order("updated_at", { ascending: false });
  if (clientId) query = query.eq("client_id", clientId);
  const { data: maps, error } = await query;
  if (error) throw error;
  const rows = maps ?? [];

  // Directory link is best-effort: a failure here must not hide the maps themselves.
  let directoryByMapId = {};
  try {
    let assocQuery = supabase.from("directory_map_associations").select("map_id, directory_id");
    if (clientId) assocQuery = assocQuery.in("map_id", rows.map((m) => m.id));
    const { data: assocs } = await assocQuery;
    if (assocs?.length) {
      const { data: dirs } = await supabase.from("directories").select("id, name").in("id", [...new Set(assocs.map((a) => a.directory_id))]);
      const nameById = Object.fromEntries((dirs ?? []).map((d) => [d.id, d.name]));
      directoryByMapId = Object.fromEntries(assocs.map((a) => [a.map_id, { id: a.directory_id, name: nameById[a.directory_id] ?? null }]));
    }
  } catch {
    directoryByMapId = {};
  }

  return rows.map((m) => ({ ...m, directory: directoryByMapId[m.id] ?? null }));
}

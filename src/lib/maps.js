import { supabase } from "./supabase";

/**
 * Permanently delete a map and all of its data (groups, listings, publications,
 * engagement events, data sources, filter fields, …). Irreversible.
 *
 * Calls the `delete_map` SECURITY DEFINER RPC, which enforces permissions
 * server-side: platform admins may delete any map; client users may delete a
 * map only if they belong to its organisation and are an owner/manager/primary
 * contact or hold the `can_manage_maps` permission.
 *
 * @param {string} mapId
 * @returns {Promise<void>}
 */
export async function deleteMap(mapId) {
  if (!mapId) throw new Error("A map id is required.");
  const { error } = await supabase.rpc("delete_map", { p_map_id: mapId });
  if (error) throw error;
}

import type { createServiceClient } from "./supabase.ts";

/**
 * Archive / Restore: is this map, directory or customer live? Live = active AND its customer is active
 * (the database computes it: is_entity_live, migration 20261117150000). Background work and outgoing email for
 * anything not live is skipped, never errored. Fails open if the lookup itself errors, so a transient database
 * problem cannot silently stop every job.
 */
export async function isEntityLive(
  service: ReturnType<typeof createServiceClient>,
  entityType: "map" | "directory" | "client",
  entityId: string,
): Promise<boolean> {
  const { data, error } = await service.rpc("is_entity_live", { p_entity_type: entityType, p_entity_id: entityId });
  if (error) return true;
  return data !== false;
}

export const NOT_LIVE_MESSAGE = "This item is archived, so this action is unavailable.";

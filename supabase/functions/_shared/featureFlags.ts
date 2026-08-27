import { createServiceClient } from "./supabase.ts";

/**
 * Resolves a feature flag for a client from a service-role Edge Function
 * context (no authenticated user session, so the client-side
 * get_my_feature_flags() RPC's internal-staff bypass does not apply here —
 * callers that need staff-preview behaviour must replicate that separately).
 * Precedence: per-client override, else the flag's own default.
 */
export async function resolveFeatureFlag(
  db: ReturnType<typeof createServiceClient>,
  clientId: string,
  flagKey: string,
): Promise<boolean> {
  const { data: override } = await db
    .from("feature_flag_overrides")
    .select("enabled")
    .eq("client_id", clientId)
    .eq("flag_key", flagKey)
    .maybeSingle();
  if (override) return override.enabled === true;

  const { data: flag } = await db.from("feature_flags").select("default_enabled").eq("key", flagKey).maybeSingle();
  return flag?.default_enabled === true;
}

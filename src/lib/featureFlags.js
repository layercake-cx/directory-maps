import { supabase } from "./supabase";

/**
 * Feature-flag client helpers.
 *
 * Flags are resolved server-side by the get_my_feature_flags() RPC, which
 * applies the precedence: admin > internal (@layercake-cx.biz) > per-org
 * override > registry default. The frontend only reads the resolved result
 * and, for admins, reads/writes per-organisation overrides.
 *
 * This is UI/route gating for in-development features, not a security
 * boundary — the underlying tables stay tenant-scoped by their own RLS.
 */

export const DIRECTORIES_FLAG = "directories";

const INTERNAL_EMAIL_DOMAIN = "layercake-cx.biz";

/** True when the email belongs to the internal Layercake domain. */
export function isLayercakeUser(email) {
  const domain = (email ?? "").split("@")[1]?.toLowerCase() ?? "";
  return domain === INTERNAL_EMAIL_DOMAIN;
}

/**
 * Resolve all feature flags for the current user.
 * Returns an object like { directories: true }. Fails closed: on any error
 * the caller should treat unreleased features as off.
 */
export async function fetchMyFeatureFlags() {
  const { data, error } = await supabase.rpc("get_my_feature_flags");
  if (error) throw error;
  return data && typeof data === "object" ? data : {};
}

/** Admin: list a client's per-organisation flag overrides. */
export async function listClientFeatureOverrides(clientId) {
  const { data, error } = await supabase
    .from("feature_flag_overrides")
    .select("flag_key, enabled")
    .eq("client_id", clientId);
  if (error) throw error;
  return data ?? [];
}

/** Admin: grant (enabled=true) or deny (enabled=false) a flag for one client. */
export async function setClientFeatureOverride(clientId, flagKey, enabled) {
  const { error } = await supabase
    .from("feature_flag_overrides")
    .upsert(
      { flag_key: flagKey, client_id: clientId, enabled, updated_at: new Date().toISOString() },
      { onConflict: "flag_key,client_id" }
    );
  if (error) throw error;
}

/** Admin: remove a client's override so the flag falls back to its default. */
export async function clearClientFeatureOverride(clientId, flagKey) {
  const { error } = await supabase
    .from("feature_flag_overrides")
    .delete()
    .eq("client_id", clientId)
    .eq("flag_key", flagKey);
  if (error) throw error;
}

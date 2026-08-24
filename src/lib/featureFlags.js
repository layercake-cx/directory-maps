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
export const AI_SEARCH_FLAG = "ai_search";
export const DIRECTORY_PAGES_FLAG = "directory_pages";
export const CUSTOM_DOMAIN_FLAG = "custom_domain";

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

function isMissingRelationError(error) {
  const msg = (error?.message ?? "").toLowerCase();
  const code = error?.code ?? "";
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    msg.includes("schema cache") ||
    msg.includes("does not exist") ||
    msg.includes("could not find the table")
  );
}

/** Admin: list a client's per-organisation flag overrides. */
export async function listClientFeatureOverrides(clientId) {
  if (!clientId) return [];
  const { data, error } = await supabase
    .from("feature_flag_overrides")
    .select("flag_key, enabled")
    .eq("client_id", clientId);
  if (error) {
    // Fail closed when the migration has not been applied yet (staging-only today).
    // Callers must not let this block loading maps / customer details.
    if (isMissingRelationError(error)) return [];
    throw error;
  }
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

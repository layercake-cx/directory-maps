import { supabase } from "./supabase";

/**
 * Entitlements client helpers — the commercial/tier-gating axis.
 *
 * Separate from featureFlags.js (release/rollout gating). Entitlements are
 * resolved server-side by the get_my_entitlements() RPC, which applies the
 * precedence: kill switch > per-client override > Founder tier > plan
 * default > global fallback. The frontend only reads the resolved result
 * and, for admins, reads/writes plan assignment and per-client overrides.
 */

export const ENTITLEMENT_TYPES = {
  BOOLEAN: "boolean",
  VOLUME: "volume",
  METERED: "metered",
  TIME_BOXED: "time_boxed",
};

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

/**
 * Resolve all entitlements for the current user's client.
 * Returns an object like { <feature_key>: { enabled, limit, ... } }.
 * Fails closed: on any error the caller should treat entitlements as absent.
 */
export async function fetchMyEntitlements() {
  const { data, error } = await supabase.rpc("get_my_entitlements");
  if (error) throw error;
  return data && typeof data === "object" ? data : {};
}

/**
 * Admin: resolve all entitlements for an arbitrary client (e.g. a customer
 * detail screen configuring a client from route params, not the calling
 * admin's own client). Same shape as fetchMyEntitlements().
 */
export async function fetchClientEntitlements(clientId) {
  if (!clientId) return {};
  const { data, error } = await supabase.rpc("get_client_entitlements", { p_client_id: clientId });
  if (error) {
    if (isMissingRelationError(error)) return {};
    throw error;
  }
  return data && typeof data === "object" ? data : {};
}

/** List the available plans (for the admin plan-assignment dropdown). */
export async function listPlans() {
  const { data, error } = await supabase
    .from("plans")
    .select("key, name, is_founder_tier, sort_order")
    .order("sort_order", { ascending: true });
  if (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
  return data ?? [];
}

/** Admin: read a client's current plan key. */
export async function getClientPlanKey(clientId) {
  if (!clientId) return null;
  const { data, error } = await supabase
    .from("clients")
    .select("plan_key")
    .eq("id", clientId)
    .single();
  if (error) {
    if (isMissingRelationError(error)) return null;
    throw error;
  }
  return data?.plan_key ?? null;
}

/** Admin: assign a client to a plan. */
export async function setClientPlanKey(clientId, planKey) {
  const { error } = await supabase
    .from("clients")
    .update({ plan_key: planKey })
    .eq("id", clientId);
  if (error) throw error;
}

/** List the entitlement catalog (for the admin overrides table). */
export async function listFeatures() {
  const { data, error } = await supabase
    .from("features")
    .select(
      "id, product_key, key, name, description, entitlement_type, enforcement, on_downgrade_policy, kill_switch_enabled"
    )
    .order("product_key", { ascending: true })
    .order("key", { ascending: true });
  if (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
  return data ?? [];
}

/** Admin: list a client's per-feature entitlement overrides. */
export async function listClientEntitlementOverrides(clientId) {
  if (!clientId) return [];
  const { data, error } = await supabase
    .from("client_overrides")
    .select("*")
    .eq("client_id", clientId);
  if (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
  return data ?? [];
}

/**
 * Admin: set (or replace) a client's override for one feature. `patch`
 * should only include the column(s) relevant to that feature's
 * entitlement_type (e.g. { bool_value: true } or { limit_value: 50 }).
 */
export async function setClientEntitlementOverride(clientId, featureId, patch) {
  const { error } = await supabase.from("client_overrides").upsert(
    {
      client_id: clientId,
      feature_id: featureId,
      ...patch,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "client_id,feature_id" }
  );
  if (error) throw error;
}

/** Admin: remove a client's override so the feature falls back to the plan default. */
export async function clearClientEntitlementOverride(clientId, featureId) {
  const { error } = await supabase
    .from("client_overrides")
    .delete()
    .eq("client_id", clientId)
    .eq("feature_id", featureId);
  if (error) throw error;
}

/** Admin: flip a feature's platform-wide emergency kill switch. DB-only UI for now. */
export async function setFeatureKillSwitch(featureId, enabled) {
  const { error } = await supabase
    .from("features")
    .update({ kill_switch_enabled: enabled })
    .eq("id", featureId);
  if (error) throw error;
}

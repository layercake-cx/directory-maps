import { supabase } from "./supabase";

/**
 * Claimed Directory Listings epic — Phase 3 (manual, admin-first claim
 * lifecycle) + the claim-user magic-link mechanic. Admin-created claims use
 * exactly the same RPCs a later self-service phase will also call.
 */

/** Directory entries with no claim in progress -- the "select a listing" dropdown. */
export async function listUnclaimedEntries(directoryId) {
  const { data, error } = await supabase
    .from("directory_entries")
    .select("id, name, website_url")
    .eq("directory_id", directoryId)
    .eq("is_active", true)
    .is("current_claim_id", null)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Every claim against this directory's listings, with owner/payment info for the list view. */
export async function listClaimsForDirectory(directoryId) {
  const { data, error } = await supabase
    .from("claims")
    .select(`
      id, directory_id, directory_item_id, status, claimant_email, claimant_domain, listing_domain,
      verification_method, created_by, started_at, verified_at, activated_at, suspended_at, revoked_at, revoked_reason,
      directory_entries ( name ),
      claim_users ( id, name, email, role, user_id, removed_at ),
      claim_payments ( payment_status, payment_type, payment_provider, amount_cents, currency )
    `)
    .eq("directory_id", directoryId)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    entry_name: row.directory_entries?.name ?? "Unknown listing",
    users: (row.claim_users ?? []).filter((u) => !u.removed_at),
    owner: (row.claim_users ?? []).find((u) => u.role === "owner" && !u.removed_at) ?? null,
    payment: row.claim_payments ?? null,
  }));
}

export async function createManualClaim({ directoryItemId, ownerName, ownerEmail, verificationMethod, verificationNote }) {
  const { data, error } = await supabase.rpc("create_manual_claim", {
    p_directory_item_id: directoryItemId,
    p_owner_name: ownerName || null,
    p_owner_email: ownerEmail,
    p_verification_method: verificationMethod,
    p_verification_note: verificationNote || null,
  });
  if (error) throw error;
  return data; // claim id
}

export async function activateClaim(claimId) {
  const { error } = await supabase.rpc("admin_activate_claim", { p_claim_id: claimId });
  if (error) throw error;
}

export async function suspendClaim(claimId) {
  const { error } = await supabase.rpc("admin_suspend_claim", { p_claim_id: claimId });
  if (error) throw error;
}

export async function reactivateClaim(claimId) {
  const { error } = await supabase.rpc("admin_reactivate_claim", { p_claim_id: claimId });
  if (error) throw error;
}

export async function revokeClaim(claimId, reason) {
  const { error } = await supabase.rpc("admin_revoke_claim", { p_claim_id: claimId, p_reason: reason || null });
  if (error) throw error;
}

export async function setClaimPaymentStatus(claimId, { paymentStatus, paymentType, amountCents, currency }) {
  const { error } = await supabase.rpc("admin_set_claim_payment_status", {
    p_claim_id: claimId,
    p_payment_status: paymentStatus,
    p_payment_type: paymentType || null,
    p_amount_cents: amountCents ?? null,
    p_currency: currency || null,
  });
  if (error) throw error;
}

/** Sends (or resends) a passwordless magic-link sign-in email to a claim user. */
export async function sendClaimUserMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/claim/login` },
  });
  if (error) throw error;
}

/** Call once after a claim user's first magic-link login. Returns rows linked (0 is normal on later logins). */
export async function linkClaimUserByEmail() {
  const { data, error } = await supabase.rpc("link_claim_user_by_email");
  if (error) throw error;
  return data ?? 0;
}

/** The calling (claim) user's own linked claims. */
export async function getMyClaimContext() {
  const { data, error } = await supabase.rpc("get_my_claim_context");
  if (error) throw error;
  return data ?? [];
}

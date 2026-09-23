import { supabase } from "./supabase";

/**
 * Claimed Directory Listings epic — Phase 4, the claim-user-facing
 * "Listing Manager" shell. Read-only listing/team preview for now (Phase 5
 * adds the write side); the Users tab (invite/remove an editor) is real.
 */

export async function getClaimedListing(claimId) {
  const { data, error } = await supabase.rpc("get_claimed_listing", { p_claim_id: claimId });
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function getClaimTeamMembers(claimId) {
  const { data, error } = await supabase.rpc("get_claim_team_members", { p_claim_id: claimId });
  if (error) throw error;
  return data ?? [];
}

export async function getClaimUsers(claimId) {
  const { data, error } = await supabase.rpc("get_claim_users", { p_claim_id: claimId });
  if (error) throw error;
  return data ?? [];
}

export async function inviteClaimEditor(claimId, { email, name }) {
  const { data, error } = await supabase.rpc("claim_invite_user", {
    p_claim_id: claimId,
    p_email: email,
    p_name: name || null,
    p_role: "editor",
  });
  if (error) throw error;
  return data; // new claim_users id
}

export async function removeClaimUser(claimId, claimUserId) {
  const { error } = await supabase.rpc("claim_remove_user", { p_claim_id: claimId, p_claim_user_id: claimUserId });
  if (error) throw error;
}

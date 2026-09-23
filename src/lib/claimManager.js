import { supabase, invokeFunction } from "./supabase";
import { sanitizeNotesHtml } from "./sanitizeHtml.js";

/**
 * Claimed Directory Listings epic — the claim-user-facing "Listing
 * Manager". Phase 4 built the read-only shell + the Users tab; Phase 5
 * adds real editing for Listing/SEO/Contact details/Team.
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

export async function updateClaimedListingContact(claimId, fields) {
  const { error } = await supabase.rpc("update_claimed_listing_contact", {
    p_claim_id: claimId,
    p_website_url: fields.website_url || null,
    p_email: fields.email || null,
    p_phone: fields.phone || null,
    p_address: fields.address || null,
    p_postcode: fields.postcode || null,
    p_country: fields.country || null,
    p_city: fields.city || null,
    p_show_phone: fields.show_phone !== false,
    p_show_email: fields.show_email !== false,
    p_show_website: fields.show_website !== false,
    p_show_address: fields.show_address !== false,
  });
  if (error) throw error;
}

export async function updateClaimedListingSeo(claimId, { metaTitle, metaDescription }) {
  const { error } = await supabase.rpc("update_claimed_listing_seo", {
    p_claim_id: claimId,
    p_meta_title: metaTitle || null,
    p_meta_description: metaDescription || null,
  });
  if (error) throw error;
}

export async function updateClaimedListingBody(claimId, notesHtml) {
  const { error } = await supabase.rpc("update_claimed_listing_body", {
    p_claim_id: claimId,
    p_notes_html: sanitizeNotesHtml(notesHtml) || null,
  });
  if (error) throw error;
}

export async function addClaimTeamMember(claimId, member) {
  const { data, error } = await supabase.rpc("add_claim_team_member", {
    p_claim_id: claimId,
    p_name: member.name,
    p_role_title: member.role_title || null,
    p_photo_url: member.photo_url || null,
    p_bio: member.bio || null,
    p_is_visible: member.is_visible !== false,
  });
  if (error) throw error;
  return data; // new team member id
}

export async function updateClaimTeamMember(claimId, teamMemberId, member) {
  const { error } = await supabase.rpc("update_claim_team_member", {
    p_claim_id: claimId,
    p_team_member_id: teamMemberId,
    p_name: member.name,
    p_role_title: member.role_title || null,
    p_photo_url: member.photo_url || null,
    p_bio: member.bio || null,
    p_is_visible: member.is_visible !== false,
  });
  if (error) throw error;
}

export async function removeClaimTeamMember(claimId, teamMemberId) {
  const { error } = await supabase.rpc("remove_claim_team_member", { p_claim_id: claimId, p_team_member_id: teamMemberId });
  if (error) throw error;
}

/**
 * Publishes only this one directory item -- never the homepage, other
 * entries, sitemap/robots/llms/redirects, or any directory-level config
 * (Phase 6's isolation guarantee). Calls generate_directory_site directly
 * with scope: "claim_item", which derives directory_id itself from the
 * entry and re-checks server-side that the caller is linked to its active
 * claim -- never the general publish_directory/generate_directory_site
 * entry points a directory admin uses.
 */
export async function publishDirectoryItem(directoryItemId) {
  const { data, error } = await invokeFunction("generate_directory_site", {
    body: { scope: "claim_item", entry_ids: [directoryItemId] },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

import { supabase } from "./supabase";

function getMagicLinkRedirectUrl() {
  if (typeof window === "undefined") return "";
  return window.location.origin + (window.location.pathname || "/");
}

/**
 * Send a team invitation: creates the invitations record then fires a magic-link OTP.
 * mapIds only matters for 'member' role — owners/managers see all maps anyway.
 */
export async function sendInvitation({ clientId, email, role, invitedByContactId, mapIds = [] }) {
  const normalised = email.trim().toLowerCase();

  const { data: existingInvite } = await supabase
    .from("invitations")
    .select("id")
    .eq("client_id", clientId)
    .eq("email", normalised)
    .is("accepted_at", null)
    .maybeSingle();

  if (existingInvite) throw new Error("A pending invitation already exists for this email.");

  const { data: existingContact } = await supabase
    .from("contacts")
    .select("id")
    .eq("client_id", clientId)
    .eq("email", normalised)
    .maybeSingle();

  if (existingContact) throw new Error("This email already belongs to a team member.");

  const { data: invitation, error: invErr } = await supabase
    .from("invitations")
    .insert({
      client_id: clientId,
      email: normalised,
      role,
      invited_by_contact_id: invitedByContactId,
      map_ids: mapIds,
    })
    .select("id")
    .single();

  if (invErr) throw invErr;

  const { error: otpErr } = await supabase.auth.signInWithOtp({
    email: normalised,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: getMagicLinkRedirectUrl(),
    },
  });

  if (otpErr) {
    await supabase.from("invitations").delete().eq("id", invitation.id);
    throw otpErr;
  }

  return invitation;
}

/**
 * Called after a user logs in. Looks for a pending invitation matching their email,
 * creates the contact + map permissions, and marks the invite accepted.
 * Returns the new contact record, or null if no invitation found.
 */
export async function acceptPendingInvitation(userId, email) {
  const normalised = email.trim().toLowerCase();

  const { data: invitation } = await supabase
    .from("invitations")
    .select("id, client_id, role, map_ids")
    .eq("email", normalised)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!invitation) return null;

  const { data: contact, error: contactErr } = await supabase
    .from("contacts")
    .insert({
      client_id: invitation.client_id,
      user_id: userId,
      email: normalised,
      role: invitation.role,
      is_primary: false,
    })
    .select("id, client_id, role, is_primary, email, name")
    .single();

  if (contactErr) throw contactErr;

  if (invitation.map_ids?.length) {
    await supabase.from("contact_map_permissions").insert(
      invitation.map_ids.map((mapId) => ({ contact_id: contact.id, map_id: mapId }))
    );
  }

  await supabase
    .from("invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invitation.id);

  return contact;
}

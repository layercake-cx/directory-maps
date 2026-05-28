import { supabase } from "./supabase";
import { invokeEdgeFunction } from "./edgeFunctionFetch.js";

/**
 * Build signup/login URLs for a pending team invitation (password auth).
 */
export function buildTeamInviteUrls(invitationId) {
  const base =
    typeof window !== "undefined" ? window.location.origin + (window.location.pathname || "/") : "";
  return {
    signup: `${base}#/signup?invite=${invitationId}`,
    login: `${base}#/login?invite=${invitationId}`,
  };
}

/**
 * Load invitation details for the public signup/login pages.
 */
export async function fetchTeamInvitationPreview(invitationId) {
  if (!invitationId) return null;

  const { data, error } = await supabase.rpc("get_team_invitation_preview", {
    p_invitation_id: invitationId,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

/**
 * Complete signup from an invitation without secondary email verification.
 */
export async function completeInvitedSignup({
  invitationId,
  email,
  password,
  firstName,
  lastName,
}) {
  const data = await invokeEdgeFunction(
    "complete_invited_signup",
    {
      invitationId,
      email: email.trim(),
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
    },
    { supabase, requireAuth: false }
  );

  if (!data?.ok) {
    throw new Error(data?.error ?? "Could not complete invitation signup.");
  }
  return data;
}

/**
 * Invite a team member: validates 1:1 rules, creates invitation, sends email.
 */
export async function sendInvitation({ clientId, email, role, mapIds = [] }) {
  const data = await invokeEdgeFunction(
    "send_team_invitation",
    {
      clientId,
      email: email.trim(),
      role,
      mapIds: mapIds ?? [],
    },
    { supabase, requireAuth: true }
  );

  const invitation = data?.invitation;
  if (!invitation?.id) {
    throw new Error(data?.error ?? "Invitation could not be created.");
  }

  return {
    invitation,
    urls: data.urls ?? buildTeamInviteUrls(invitation.id),
    emailSent: !!data.emailSent,
  };
}

/**
 * Called after login/signup — links pending invitation to the authenticated user.
 */
export async function acceptPendingInvitation() {
  const { data, error } = await supabase.rpc("accept_team_invitation");

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

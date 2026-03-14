import { supabase } from "./supabase";

const IMPERSONATED_CLIENT_KEY = "dm_impersonated_client_id";

/**
 * Returns the client id for the current user: contact.user_id -> contact.client_id.
 * Legacy: if no contact, returns client.id when client.id === user.id (pre-contact schema).
 */
export async function getClientIdForCurrentUser() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const user = userData?.user;
  if (!user) throw new Error("Not signed in.");

  const { data: contact } = await supabase
    .from("contacts")
    .select("client_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (contact) return contact.client_id;

  const { data: legacyClient } = await supabase
    .from("clients")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  return legacyClient?.id ?? null;
}

export function startImpersonatingClient(clientId) {
  try {
    if (!clientId) return;
    window.localStorage.setItem(IMPERSONATED_CLIENT_KEY, String(clientId));
  } catch {
    // Ignore storage errors in non-browser environments.
  }
}

export function stopImpersonatingClient() {
  try {
    window.localStorage.removeItem(IMPERSONATED_CLIENT_KEY);
  } catch {
    // Ignore storage errors in non-browser environments.
  }
}

export function getImpersonatedClientId() {
  try {
    return window.localStorage.getItem(IMPERSONATED_CLIENT_KEY);
  } catch {
    return null;
  }
}

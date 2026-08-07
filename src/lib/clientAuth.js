import { supabase } from "./supabase";
import { getSession } from "./auth";

/**
 * Returns the full contact record for the current user, including role.
 * Returns null if the user has no contact (e.g. platform admin).
 */
export async function getContactForCurrentUser() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const user = userData?.user;
  if (!user) return null;

  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, client_id, role, is_primary, email, name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  return contacts?.[0] ?? null;
}

export function canManageOrg(contact) {
  return contact?.role === "owner" || contact?.role === "manager" || contact?.is_primary === true;
}

/**
 * Returns the client id for the current user: contact.user_id -> contact.client_id.
 * Legacy: if no contact, returns client.id when client.id === user.id (pre-contact schema).
 */
export async function getClientIdForCurrentUser() {
  const session = await getSession();
  const user = session?.user ?? null;
  if (!user) throw new Error("Not signed in.");

  const { data: contacts } = await supabase
    .from("contacts")
    .select("client_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  const contact = contacts?.[0] ?? null;
  if (contact) return contact.client_id;

  const { data: legacyClient } = await supabase
    .from("clients")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  return legacyClient?.id ?? null;
}

import { supabase } from "./supabase";
import { getMyRole, getSession } from "./auth";
import { getImpersonatedClientId } from "./clientAuth";

/**
 * Fetches the client and current user's contact for the client portal.
 * Returns { client, contact } or { client: null, contact: null } for admin-without-client.
 * contact has is_primary, can_manage_maps, can_manage_users.
 */
export async function getClientAndContact() {
  const session = await getSession();
  const user = session?.user ?? null;
  if (!user) throw new Error("Not signed in.");

  const role = await getMyRole();
  const impersonatedClientId = getImpersonatedClientId();

  if (impersonatedClientId && role === "admin") {
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id,name,slug,created_at,updated_at")
      .eq("id", impersonatedClientId)
      .single();
    if (clientErr || !client) return { client: null, contact: null };
    const { data: contact } = await supabase
      .from("contacts")
      .select("id, client_id, is_primary, can_manage_maps, can_manage_users")
      .eq("client_id", client.id)
      .eq("user_id", user.id)
      .maybeSingle();
    return { client: { ...client, __impersonated: true }, contact: contact ?? null };
  }

  if (role === "admin") {
    const { data: adminContacts } = await supabase
      .from("contacts")
      .select("id, client_id, is_primary, can_manage_maps, can_manage_users")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1);
    const contact = adminContacts?.[0] ?? null;
    if (!contact) return { client: null, contact: null };
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id,name,slug,created_at,updated_at")
      .eq("id", contact.client_id)
      .single();
    if (clientErr || !client) return { client: null, contact: null };
    return { client, contact };
  }

  // Use limit(1) instead of maybeSingle — a provisioning race on the verification-link
  // landing page can create duplicate contacts; maybeSingle would throw in that case.
  const { data: contacts, error: contactError } = await supabase
    .from("contacts")
    .select("id, client_id, is_primary, can_manage_maps, can_manage_users")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  if (contactError) throw contactError;
  const contact = contacts?.[0] ?? null;
  if (contact) {
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id,name,slug,created_at,updated_at")
      .eq("id", contact.client_id)
      .single();
    if (clientErr) throw clientErr;
    return { client: client ?? null, contact };
  }

  const { data: legacyClient, error: legacyErr } = await supabase
    .from("clients")
    .select("id,name,slug,created_at,updated_at")
    .eq("id", user.id)
    .maybeSingle();

  if (legacyErr) throw legacyErr;
  if (legacyClient) {
    const { error: insErr } = await supabase.from("contacts").insert({
      client_id: legacyClient.id,
      user_id: user.id,
      email: user.email ?? "Legacy contact",
      is_primary: true,
    });
    if (!insErr) {
      const { data: newContact } = await supabase
        .from("contacts")
        .select("id, client_id, is_primary, can_manage_maps, can_manage_users")
        .eq("user_id", user.id)
        .eq("client_id", legacyClient.id)
        .single();
      return { client: legacyClient, contact: newContact ?? null };
    }
    return { client: legacyClient, contact: null };
  }

  return { client: null, contact: null };
}

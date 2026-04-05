import { supabase } from "./supabase";

/**
 * After email magic link / OTP, create clients + contacts from signup metadata (OTP sign-up only).
 * Idempotent: no-op if a contact already exists for this user.
 */
export async function provisionClientFromPendingMetadata(user) {
  if (!user?.id) return { ok: true, skipped: true };

  const meta = user.user_metadata ?? {};
  const orgName = typeof meta.signup_org_name === "string" ? meta.signup_org_name.trim() : "";
  const orgSlug = typeof meta.signup_org_slug === "string" ? meta.signup_org_slug.trim() : "";
  if (!orgName || !orgSlug) {
    return { ok: true, skipped: true };
  }

  const { data: existingContact, error: contactErr } = await supabase
    .from("contacts")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (contactErr) throw contactErr;
  if (existingContact) {
    return { ok: true, skipped: true };
  }

  // Do not call is_client_slug_available here — it can hang on slow networks and blocked auth init.
  // Uniqueness is enforced by idx_clients_slug; duplicate returns a clear error below.

  const clientId = crypto.randomUUID();
  const email = (user.email ?? "").trim() || "unknown@user.local";

  const { error: clientError } = await supabase.from("clients").insert({
    id: clientId,
    name: orgName,
    slug: orgSlug,
  });
  if (clientError) {
    if (clientError.code === "23505") {
      return { ok: false, error: "slug_taken", message: "That organisation URL is already in use. Please contact support." };
    }
    throw clientError;
  }

  const { error: insContact } = await supabase.from("contacts").insert({
    client_id: clientId,
    user_id: user.id,
    email,
    is_primary: true,
  });
  if (insContact) throw insContact;

  return { ok: true };
}

import { supabase } from "./supabase";

/**
 * After email magic link / OTP, create clients + contacts from signup metadata (OTP sign-up only).
 * Idempotent: no-op if a contact already exists for this user.
 */
function buildSlugCandidate(baseSlug, attempt) {
  if (attempt === 0) return baseSlug;
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${baseSlug}-${suffix}`;
}

async function insertClientWithUniqueSlug(clientId, orgName, baseSlug) {
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slugCandidate = buildSlugCandidate(baseSlug, attempt);
    const { error } = await supabase.from("clients").insert({
      id: clientId,
      name: orgName,
      slug: slugCandidate,
    });
    if (!error) return { ok: true, slug: slugCandidate };
    if (error.code !== "23505") {
      return { ok: false, error };
    }
    lastError = error;
  }
  return { ok: false, error: lastError ?? new Error("Could not allocate a unique organisation URL.") };
}

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

  const clientInsert = await insertClientWithUniqueSlug(clientId, orgName, orgSlug);
  if (!clientInsert.ok) throw clientInsert.error;

  const { error: insContact } = await supabase.from("contacts").insert({
    client_id: clientId,
    user_id: user.id,
    email,
    is_primary: true,
  });
  if (insContact) throw insContact;

  return { ok: true };
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export function createAnonClient(req: Request) {
  const url = getEnv("SUPABASE_URL");
  // SB_PUBLISHABLE_KEY (not SUPABASE_ANON_KEY, which the platform reserves for
  // the legacy anon key) -- the new publishable key, set as a function secret
  // since Supabase does not auto-inject it. See docs/DEPLOYMENTS.md 2026-09-26
  // for why: the legacy anon/service_role pair got exposed in an agent session
  // and can only be invalidated by fully disabling legacy JWT-based API keys,
  // so every caller of this function had to move off them first.
  const anon = getEnv("SB_PUBLISHABLE_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";

  return createClient(url, anon, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
  });
}

export function createServiceClient() {
  const url = getEnv("SUPABASE_URL");
  // SB_SECRET_KEY (not SUPABASE_SERVICE_ROLE_KEY) -- see createAnonClient's
  // comment above for why.
  const service = getEnv("SB_SECRET_KEY");
  return createClient(url, service, {
    auth: {
      // Disable session persistence and auto-refresh — not needed for server-side
      // service-role clients and prevents the Realtime/auth background machinery
      // from registering process.nextTick handlers that crash the Deno event loop
      // on shutdown ("Deno.core.runMicrotasks() is not supported in this environment").
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function requireUser(req: Request) {
  const supabase = createAnonClient(req);
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data?.user) throw new Error("Not authenticated");
  return data.user;
}

export async function requireAdmin(req: Request) {
  const user = await requireUser(req);
  const service = createServiceClient();
  const { data, error } = await service.from("profiles").select("role").eq("user_id", user.id).single();
  if (error) throw error;
  if (data?.role !== "admin") throw new Error("Admin access required");
  return user;
}

/** Allows admins OR client contacts who are owner/manager/primary or can_manage_maps for the given map. */
export async function requireMapAccess(req: Request, mapId: string) {
  const user = await requireUser(req);
  const service = createServiceClient();

  const { data: profile } = await service.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (profile?.role === "admin") return user;

  const { data: map } = await service.from("maps").select("client_id").eq("id", mapId).maybeSingle();
  if (!map) throw new Error("Map not found");

  const { data: contact } = await service
    .from("contacts")
    .select("is_primary, can_manage_maps, role")
    .eq("client_id", map.client_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!contact) throw new Error("Access denied");
  const role = typeof contact.role === "string" ? contact.role : "";
  const isManagerRole = role === "owner" || role === "manager";
  if (!isManagerRole && !contact.is_primary && !contact.can_manage_maps) {
    throw new Error("You need 'Manage maps' permission to configure data sources");
  }
  return user;
}

/** Allows admins OR client contacts who are owner/manager/primary or hold an explicit contact_directory_permissions grant for the given directory. */
export async function requireDirectoryAccess(req: Request, directoryId: string) {
  const user = await requireUser(req);
  const service = createServiceClient();

  const { data: profile } = await service.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (profile?.role === "admin") return user;

  const { data: directory } = await service.from("directories").select("client_id").eq("id", directoryId).maybeSingle();
  if (!directory) throw new Error("Directory not found");

  const { data: contact } = await service
    .from("contacts")
    .select("id, is_primary, role")
    .eq("client_id", directory.client_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!contact) throw new Error("Access denied");
  const role = typeof contact.role === "string" ? contact.role : "";
  const isManagerRole = role === "owner" || role === "manager";
  if (isManagerRole || contact.is_primary) return user;

  const { data: perm } = await service
    .from("contact_directory_permissions")
    .select("can_edit_entries")
    .eq("contact_id", contact.id)
    .eq("directory_id", directoryId)
    .maybeSingle();
  if (!perm?.can_edit_entries) {
    throw new Error("You need edit access to this directory");
  }
  return user;
}

/**
 * Allows admins/directory contacts (via requireDirectoryAccess) OR the
 * active claim's owner/editor for this specific directory_entries row
 * (Claimed Directory Listings epic). This is the entry-grained check that
 * generate_directory_site's "claim_item" scope depends on -- a claim user
 * has no profiles/contacts row, so requireDirectoryAccess alone would
 * always reject them; this adds the narrower, item-scoped fallback rather
 * than widening directory-level trust.
 */
export async function requireDirectoryItemPublishAccess(req: Request, directoryItemId: string) {
  const user = await requireUser(req);
  const service = createServiceClient();

  const { data: entry } = await service
    .from("directory_entries")
    .select("directory_id, current_claim_id")
    .eq("id", directoryItemId)
    .maybeSingle();
  if (!entry) throw new Error("Directory item not found");

  try {
    await requireDirectoryAccess(req, entry.directory_id);
    return { user, directoryId: entry.directory_id as string, viaClaim: false };
  } catch {
    // Not an admin/contact -- fall through to the claim-user path.
  }

  if (!entry.current_claim_id) throw new Error("Access denied");

  const { data: claim } = await service
    .from("claims")
    .select("id, status")
    .eq("id", entry.current_claim_id)
    .maybeSingle();
  if (!claim || claim.status !== "active") throw new Error("Access denied");

  const { data: claimUser } = await service
    .from("claim_users")
    .select("id")
    .eq("claim_id", claim.id)
    .eq("user_id", user.id)
    .is("removed_at", null)
    .maybeSingle();
  if (!claimUser) throw new Error("Access denied");

  return { user, directoryId: entry.directory_id as string, viaClaim: true, claimId: claim.id as string };
}


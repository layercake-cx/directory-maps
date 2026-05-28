import { supabase } from "./supabase";
import { invokeEdgeFunction } from "./edgeFunctionFetch.js";

export async function createAdminClientUser({
  clientId,
  email,
  name,
  canManageMaps,
  canManageUsers,
}) {
  const data = await invokeEdgeFunction(
    "admin_create_client_user",
    {
      clientId,
      email,
      name,
      canManageMaps: !!canManageMaps,
      canManageUsers: !!canManageUsers,
    },
    { supabase, requireAuth: true }
  );

  if (!data?.ok) {
    throw new Error(data?.error ?? "Could not create user.");
  }
  return data;
}

export async function deleteAdminClientUser({ clientId, contactId }) {
  const baseUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
  if (!baseUrl) throw new Error("Missing VITE_SUPABASE_URL");

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("You must be signed in.");

  const res = await fetch(`${baseUrl}/functions/v1/admin_delete_client_user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ clientId, contactId }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data?.ok) {
    const err = new Error(data?.error ?? `Request failed (HTTP ${res.status})`);
    if (Array.isArray(data?.associatedClients)) {
      err.associatedClients = data.associatedClients;
    }
    throw err;
  }
  return data;
}

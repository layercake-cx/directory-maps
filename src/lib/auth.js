import { supabase } from "./supabase";

const IMPERSONATED_CLIENT_KEY = "dm_impersonated_client_id";

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getMyRole() {
  const session = await getSession();
  if (!session?.user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", session.user.id)
    .single();

  if (error) throw error;
  return data?.role ?? null;
}

export async function signOut() {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(IMPERSONATED_CLIENT_KEY);
    }
  } catch {
    // ignore
  }
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
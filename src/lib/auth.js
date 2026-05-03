import { supabase } from "./supabase";
import { IMPERSONATED_CLIENT_KEY } from "./clientAuth";

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getMyRole() {
  // getUser() validates the token server-side; getSession() only reads localStorage.
  const { data, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!data?.user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (error) throw error;
  return profile?.role ?? null;
}

export async function signOut() {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(IMPERSONATED_CLIENT_KEY);
    }
  } catch {
    // ignore storage errors
  }
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

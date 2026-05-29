import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
const hasConfig = supabaseUrl.length > 0 && supabaseAnonKey.length > 0;

let supabaseInstance;
try {
  supabaseInstance = createClient(hasConfig ? supabaseUrl : "https://placeholder.supabase.co", hasConfig ? supabaseAnonKey : "placeholder-key", {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
} catch (err) {
  if (typeof console !== "undefined" && console.error) {
    console.error("Supabase init failed:", err);
  }
  supabaseInstance = createClient("https://placeholder.supabase.co", "placeholder-key", {
    auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
  });
}

export const supabase = supabaseInstance;
export const hasSupabaseConfig = hasConfig;

/**
 * Wrapper around supabase.functions.invoke that always injects the current
 * session JWT as the Authorization header. Required because the new
 * sb_publishable_... key format is not a JWT and cannot be used as a Bearer
 * token fallback — without this, calls get UNAUTHORIZED_NO_AUTH_HEADER from
 * the platform before the function code runs.
 */
export async function invokeFunction(name, options = {}) {
  const { data: { session } } = await supabaseInstance.auth.getSession();
  return supabaseInstance.functions.invoke(name, {
    ...options,
    headers: {
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
}
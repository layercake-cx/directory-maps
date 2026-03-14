import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
const hasConfig = supabaseUrl.length > 0 && supabaseAnonKey.length > 0;

let supabaseInstance;
try {
  supabaseInstance = createClient(
    hasConfig ? supabaseUrl : "https://placeholder.supabase.co",
    hasConfig ? supabaseAnonKey : "placeholder-key"
  );
} catch (err) {
  if (typeof console !== "undefined" && console.error) {
    console.error("Supabase init failed:", err);
  }
  supabaseInstance = createClient("https://placeholder.supabase.co", "placeholder-key");
}

export const supabase = supabaseInstance;
export const hasSupabaseConfig = hasConfig;
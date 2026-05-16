/**
 * Call Supabase Edge Functions via fetch (reliable with publishable keys + --no-verify-jwt).
 * Prefer this over supabase.functions.invoke for public functions; use requireAuth for logged-in-only functions.
 */

function getBaseUrl() {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
  if (!baseUrl) throw new Error("Missing VITE_SUPABASE_URL");
  return baseUrl;
}

async function authHeaders(supabase, { requireAuth }) {
  const headers = { "Content-Type": "application/json" };
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

  if (!requireAuth) return headers;

  if (!supabase) throw new Error("Supabase client required for authenticated functions.");

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
    if (anonKey) headers.apikey = anonKey;
    return headers;
  }

  if (anonKey) {
    headers.Authorization = `Bearer ${anonKey}`;
    headers.apikey = anonKey;
    return headers;
  }

  throw new Error("You must be signed in.");
}

/**
 * @param {string} functionName
 * @param {object} body
 * @param {{ supabase?: import("@supabase/supabase-js").SupabaseClient, requireAuth?: boolean }} [opts]
 */
export async function invokeEdgeFunction(functionName, body, opts = {}) {
  const url = `${getBaseUrl()}/functions/v1/${functionName}`;
  const headers = await authHeaders(opts.supabase, { requireAuth: !!opts.requireAuth });

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (e) {
    const err = new Error(e?.message || "Network error");
    err.name = "FunctionsFetchError";
    throw err;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || data?.message || res.statusText || `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

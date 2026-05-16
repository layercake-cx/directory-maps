/**
 * Call Supabase Edge Functions via fetch (reliable with publishable keys + --no-verify-jwt).
 */

function getBaseUrl() {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
  if (!baseUrl) throw new Error("Missing VITE_SUPABASE_URL");
  return baseUrl;
}

function getAnonKey() {
  return import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
}

async function buildHeaders(supabase, { requireAuth }) {
  const headers = { "Content-Type": "application/json" };
  const anonKey = getAnonKey();

  if (supabase) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
      if (anonKey) headers.apikey = anonKey;
      return headers;
    }
  }

  if (requireAuth) {
    throw new Error("You must be signed in.");
  }

  // Public functions (--no-verify-jwt): still send apikey so the gateway accepts publishable keys.
  if (anonKey) {
    headers.Authorization = `Bearer ${anonKey}`;
    headers.apikey = anonKey;
  }

  return headers;
}

/**
 * @param {string} functionName
 * @param {object} body
 * @param {{ supabase?: import("@supabase/supabase-js").SupabaseClient, requireAuth?: boolean }} [opts]
 */
export async function invokeEdgeFunction(functionName, body, opts = {}) {
  const url = `${getBaseUrl()}/functions/v1/${functionName}`;
  const headers = await buildHeaders(opts.supabase, { requireAuth: !!opts.requireAuth });

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (e) {
    const err = new Error(
      e?.message || "Network error — could not reach the Edge Function. Check your connection and ad blockers."
    );
    err.name = "EdgeFunctionNetworkError";
    throw err;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = parseEdgeFunctionError(data, res.status);
    throw new Error(msg);
  }
  if (data?.error) throw new Error(parseEdgeFunctionError(data, 200));
  return data;
}

function parseEdgeFunctionError(data, status) {
  const raw = data?.error ?? data?.message ?? "";
  if (typeof raw === "string") {
    try {
      const inner = JSON.parse(raw);
      if (inner?.message) return inner.message;
    } catch {
      /* plain string */
    }
    return raw;
  }
  return `Request failed (HTTP ${status})`;
}

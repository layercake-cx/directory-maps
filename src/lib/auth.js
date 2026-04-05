import { supabase } from "./supabase";

const IMPERSONATED_CLIENT_KEY = "dm_impersonated_client_id";

/**
 * Last-resort: strip persisted Supabase auth keys for this project. The in-memory session can still
 * be stale until reload — used only when signOut() API fails (e.g. storage lock).
 */
function hardClearSupabaseAuthStorage() {
  if (typeof window === "undefined") return;
  const url = import.meta.env.VITE_SUPABASE_URL ?? "";
  if (!url) return;
  let ref;
  try {
    ref = new URL(url).hostname.split(".")[0];
  } catch {
    return;
  }
  if (!ref) return;
  const prefix = `sb-${ref}-`;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) localStorage.removeItem(k);
    }
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(prefix)) sessionStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
}

/** Serialize getSession() — concurrent reads trigger "Lock broken by another request" (JS client mutex, not DB/org slug RPC). */
let authOpChain = Promise.resolve();

function enqueueAuthOp(fn) {
  const next = authOpChain.then(fn, fn);
  authOpChain = next.then(
    () => {},
    () => {}
  );
  return next;
}

export async function getSession() {
  return enqueueAuthOp(async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  });
}

export async function getMyRole() {
  const session = await getSession();
  if (!session?.user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", session.user.id)
    .maybeSingle();

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

  /** Default scope is `global` (server revoke + clear storage). Local-only sign-out was unreliable with PKCE + React state. */
  async function signOutApi() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  try {
    await signOutApi();
    return;
  } catch (e) {
    const msg = e?.message ?? String(e);
    if (msg.includes("Lock broken")) {
      await Promise.resolve();
      try {
        await signOutApi();
        return;
      } catch {
        // try serialized + hard clear below
      }
    }
  }

  try {
    await enqueueAuthOp(signOutApi);
    return;
  } catch {
    // fall through
  }

  hardClearSupabaseAuthStorage();
  if (typeof window !== "undefined") {
    window.location.reload();
  }
}
/**
 * Keeps Supabase Auth's redirect allow list in step with directory custom
 * domains. A magic link may only land on a URL in that list. The database
 * role used by Edge Functions cannot edit it; this calls the Management API
 * with MANAGEMENT_API_TOKEN (an account access token, not the service role
 * key). Edge Function secrets cannot be named SUPABASE_*. The project ref is taken from SUPABASE_URL, so the staging function
 * updates staging Auth and production updates production.
 */

export function directoryLoginRedirectUrl(hostname: string): string {
  return `https://${hostname.trim().toLowerCase()}/login`;
}

/** Matches every path on that host, including /login. Auth's matcher treats
 * "." and "/" as separators, so an exact /login entry can miss the link. */
export function directoryLoginAllowPattern(hostname: string): string {
  return `https://${hostname.trim().toLowerCase()}/**`;
}

const HOST_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

/**
 * Where a magic link should land. An active directory domain wins, so the
 * email opens that site's /login. A link requested from localhost stays on
 * localhost: that is the staging app, and its session cannot be stored on
 * the live site or on the directory domain.
 */
export function resolveClaimLoginRedirect(fallback: string, hostname: string | null | undefined): string {
  let callerHost = "";
  try {
    callerHost = new URL(fallback).hostname;
  } catch {
    callerHost = "";
  }
  if (callerHost === "localhost" || callerHost === "127.0.0.1") return fallback;
  const host = typeof hostname === "string" ? hostname.trim().toLowerCase() : "";
  if (!host || !HOST_RE.test(host)) return fallback;
  return directoryLoginRedirectUrl(host);
}

/** Comma- or newline-separated allow list. Matching ignores a trailing slash. */
export function mergeRedirectAllowList(current: string, url: string, enabled: boolean): { changed: boolean; value: string } {
  const urls = current.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  const key = url.replace(/\/$/, "");
  const has = urls.some((u) => u.replace(/\/$/, "") === key);
  if (enabled) {
    if (has) return { changed: false, value: urls.join(",") };
    return { changed: true, value: [...urls, url].join(",") };
  }
  if (!has) return { changed: false, value: urls.join(",") };
  return { changed: true, value: urls.filter((u) => u.replace(/\/$/, "") !== key).join(",") };
}

function projectRef(): string | null {
  const raw = Deno.env.get("SUPABASE_URL") ?? "";
  try {
    const ref = new URL(raw).hostname.split(".")[0];
    return ref || null;
  } catch {
    return null;
  }
}

async function authFailure(res: Response, action: string): Promise<string> {
  if (res.status === 401) {
    return "The management token was rejected. Create a new access token for the production project and set it again.";
  }
  const body = await res.json().catch(() => ({}));
  const missing = Array.isArray(body?.missing_permissions) ? body.missing_permissions.filter((p: unknown) => typeof p === "string").join(", ") : "";
  return missing
    ? `Could not ${action} the sign-in redirect list (${res.status}: ${missing})`
    : `Could not ${action} the sign-in redirect list (${res.status})`;
}

function managementToken(): string {
  // Drop line breaks, spaces and invisible characters from a clipboard paste.
  // Keep the token's own punctuation (+, /, =). Deleting those made a valid
  // token look forged, and Supabase answered 401.
  return (Deno.env.get("MANAGEMENT_API_TOKEN") ?? "")
    .replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, "");
}

function safeCause(e: unknown): string {
  const message = e instanceof Error ? e.message : "";
  return message.replace(/bearer\s+\S+/gi, "bearer").replace(/sbp_\S+/g, "sbp").replace(/\s+/g, " ").trim().slice(0, 160);
}

/** Adds or removes one exact redirect URL. Never throws. Does not log the token or the allow list. */
export async function setAuthRedirectUrl(url: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  const token = managementToken();
  const ref = projectRef();
  if (!token || !ref) return { ok: false, error: "Sign-in redirect list is not configured" };

  let headers: Headers;
  try {
    headers = new Headers({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
  } catch {
    return { ok: false, error: "The management token cannot be sent. Set it again with no line break." };
  }

  try {
    const endpoint = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
    const res = await fetch(endpoint, { headers });
    if (!res.ok) return { ok: false, error: await authFailure(res, "read") };
    const body = await res.json().catch(() => ({}));
    const current = typeof body?.uri_allow_list === "string" ? body.uri_allow_list : "";
    const next = mergeRedirectAllowList(current, url, enabled);
    if (!next.changed) return { ok: true };
    const patch = await fetch(endpoint, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ uri_allow_list: next.value }),
    });
    if (!patch.ok) return { ok: false, error: await authFailure(patch, "update") };
    return { ok: true };
  } catch (e) {
    const cause = safeCause(e);
    console.error("auth redirect request failed:", cause);
    return { ok: false, error: cause ? `Could not update the sign-in redirect list (${cause})` : "Could not update the sign-in redirect list" };
  }
}

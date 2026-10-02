/**
 * Turn anything thrown into a readable string.
 *
 * Errors from supabase-js (PostgrestError, AuthError) are often plain objects rather than
 * `Error` instances, so `String(e)` yields "[object Object]". Prefer message/details/hint.
 */
export function errorMessage(e: unknown, fallback = "Unexpected error."): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint]
      .filter((p): p is string => typeof p === "string" && p.trim().length > 0);
    if (parts.length > 0) return parts.join(" — ");
    if (typeof o.error_description === "string" && o.error_description) return o.error_description;
    if (typeof o.error === "string" && o.error) return o.error;
    try {
      const json = JSON.stringify(e);
      if (json && json !== "{}") return json;
    } catch { /* fall through */ }
  }
  return fallback;
}

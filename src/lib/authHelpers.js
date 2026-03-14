/**
 * URL Supabase should redirect to after OAuth (must be allowed in Supabase Auth URL list).
 */
export function getOAuthRedirectUrl() {
  const base = typeof window !== "undefined" ? window.location.origin + (window.location.pathname || "/") : "";
  return `${base}#/client`;
}

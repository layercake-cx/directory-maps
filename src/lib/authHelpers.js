/**
 * URL Supabase should redirect to after OAuth (must be allowed in Supabase Auth URL list).
 */
export function getOAuthRedirectUrl() {
  const base = typeof window !== "undefined" ? window.location.origin + (window.location.pathname || "/") : "";
  return `${base}#/client`;
}

/**
 * Same as OAuth: magic link / email OTP completes here so the session is established on the client portal route.
 * Add this exact URL (and localhost dev) to Supabase Auth → URL configuration → Redirect URLs.
 */
export function getEmailAuthRedirectUrl() {
  return getOAuthRedirectUrl();
}

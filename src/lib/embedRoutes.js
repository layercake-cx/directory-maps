/** First path segments that are app routes, not client slugs. */
const RESERVED_FIRST_SEGMENTS = new Set([
  "pricing",
  "login",
  "signup",
  "forgot-password",
  "reset-password",
  "terms",
  "embed",
  "client",
  "admin",
]);

/**
 * Whether the URL should render as a chromeless map embed (no site header/footer).
 * Matches `/embed` and human-readable published URLs `/:clientSlug/:mapSlug`.
 */
export function isEmbedPath(pathname) {
  const path = (pathname || "/").replace(/\/+$/, "") || "/";
  if (path === "/embed") return true;

  const match = path.match(/^\/([^/]+)\/([^/]+)$/);
  if (!match) return false;

  const firstSegment = match[1].toLowerCase();
  return !RESERVED_FIRST_SEGMENTS.has(firstSegment);
}

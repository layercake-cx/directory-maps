export function appBasePath() {
  // For GitHub Pages repo sites, Vite injects BASE_URL like "/directory-maps/"
  // For custom domains, it's usually "/"
  return import.meta.env.BASE_URL || "/";
}

export function appUrl(path = "") {
  const base = appBasePath().replace(/\/+$/, ""); // trim trailing slash
  const p = String(path || "");
  if (!p) return `${window.location.origin}${base}/`;
  if (p.startsWith("/")) return `${window.location.origin}${base}${p}`;
  return `${window.location.origin}${base}/${p}`;
}

export function hashUrl(hashPath) {
  // hashPath like "/admin/clients"
  const base = appBasePath().replace(/\/+$/, "");
  const hp = hashPath.startsWith("/") ? hashPath : `/${hashPath}`;
  return `${window.location.origin}${base}/#${hp}`;
}
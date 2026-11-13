const PLATFORM_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "maps.layercake-cx.biz",
  "layercake-cx.github.io",
  "directory-maps.vercel.app",
]);

/** A published directory's own hostname, not the Layercake app. */
export function isDirectoryCustomHost(hostname = typeof window !== "undefined" ? window.location.hostname : "") {
  const host = String(hostname || "").toLowerCase();
  if (!host || PLATFORM_HOSTS.has(host)) return false;
  if (host.endsWith(".vercel.app") || host.endsWith(".github.io")) return false;
  return host.includes(".");
}

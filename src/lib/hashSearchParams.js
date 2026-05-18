/**
 * Read/write query params on the HashRouter hash (#/path?foo=bar) without
 * React Router setSearchParams — that can remount the tree and drop transient UI state.
 */

export function readHashSearchParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  const hash = window.location.hash || "";
  const qIdx = hash.indexOf("?");
  if (qIdx === -1) return new URLSearchParams();
  return new URLSearchParams(hash.slice(qIdx + 1));
}

export function replaceHashSearchParams(mutator) {
  if (typeof window === "undefined") return;
  const hash = window.location.hash || "#/";
  const qIdx = hash.indexOf("?");
  const pathPart = qIdx === -1 ? hash : hash.slice(0, qIdx);
  const params = new URLSearchParams(qIdx === -1 ? "" : hash.slice(qIdx + 1));
  mutator(params);
  const qs = params.toString();
  const nextHash = pathPart + (qs ? `?${qs}` : "");
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${nextHash}`);
}

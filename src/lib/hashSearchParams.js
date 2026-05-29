/**
 * Read/write URL query params without React Router setSearchParams — that can
 * remount the tree and drop transient UI state.
 *
 * Previously operated on the hash fragment (HashRouter). Now uses the real
 * query string (BrowserRouter).
 */

export function readHashSearchParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

export function replaceHashSearchParams(mutator) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  mutator(params);
  const qs = params.toString();
  window.history.replaceState(
    null,
    "",
    window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash
  );
}

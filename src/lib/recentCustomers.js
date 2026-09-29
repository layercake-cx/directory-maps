/**
 * Staff's own "recently viewed customers" (Phase 3, admin shell redesign) — per-admin-browser,
 * not shared/synced. Follows the existing `dm-`-prefixed / try-catch-guarded storage convention
 * (see publishPanelStorage.js), but `localStorage` rather than `sessionStorage`: unlike a
 * publish-panel's open/closed state, "recently viewed" is meant to persist across sessions.
 */
const KEY = "dm-recent-customers";
const MAX_ENTRIES = 5;

export function recordCustomerVisit(clientId) {
  if (!clientId || typeof localStorage === "undefined") return;
  try {
    const existing = JSON.parse(localStorage.getItem(KEY) || "[]");
    const next = [clientId, ...existing.filter((id) => id !== clientId)].slice(0, MAX_ENTRIES);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode / corrupt value */
  }
}

/** Most-recently-viewed first. */
export function getRecentCustomerIds() {
  if (typeof localStorage === "undefined") return [];
  try {
    const ids = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

const PREFIX = "dm-publish-open:";

export function markPublishPanelOpen(mapId) {
  if (!mapId || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(`${PREFIX}${mapId}`, "1");
  } catch {
    /* quota / private mode */
  }
}

export function clearPublishPanelOpen(mapId) {
  if (!mapId || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(`${PREFIX}${mapId}`);
  } catch {
    /* ignore */
  }
}

export function isPublishPanelOpenInStorage(mapId) {
  if (!mapId || typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(`${PREFIX}${mapId}`) === "1";
  } catch {
    return false;
  }
}

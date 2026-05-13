/** Publication snapshot for embeds (schemaVersion 1). Listings stay live; map + per-group styling are snapshotted. */

export const MAP_PUBLICATION_SCHEMA_VERSION = 1;

export function parseJsonObject(raw, fallback = {}) {
  if (raw == null) return { ...fallback };
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const o = JSON.parse(raw || "{}");
      return typeof o === "object" && o !== null && !Array.isArray(o) ? o : { ...fallback };
    } catch {
      return { ...fallback };
    }
  }
  return { ...fallback };
}

/** Normalize DB or legacy payload into { schemaVersion, map, groups }. */
export function normalizePublicationConfig(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.schemaVersion === 1 && raw.map && raw.groups) {
    return {
      schemaVersion: 1,
      map: parseJsonObject(raw.map),
      groups: {
        byId: parseJsonObject(raw.groups?.byId, {}),
        byName: parseJsonObject(raw.groups?.byName, {}),
      },
    };
  }
  if (
    raw.default_lat !== undefined ||
    raw.theme_json !== undefined ||
    raw.marker_style !== undefined ||
    raw.show_list_panel !== undefined
  ) {
    return {
      schemaVersion: 1,
      map: { ...raw },
      groups: { byId: {}, byName: {} },
    };
  }
  return null;
}

/**
 * Build the payload sent to publish_map RPC (matches current dashboard form + live groups list).
 */
export function buildPublicationConfig(params) {
  const {
    groups,
    defaultLat,
    defaultLng,
    defaultZoom,
    showListPanel,
    enableClustering,
    clusterRadius,
    markerStyle,
    markerColor,
    customPinUrl,
    clusterColor,
    pinBorderColor,
    pinBorderSize,
    pinFaviconUrl,
    buttonColor,
    panelBackgroundColor,
    panelBackgroundOpacity,
    panelBorderRadius,
    pinDetailLayout,
    panelLinkColor,
    pinSize,
    showSearch,
    showGroupDropdowns,
    mapThemeJsonBase,
  } = params;

  const baseTheme = parseJsonObject(mapThemeJsonBase, {});
  const theme_json = {
    ...baseTheme,
    clusterColor: clusterColor || "#4A9BAA",
    pinBorderColor: pinBorderColor || "#ffffff",
    pinBorderSize: Math.max(0, Math.min(15, Number(pinBorderSize) || 0)),
    pin_favicon_url: (pinFaviconUrl || "").trim() || null,
    pinSize,
    buttonColor: (buttonColor || "").trim() || "#4A9BAA",
    panelBackgroundColor: (panelBackgroundColor || "").trim() || "#ffffff",
    panelBackgroundOpacity: Math.max(0, Math.min(1, Number(panelBackgroundOpacity) ?? 0.88)),
    panelBorderRadius: Math.max(0, Math.min(28, Number(panelBorderRadius) || 12)),
    pinDetailLayout: pinDetailLayout === "drawer" ? "drawer" : "map",
    panelLinkColor: (panelLinkColor || "").trim() || "#4A9BAA",
    showSearch,
    showGroupDropdowns,
  };
  // Legacy camelCase key could keep the icon after clear if still present in jsonb.
  delete theme_json.pinFaviconUrl;

  const map = {
    default_lat: Number(defaultLat) || null,
    default_lng: Number(defaultLng) || null,
    default_zoom: Number(defaultZoom) || null,
    show_list_panel: showListPanel,
    enable_clustering: enableClustering,
    cluster_radius: Math.max(20, Math.min(200, Number(clusterRadius) || 80)),
    marker_style: markerStyle,
    marker_color: markerColor,
    custom_pin_url: customPinUrl || null,
    theme_json,
  };

  const byId = {};
  const byName = {};
  for (const g of groups || []) {
    if (!g?.id) continue;
    const entry = {
      color: g.color ?? null,
      theme_json: parseJsonObject(g.theme_json, {}),
    };
    byId[g.id] = entry;
    if (g.name) byName[g.name] = entry;
  }

  return {
    schemaVersion: MAP_PUBLICATION_SCHEMA_VERSION,
    map,
    groups: { byId, byName },
  };
}

/** Apply published group styling to a live group row (embed). No snapshot match → map defaults only. */
function sortKeysDeep(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  const out = {};
  for (const k of Object.keys(value).sort()) {
    out[k] = sortKeysDeep(value[k]);
  }
  return out;
}

/** Deep-equal comparison ignoring JSON key insertion order (Supabase/jsonb reordering). */
export function publicationConfigsEqual(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return JSON.stringify(sortKeysDeep(a)) === JSON.stringify(sortKeysDeep(b));
}

export function mergeGroupWithPublication(gr, pubGroups) {
  const byId = pubGroups?.byId || {};
  const byName = pubGroups?.byName || {};
  const snap = byId[gr.id] || (gr.name ? byName[gr.name] : null);
  if (!snap) {
    return { ...gr, theme_json: null, color: null };
  }
  return {
    ...gr,
    color: snap.color ?? gr.color ?? null,
    theme_json: snap.theme_json != null ? snap.theme_json : null,
  };
}

/** Publication snapshot for embeds (schemaVersion 1). Listings stay live; map + per-group styling are snapshotted. */

import { invokeFunction } from "./supabase.js";

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

/** Normalize DB or legacy payload into { schemaVersion, map, groups, filterFields }. */
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
      filterFields: Array.isArray(raw.filterFields) ? raw.filterFields : [],
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
      filterFields: [],
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
    clusterOpacity,
    pinBorderColor,
    pinBorderSize,
    pinDropShadow,
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
    showMapTitle,
    mapThemeJsonBase,
    mapTypeId,
    mapStyleSettings,
    mapName,
    logoUrl,
    description,
    searchPanelBgColor,
    searchPanelBgOpacity,
    searchPanelTextColor,
    listingBgColor,
    listingBorderColor,
    listingOpacity,
    showContinentFilter,
    showKey,
    filterFields,
    aiSearchEnrichmentPromptSet,
  } = params;

  const baseTheme = parseJsonObject(mapThemeJsonBase, {});
  const theme_json = {
    ...baseTheme,
    logoUrl: (logoUrl || "").trim() || null,
    description: typeof description === "string" ? description : (baseTheme.description ?? null),
    searchPanelBgColor: (searchPanelBgColor || "").trim() || "#ffffff",
    searchPanelBgOpacity: Math.max(0, Math.min(1, Number(searchPanelBgOpacity) ?? 0.92)),
    searchPanelTextColor: (searchPanelTextColor || "").trim() || "#111827",
    listingBgColor: (listingBgColor || "").trim() || "#ffffff",
    listingBorderColor: (listingBorderColor || "").trim() || "#e5e7eb",
    listingOpacity: Math.max(0, Math.min(1, Number(listingOpacity) ?? 1)),
    showContinentFilter: showContinentFilter === true,
    showKey: showKey !== false,
    clusterColor: clusterColor || "#4A9BAA",
    clusterOpacity: Math.max(0, Math.min(1, Number(clusterOpacity) ?? 1)),
    pinBorderColor: pinBorderColor || "#ffffff",
    pinBorderSize: Math.max(0, Math.min(15, Number(pinBorderSize) || 0)),
    pinDropShadow: Math.max(0, Math.min(30, Number(pinDropShadow) || 0)),
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
    showMapTitle: !!showMapTitle,
    mapTypeId: mapTypeId || "roadmap",
    mapStyleSettings: mapStyleSettings || baseTheme.mapStyleSettings,
  };
  // Legacy camelCase key could keep the icon after clear if still present in jsonb.
  delete theme_json.pinFaviconUrl;

  const map = {
    name: mapName ?? null,
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
    // Boolean only — the raw enrichment prompt text is admin config, not part
    // of what's published for public embed consumption.
    ai_search_enabled: !!aiSearchEnrichmentPromptSet,
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
    filterFields: Array.isArray(filterFields) ? filterFields : [],
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

/**
 * Trigger the `generate_map_snapshot` Edge Function after a publish. This is
 * fire-and-forget from the caller's perspective (does not block the publish
 * UX), but retries once on failure — the CDN blob it writes is served ahead
 * of live queries by the embed (see EmbedMap.jsx), so a single dropped call
 * (cold start, transient network error) otherwise leaves a stale snapshot
 * live until the next publish.
 *
 * Must go through `invokeFunction` (not a raw `supabase.functions.invoke`)
 * so the session JWT is attached — the `sb_publishable_...` anon key alone
 * is not a JWT and the call fails auth before the function code runs.
 */
export function triggerSnapshotRegeneration(mapId) {
  const attempt = () => invokeFunction("generate_map_snapshot", { body: { map_id: mapId } });
  attempt()
    .then((res) => {
      if (res?.error) throw res.error;
    })
    .catch(() =>
      attempt().catch((e) => console.warn("Snapshot generation failed after retry (non-fatal):", e)),
    );
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

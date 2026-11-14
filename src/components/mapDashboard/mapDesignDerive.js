// Pure helpers that turn the page's map-design state into what the preview needs. No state, no network.
// Hex fallbacks here (#ffffff, #4A9BAA, #111827, #e5e7eb) are default theme DATA, not styling.
import { normalizePinSize } from "../../lib/markerIcons";

/** Per-group design overrides from each group's theme_json, keyed by group id. */
export function groupOverridesFromGroups(groups) {
  const m = new Map();
  (groups || []).forEach((g) => {
    if (!g.id) return;
    const raw = g.theme_json;
    const theme =
      typeof raw === "string"
        ? (() => {
            try {
              return JSON.parse(raw || "{}");
            } catch {
              return {};
            }
          })()
        : raw || {};
    if (!theme || typeof theme !== "object") {
      m.set(g.id, {});
      return;
    }
    m.set(g.id, {
      marker_style: theme.marker_style ?? theme.markerStyle ?? null,
      marker_color: theme.marker_color ?? theme.markerColor ?? g.color ?? null,
      pinBorderColor: theme.pinBorderColor ?? null,
      pinBorderSize: theme.pinBorderSize != null ? theme.pinBorderSize : null,
      pinDropShadow: theme.pinDropShadow != null ? theme.pinDropShadow : null,
      clusterColor: theme.clusterColor ?? null,
      custom_pin_url: theme.custom_pin_url ?? null,
      pin_favicon_url: theme.pin_favicon_url ?? null,
      pin_favicon_mode: theme.pin_favicon_mode ?? "inherit",
      pinSize:
        theme.pinSize != null && theme.pinSize !== "" ? normalizePinSize(theme.pinSize) : null,
    });
  });
  return m;
}

/** Listings with their group's design (and the group being edited, live) merged in as group_* fields. */
export function listingsWithGroupColours({ listings, groupOverridesById, editingGroupId, groupEditDesign, globalDesignForGroup }) {
  return (listings || []).map((l) => {
    let overrides = l.group_id ? groupOverridesById.get(l.group_id) || {} : {};
    if (editingGroupId && groupEditDesign && l.group_id === editingGroupId) {
      const e = groupEditDesign;
      const g = globalDesignForGroup;
      const favMode = e.pin_favicon_mode ?? "inherit";
      overrides = {
        marker_style: e.marker_style ?? g.marker_style,
        marker_color: e.marker_color ?? g.marker_color,
        pinBorderColor: e.pinBorderColor ?? g.pinBorderColor,
        pinBorderSize: e.pinBorderSize != null ? e.pinBorderSize : g.pinBorderSize,
        pinDropShadow: e.pinDropShadow != null ? e.pinDropShadow : g.pinDropShadow,
        clusterColor: e.clusterColor ?? g.clusterColor,
        custom_pin_url: e.custom_pin_url ?? g.custom_pin_url,
        pin_favicon_url: favMode === "custom" ? (e.pin_favicon_url || null) : null,
        pin_favicon_mode: favMode,
        pinSize: e.pinSize != null ? normalizePinSize(e.pinSize) : g.pinSize,
      };
    }
    return {
      ...l,
      group_color: overrides.marker_color || null,
      group_marker_style: overrides.marker_style || null,
      group_custom_pin_url: overrides.custom_pin_url || null,
      group_pin_favicon_url: overrides.pin_favicon_url || null,
      group_pin_favicon_mode: overrides.pin_favicon_mode || "inherit",
      group_pin_border_color: overrides.pinBorderColor || null,
      group_pin_border_size:
        typeof overrides.pinBorderSize === "number" ? overrides.pinBorderSize : null,
      group_pin_drop_shadow:
        typeof overrides.pinDropShadow === "number" ? overrides.pinDropShadow : null,
      group_pin_size: overrides.pinSize != null && overrides.pinSize !== "" ? overrides.pinSize : null,
    };
  });
}

/** Theme object handed to PublishedMapView so the preview matches the draft. */
export function buildEditTheme({ panelBackgroundColor, panelBackgroundOpacity, panelLinkColor, buttonColor, pinDetailLayout, panelBorderRadius, pinSize, logoUrl, description, searchPanelBgColor, searchPanelBgOpacity, searchPanelTextColor, listingBgColor, listingBorderColor, listingOpacity, showContinentFilter, showKey, showLogo, showTitle, showListings }) {
  const toRgba = (hexColor, opacity) => {
    const hex = (hexColor || "#ffffff").trim().replace(/^#/, "");
    const m = hex.match(/.{2}/g);
    const r = m ? parseInt(m[0], 16) : 255;
    const g = m ? parseInt(m[1], 16) : 255;
    const b = m ? parseInt(m[2], 16) : 255;
    const a = Math.max(0, Math.min(1, Number(opacity) ?? 1));
    return `rgba(${r},${g},${b},${a})`;
  };
  return {
    panelBg: toRgba(panelBackgroundColor, panelBackgroundOpacity ?? 0.88),
    panelLinkColor: (panelLinkColor || "").trim() || "#4A9BAA",
    buttonColor: (buttonColor || "").trim() || "#4A9BAA",
    pinDetailLayout: pinDetailLayout === "drawer" ? "drawer" : "map",
    panelBorderRadius: Math.max(0, Math.min(28, Number(panelBorderRadius) || 12)),
    pinSize: normalizePinSize(pinSize),
    logoUrl: (logoUrl || "").trim(),
    description: typeof description === "string" ? description : "",
    searchPanelBg: toRgba(searchPanelBgColor, searchPanelBgOpacity ?? 0.92),
    searchPanelTextColor: (searchPanelTextColor || "").trim() || "#111827",
    listingBg: toRgba(listingBgColor, listingOpacity ?? 1),
    listingBorder: (listingBorderColor || "").trim() || "#e5e7eb",
    showContinentFilter: !!showContinentFilter,
    showKey: !!showKey,
    showLogo: !!showLogo,
    showTitle: !!showTitle,
    showListings: !!showListings,
  };
}

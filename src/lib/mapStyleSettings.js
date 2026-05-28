export const DETAIL_LEVEL_LABELS = ["None", "Low", "High", "All"];

export const DEFAULT_MAP_STYLE_SETTINGS = {
  baseType: "roadmap",
  colors: {
    land: "#e8e0d0",
    water: "#b4d4f0",
    roads: "#f4f0e6",
  },
  detail: {
    poi: 2,
    business: 1,
    transit: 1,
    roadLabels: 2,
    adminLabels: 3,
  },
  overlays: {
    terrain: false,
    traffic: false,
    transit: false,
    bikeLanes: false,
  },
};

function clampDetailLevel(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(3, Math.round(n)));
}

function normalizeHex(value, fallback) {
  const raw = String(value || "").trim();
  const fullHex = /^#[0-9a-fA-F]{6}$/;
  if (fullHex.test(raw)) return raw.toLowerCase();
  const shortHex = /^#[0-9a-fA-F]{3}$/;
  if (shortHex.test(raw)) {
    return (
      "#" +
      raw
        .slice(1)
        .split("")
        .map((ch) => ch + ch)
        .join("")
    ).toLowerCase();
  }
  return fallback;
}

export function normalizeMapStyleSettings(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const colors = src.colors && typeof src.colors === "object" ? src.colors : {};
  const detail = src.detail && typeof src.detail === "object" ? src.detail : {};
  const overlays = src.overlays && typeof src.overlays === "object" ? src.overlays : {};
  const baseType =
    src.baseType === "satellite" || src.baseType === "hybrid" || src.baseType === "terrain"
      ? src.baseType
      : "roadmap";
  return {
    baseType,
    colors: {
      land: normalizeHex(colors.land, DEFAULT_MAP_STYLE_SETTINGS.colors.land),
      water: normalizeHex(colors.water, DEFAULT_MAP_STYLE_SETTINGS.colors.water),
      roads: normalizeHex(colors.roads, DEFAULT_MAP_STYLE_SETTINGS.colors.roads),
    },
    detail: {
      poi: clampDetailLevel(detail.poi, DEFAULT_MAP_STYLE_SETTINGS.detail.poi),
      business: clampDetailLevel(detail.business, DEFAULT_MAP_STYLE_SETTINGS.detail.business),
      transit: clampDetailLevel(detail.transit, DEFAULT_MAP_STYLE_SETTINGS.detail.transit),
      roadLabels: clampDetailLevel(detail.roadLabels, DEFAULT_MAP_STYLE_SETTINGS.detail.roadLabels),
      adminLabels: clampDetailLevel(detail.adminLabels, DEFAULT_MAP_STYLE_SETTINGS.detail.adminLabels),
    },
    overlays: {
      terrain: overlays.terrain === true,
      traffic: overlays.traffic === true,
      transit: overlays.transit === true,
      bikeLanes: overlays.bikeLanes === true,
    },
  };
}

function detailStylers(level) {
  if (level === 0) return [{ visibility: "off" }];
  if (level === 1) return [{ visibility: "simplified" }];
  if (level === 2) return [{ visibility: "on" }];
  return null;
}

export function buildMapStyles(land, water, roads, detail, overlays) {
  const styles = [
    { featureType: "landscape", elementType: "geometry", stylers: [{ color: land }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: water }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: roads }] },
  ];

  const detailRules = [
    { key: "poi", featureType: "poi" },
    { key: "business", featureType: "poi.business" },
    { key: "transit", featureType: "transit" },
    { key: "roadLabels", featureType: "road", elementType: "labels" },
    { key: "adminLabels", featureType: "administrative", elementType: "labels" },
  ];

  detailRules.forEach(({ key, featureType, elementType }) => {
    const stylers = detailStylers(detail[key]);
    if (!stylers) return;
    styles.push({
      featureType,
      ...(elementType ? { elementType } : {}),
      stylers,
    });
  });

  if (overlays?.terrain) {
    styles.push(
      { featureType: "landscape.natural", elementType: "geometry", stylers: [{ saturation: -10 }, { lightness: -8 }] },
      { featureType: "landscape.natural.terrain", elementType: "geometry", stylers: [{ visibility: "on" }] }
    );
  }

  return styles;
}

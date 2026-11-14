// Shared data and pure helpers for the map design/publish dashboard (client and admin).
// Hex values in this file are DATA (map style preset colours, logo background swatches), never styling.

export const TABS = ["detail", "design", "panels", "groups", "mapstyle", "publish", "search", "filters", "messaging"];
export const PAGE_SIZE = 100;
export const LOGO_BG_SWATCHES = [
  { label: "None", value: "" },
  { label: "Light", value: "#d4d4d4" },
  { label: "Mid", value: "#737373" },
  { label: "Dark", value: "#1a1a1a" },
];

export function tabLabel(t) {
  if (t === "detail") return "General";
  if (t === "design") return "Pin design";
  if (t === "groups") return "Groups";
  if (t === "mapstyle") return "Map style";
  if (t === "publish") return "Publish map";
  if (t === "filters") return "Filters";
  if (t === "messaging") return "Messaging";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export const MAP_TYPES = [
  { id: "roadmap", label: "Roadmap" },
  { id: "roadmap_silver", label: "Silver" },
  { id: "roadmap_dark", label: "Dark" },
  { id: "roadmap_muted", label: "Muted" },
  { id: "roadmap_atlas", label: "Atlas" },
  { id: "satellite", label: "Satellite" },
  { id: "hybrid", label: "Hybrid" },
  { id: "terrain", label: "Terrain" },
];
export const BASE_TYPE_OPTIONS = [
  { id: "roadmap", label: "Roadmap" },
  { id: "satellite", label: "Satellite" },
  { id: "hybrid", label: "Hybrid" },
  { id: "terrain", label: "Terrain" },
];
export const DETAIL_CONTROLS = [
  { key: "poi", label: "Places of interest", description: "Restaurants, cafes, attractions" },
  { key: "business", label: "Local businesses", description: "Shops, services, offices" },
  { key: "transit", label: "Transit & transport", description: "Bus stops, stations, routes" },
  { key: "roadLabels", label: "Road labels", description: "Street names and numbers" },
  { key: "adminLabels", label: "Administrative labels", description: "Towns, counties, countries" },
];
export const OVERLAY_CONTROLS = [
  { key: "terrain", label: "Terrain & contours", description: "Show elevation shading and contour lines" },
  { key: "traffic", label: "Traffic layer", description: "Live traffic conditions" },
  { key: "transit", label: "Public transport routes", description: "Bus, rail and tube lines" },
  { key: "bikeLanes", label: "Bike lanes", description: "Cycle paths and shared routes" },
];
export const PIN_STYLES = [
  { id: "pin", label: "Pin" },
  { id: "teardrop", label: "Rounded pin" },
  { id: "dot", label: "Dot" },
  { id: "custom", label: "Custom icon" },
];

// Colours drawn by MapStyleThumb for each preset (data).
export const MAP_STYLE_COLORS = {
  roadmap:        { land: "#e8e4de", water: "#a8c8e8", road: "#ffffff", border: "#c8c0b0" },
  roadmap_silver: { land: "#ebe3cd", water: "#b9d3c2", road: "#fdfcf8", border: "#c9b2a6" },
  roadmap_dark:   { land: "#374151", water: "#17263c", road: "#4b5563", border: "#4a5568" },
  roadmap_muted:  { land: "#e8e2d5", water: "#b8d4e3", road: "#f0ede6", border: "#8b8680" },
  roadmap_atlas:  { land: "#cdb98a", water: "#8bbde0", road: "#d8c898", border: "#a0906a" },
  satellite:      { land: "#2a3f28", water: "#1a3548", road: "#3d5a3d", border: "#1e2e1e" },
  hybrid:         { land: "#2a3f28", water: "#1a3548", road: "#6b7280", border: "#374151" },
  terrain:        { land: "#8aaa6a", water: "#7abadb", road: "#b8d4a8", border: "#6a8a5a" },
};


// Settings applied when a preset is chosen (data).
export const MAP_STYLE_PRESET_SETTINGS = {
  roadmap: {
    baseType: "roadmap",
    colors: { land: "#e8e4de", water: "#a8c8e8", roads: "#ffffff" },
    detail: { poi: 2, business: 1, transit: 1, roadLabels: 2, adminLabels: 3 },
    overlays: { terrain: false, traffic: false, transit: false, bikeLanes: false },
  },
  roadmap_silver: {
    baseType: "roadmap",
    colors: { land: "#ebe3cd", water: "#b9d3c2", roads: "#fdfcf8" },
    detail: { poi: 2, business: 1, transit: 1, roadLabels: 2, adminLabels: 2 },
    overlays: { terrain: false, traffic: false, transit: false, bikeLanes: false },
  },
  roadmap_dark: {
    baseType: "roadmap",
    colors: { land: "#374151", water: "#17263c", roads: "#4b5563" },
    detail: { poi: 1, business: 1, transit: 1, roadLabels: 2, adminLabels: 2 },
    overlays: { terrain: false, traffic: false, transit: true, bikeLanes: false },
  },
  roadmap_muted: {
    baseType: "roadmap",
    colors: { land: "#e8e2d5", water: "#b8d4e3", roads: "#f0ede6" },
    detail: { poi: 2, business: 1, transit: 1, roadLabels: 2, adminLabels: 3 },
    overlays: { terrain: false, traffic: false, transit: false, bikeLanes: false },
  },
  roadmap_atlas: {
    baseType: "roadmap",
    colors: { land: "#cdb98a", water: "#8bbde0", roads: "#d8c898" },
    detail: { poi: 0, business: 0, transit: 0, roadLabels: 0, adminLabels: 3 },
    overlays: { terrain: false, traffic: false, transit: false, bikeLanes: false },
  },
  satellite: {
    baseType: "satellite",
    colors: { land: "#2a3f28", water: "#1a3548", roads: "#3d5a3d" },
    detail: { poi: 1, business: 1, transit: 1, roadLabels: 2, adminLabels: 2 },
    overlays: { terrain: false, traffic: false, transit: false, bikeLanes: false },
  },
  hybrid: {
    baseType: "hybrid",
    colors: { land: "#2a3f28", water: "#1a3548", roads: "#6b7280" },
    detail: { poi: 2, business: 2, transit: 2, roadLabels: 3, adminLabels: 3 },
    overlays: { terrain: false, traffic: false, transit: true, bikeLanes: false },
  },
  terrain: {
    baseType: "terrain",
    colors: { land: "#8aaa6a", water: "#7abadb", roads: "#b8d4a8" },
    detail: { poi: 2, business: 1, transit: 1, roadLabels: 2, adminLabels: 3 },
    overlays: { terrain: true, traffic: false, transit: false, bikeLanes: false },
  },
};

export function defaultPresetIdFromMapTypeId(mapTypeId) {
  return MAP_STYLE_PRESET_SETTINGS[mapTypeId] ? mapTypeId : null;
}


/** Embed code (iframe) for the published map. Output goes on the client's own site. */
export function buildEmbedIframe({ embedSrc, embedWidth, embedWidthUnit, embedHeight, mapId }) {
  const w = String(embedWidth).trim() || "100";
  const widthAttr = embedWidthUnit === "%" ? `${w}%` : `${w}px`;
  const h = String(embedHeight).trim() || "800";
  const uid = `dm-e-${String(mapId).replace(/[^a-z0-9]/gi, "")}`;
  return `<style>.${uid}{width:${widthAttr};height:${h}px}@media(max-width:767px){.${uid}{width:100%;height:100vh;height:100dvh}}</style>
<div class="${uid}">
  <iframe src="${embedSrc}" width="100%" height="100%" style="border:0;border-radius:12px" loading="lazy" allowfullscreen></iframe>
</div>`;
}

/** Embed code for the thumbnail that opens the map in a lightbox. */
export function buildEmbedThumbnail({ embedSrc, mapId, thumbSize }) {
  const sizes = { small: [240, 160], medium: [360, 240], large: [480, 320] };
  const [w, h] = sizes[thumbSize] || sizes.medium;
  const iw = 1200, ih = Math.round(iw * (h / w));
  const scale = (w / iw).toFixed(4);
  const uid = `dm-lb-${String(mapId).replace(/[^a-z0-9]/gi, "")}`;
  return `<style>
.dm-thumb{width:${w}px;height:${h}px;position:relative;border-radius:10px;overflow:hidden;cursor:pointer;box-shadow:0 2px 12px rgba(0,0,0,.18)}
.dm-thumb iframe{width:${iw}px;height:${ih}px;border:0;transform:scale(${scale});transform-origin:top left;pointer-events:none}
.dm-thumb-cta{position:absolute;inset:0;background:linear-gradient(transparent 55%,rgba(0,0,0,.35));display:flex;align-items:flex-end;padding:12px}
.dm-thumb-cta span{color:#fff;font:600 13px/1 system-ui,sans-serif;letter-spacing:.01em}
.dm-lb{display:none;position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.82);align-items:center;justify-content:center}
.dm-lb.open{display:flex}
.dm-lb-inner{position:relative;width:90vw;max-width:1200px;height:85vh;border-radius:12px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.5)}
.dm-lb-close{position:absolute;top:12px;right:12px;z-index:1;width:34px;height:34px;border-radius:50%;background:#fff;border:none;font-size:20px;line-height:34px;text-align:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2)}
.dm-lb iframe{width:100%;height:100%;border:0}
</style>
<div class="dm-thumb" onclick="document.getElementById('${uid}').classList.add('open')">
  <iframe src="${embedSrc}" loading="lazy" scrolling="no"></iframe>
  <div class="dm-thumb-cta"><span>View map →</span></div>
</div>
<div class="dm-lb" id="${uid}" onclick="if(event.target===this)this.classList.remove('open')">
  <div class="dm-lb-inner">
    <button class="dm-lb-close" onclick="document.getElementById('${uid}').classList.remove('open')" aria-label="Close">×</button>
    <iframe src="${embedSrc}" loading="lazy" allowfullscreen></iframe>
  </div>
</div>`;
}

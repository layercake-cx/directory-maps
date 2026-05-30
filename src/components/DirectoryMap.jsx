import { useEffect, useMemo, useRef, useState } from "react";
import { MarkerClusterer, SuperClusterAlgorithm } from "@googlemaps/markerclusterer";
import { loadGoogleMaps } from "../lib/loadGoogleMaps";
import { getMarkerIconUrl, getScaledMarkerAnchors, normalizePinSize } from "../lib/markerIcons";

function clusterIconDataUrl(color, opacity = 1) {
  const fill = color || "#4A9BAA";
  const o = Math.max(0, Math.min(1, Number(opacity) || 1));
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
      <g opacity="${o}">
        <circle cx="24" cy="24" r="20" fill="${fill}" opacity="0.85" stroke="white" stroke-width="2"/>
        <circle cx="24" cy="24" r="14" fill="${fill}" opacity="0.5"/>
      </g>
    </svg>
  `.trim();
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

const MAP_TYPE_IDS = ["roadmap", "satellite", "hybrid", "terrain"];
const CUSTOM_ROADMAP_IDS = ["roadmap_silver", "roadmap_dark", "roadmap_muted", "roadmap_atlas"];

/** Styled roadmap: muted / illustrated (light beige land, light blue water, clean borders – Eastern Europe atlas style) */
const ROADMAP_MUTED_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#e8e2d5" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#3d3d3d" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f0" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#8b8680" }, { weight: 1 }] },
  { featureType: "administrative.land_parcel", elementType: "geometry.stroke", stylers: [{ color: "#d4cfc4" }] },
  { featureType: "administrative.land_parcel", elementType: "labels.text.fill", stylers: [{ color: "#9a958a" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#e0dac8" }] },
  { featureType: "landscape.natural.terrain", elementType: "geometry", stylers: [{ color: "#d8d2be" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#e0dac8" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#5c5c5c" }] },
  { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#c9d9c4" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#4a5d48" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#f0ede6" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#f5f3eb" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#e8e0d0" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#d4cfc4" }] },
  { featureType: "road.local", elementType: "geometry", stylers: [{ color: "#f5f3eb" }] },
  { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#7a756b" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#e0dac8" }] },
  { featureType: "water", elementType: "geometry.fill", stylers: [{ color: "#b8d4e3" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#6b7d85" }] },
];

/** Styled roadmap: silver/light (beige, muted) */
const ROADMAP_SILVER_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#ebe3cd" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#523735" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f5f1e6" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#c9b2a6" }] },
  { featureType: "administrative.land_parcel", elementType: "geometry.stroke", stylers: [{ color: "#dcd2be" }] },
  { featureType: "administrative.land_parcel", elementType: "labels.text.fill", stylers: [{ color: "#ae9e90" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#dfd2ae" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#dfd2ae" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#93817c" }] },
  { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#a5b076" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#447530" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#f5f1e6" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#fdfcf8" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#f8c967" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#e9bc62" }] },
  { featureType: "road.highway.controlled_access", elementType: "geometry", stylers: [{ color: "#e98d58" }] },
  { featureType: "road.highway.controlled_access", elementType: "geometry.stroke", stylers: [{ color: "#db8555" }] },
  { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#806b63" }] },
  { featureType: "transit.line", elementType: "geometry", stylers: [{ color: "#dfd2ae" }] },
  { featureType: "transit.line", elementType: "labels.text.fill", stylers: [{ color: "#8f7d77" }] },
  { featureType: "transit.line", elementType: "labels.text.stroke", stylers: [{ color: "#ebe3cd" }] },
  { featureType: "transit.station", elementType: "geometry", stylers: [{ color: "#dfd2ae" }] },
  { featureType: "water", elementType: "geometry.fill", stylers: [{ color: "#b9d3c2" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#92998d" }] },
];

/** Styled roadmap: dark */
const ROADMAP_DARK_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#263c3f" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6b9a76" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
  { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "water", elementType: "geometry.fill", stylers: [{ color: "#17263c" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
];

/** Styled roadmap: atlas (warm sandy land, clear blue water, country borders — matches IAPCO/Atlist style) */
const ROADMAP_ATLAS_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#cdb98a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#3d3520" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f0e8d0" }] },
  { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#a0906a" }, { weight: 1.2 }] },
  { featureType: "administrative.country", elementType: "labels.text.fill", stylers: [{ color: "#5a4a30" }] },
  { featureType: "administrative.province", elementType: "geometry.stroke", stylers: [{ color: "#b8a47a" }, { weight: 0.6 }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#c8af80" }] },
  { featureType: "landscape.natural.terrain", elementType: "geometry", stylers: [{ color: "#baa870" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#c8af80" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#d8c898" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry.fill", stylers: [{ color: "#8bbde0" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4a7aaa" }] },
];

/** Pixel position of a lat/lng on the map div (matches marker click math). */
function latLngToMapDivPixel(map, lat, lng) {
  const proj = map.getProjection();
  const bounds = map.getBounds();
  if (!proj || !bounds) return null;
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  const topRight = proj.fromLatLngToPoint(ne);
  const bottomLeft = proj.fromLatLngToPoint(sw);
  const pt = proj.fromLatLngToPoint(new window.google.maps.LatLng(lat, lng));
  const div = map.getDiv();
  const x = ((pt.x - bottomLeft.x) / (topRight.x - bottomLeft.x)) * div.offsetWidth;
  const y = ((pt.y - topRight.y) / (bottomLeft.y - topRight.y)) * div.offsetHeight;
  return { x, y };
}

function attachZoomSliderControl(map, showZoomSlider) {
  if (!showZoomSlider || !window.google?.maps) return () => {};
  const { ControlPosition } = window.google.maps;
  const doc = map.getDiv()?.ownerDocument || document;
  const body = doc.body;
  let pseudoFullscreen = false;

  const wrap = document.createElement("div");
  wrap.className = "directory-map-zoom-slider-wrap";

  const btnFullscreen = document.createElement("button");
  btnFullscreen.type = "button";
  btnFullscreen.className = "directory-map-zoom-btn directory-map-zoom-btn--fullscreen";
  btnFullscreen.setAttribute("aria-label", "Toggle fullscreen");
  btnFullscreen.textContent = "⛶";

  const btnPlus = document.createElement("button");
  btnPlus.type = "button";
  btnPlus.className = "directory-map-zoom-btn";
  btnPlus.setAttribute("aria-label", "Zoom in");
  btnPlus.textContent = "+";

  const trackOuter = document.createElement("div");
  trackOuter.className = "directory-map-zoom-slider-track-outer";

  const input = document.createElement("input");
  input.type = "range";
  input.className = "directory-map-zoom-slider-input";
  input.setAttribute("aria-label", "Map zoom level");
  input.setAttribute("orient", "vertical");

  const btnMinus = document.createElement("button");
  btnMinus.type = "button";
  btnMinus.className = "directory-map-zoom-btn";
  btnMinus.setAttribute("aria-label", "Zoom out");
  btnMinus.textContent = "\u2212";

  trackOuter.appendChild(input);
  wrap.appendChild(btnFullscreen);
  wrap.appendChild(btnPlus);
  wrap.appendChild(trackOuter);
  wrap.appendChild(btnMinus);

  function readLimits() {
    let min = 0;
    let max = 22;
    try {
      const mn = typeof map.getMinZoom === "function" ? map.getMinZoom() : map.get("minZoom");
      const mx = typeof map.getMaxZoom === "function" ? map.getMaxZoom() : map.get("maxZoom");
      if (typeof mn === "number" && !Number.isNaN(mn)) min = mn;
      if (typeof mx === "number" && !Number.isNaN(mx)) max = mx;
    } catch (_) {
      /* keep defaults */
    }
    return { min, max };
  }

  function syncFromMap() {
    const { min, max } = readLimits();
    const z = map.getZoom();
    if (z == null) return;
    const rounded = Math.round(z);
    const clamped = Math.min(max, Math.max(min, rounded));
    input.min = String(min);
    input.max = String(max);
    input.step = "1";
    input.value = String(clamped);
  }

  function stepZoom(delta) {
    const { min, max } = readLimits();
    const z = map.getZoom();
    if (z == null) return;
    const next = Math.min(max, Math.max(min, Math.round(z) + delta));
    map.setZoom(next);
  }

  function onInput() {
    const v = Number(input.value);
    if (Number.isNaN(v)) return;
    map.setZoom(v);
  }

  const onPlus = () => stepZoom(1);
  const onMinus = () => stepZoom(-1);
  const updateFullscreenButton = () => {
    const active = !!(doc.fullscreenElement || doc.webkitFullscreenElement || pseudoFullscreen);
    btnFullscreen.textContent = active ? "⤫" : "⛶";
    btnFullscreen.setAttribute("aria-label", active ? "Exit fullscreen" : "Enter fullscreen");
  };
  const getFullscreenTarget = () => {
    const div = map.getDiv();
    if (!div) return null;
    return div.closest("[data-map-fullscreen-root]") || div;
  };
  const exitPseudoFullscreen = () => {
    if (!pseudoFullscreen) return;
    const target = getFullscreenTarget();
    if (target) target.classList.remove("directory-map--pseudo-fullscreen");
    if (body) body.classList.remove("directory-map-body--pseudo-fullscreen");
    pseudoFullscreen = false;
  };
  const enterPseudoFullscreen = () => {
    const target = getFullscreenTarget();
    if (!target) return false;
    target.classList.add("directory-map--pseudo-fullscreen");
    if (body) body.classList.add("directory-map-body--pseudo-fullscreen");
    pseudoFullscreen = true;
    return true;
  };
  const onFullscreen = async () => {
    const target = getFullscreenTarget();
    if (!target) return;
    const active = doc.fullscreenElement || doc.webkitFullscreenElement;
    if (active) {
      if (typeof doc.exitFullscreen === "function") {
        await doc.exitFullscreen();
      } else if (typeof doc.webkitExitFullscreen === "function") {
        doc.webkitExitFullscreen();
      } else {
        exitPseudoFullscreen();
      }
      updateFullscreenButton();
      return;
    }
    if (pseudoFullscreen) {
      exitPseudoFullscreen();
      updateFullscreenButton();
      return;
    }

    // Prefer real fullscreen; fall back to pseudo fullscreen when blocked (common in embeds without allowfullscreen).
    const candidates = [
      target,
      target.parentElement,
      doc.documentElement,
    ].filter(Boolean);
    for (const el of candidates) {
      try {
        if (typeof el.requestFullscreen === "function") {
          await el.requestFullscreen();
          updateFullscreenButton();
          return;
        }
        if (typeof el.webkitRequestFullscreen === "function") {
          el.webkitRequestFullscreen();
          updateFullscreenButton();
          return;
        }
      } catch (_) {
        // Try next candidate.
      }
    }

    if (enterPseudoFullscreen()) {
      updateFullscreenButton();
    }
  };
  const onFullscreenChanged = () => {
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      exitPseudoFullscreen();
    }
    updateFullscreenButton();
  };

  btnFullscreen.addEventListener("click", onFullscreen);
  btnPlus.addEventListener("click", onPlus);
  btnMinus.addEventListener("click", onMinus);
  input.addEventListener("input", onInput);
  doc.addEventListener("fullscreenchange", onFullscreenChanged);
  doc.addEventListener("webkitfullscreenchange", onFullscreenChanged);

  const zoomListener = map.addListener("zoom_changed", syncFromMap);
  const idleListener = map.addListener("idle", syncFromMap);

  map.controls[ControlPosition.RIGHT_BOTTOM].push(wrap);
  syncFromMap();
  updateFullscreenButton();

  return () => {
    doc.removeEventListener("fullscreenchange", onFullscreenChanged);
    doc.removeEventListener("webkitfullscreenchange", onFullscreenChanged);
    exitPseudoFullscreen();
    btnFullscreen.removeEventListener("click", onFullscreen);
    btnPlus.removeEventListener("click", onPlus);
    btnMinus.removeEventListener("click", onMinus);
    input.removeEventListener("input", onInput);
    window.google.maps.event.removeListener(zoomListener);
    window.google.maps.event.removeListener(idleListener);
    const controls = map.controls[ControlPosition.RIGHT_BOTTOM];
    for (let i = controls.getLength() - 1; i >= 0; i--) {
      if (controls.getAt(i) === wrap) {
        controls.removeAt(i);
        break;
      }
    }
  };
}

function registerCustomMapTypes(map) {
  if (!window.google?.maps?.StyledMapType) return;
  if (map.mapTypes.get("roadmap_silver")) return;
  const silver = new window.google.maps.StyledMapType(ROADMAP_SILVER_STYLES, { name: "Roadmap (Silver)" });
  const dark = new window.google.maps.StyledMapType(ROADMAP_DARK_STYLES, { name: "Roadmap (Dark)" });
  const muted = new window.google.maps.StyledMapType(ROADMAP_MUTED_STYLES, { name: "Roadmap (Muted)" });
  const atlas = new window.google.maps.StyledMapType(ROADMAP_ATLAS_STYLES, { name: "Atlas" });
  map.mapTypes.set("roadmap_silver", silver);
  map.mapTypes.set("roadmap_dark", dark);
  map.mapTypes.set("roadmap_muted", muted);
  map.mapTypes.set("roadmap_atlas", atlas);
}

export default function DirectoryMap({
  apiKey,
  center,
  zoom,
  mapTypeId = "roadmap",
  listings,
  onSelect,
  centerOnListingId = null,
  defaultMarkerColor = "#4A9BAA",
  markerStyle = "pin",
  customMarkerIconUrl = null,
  height = "75vh",
  enableClustering = false,
  clusterRadius = 80,
  clusterColor = "#4A9BAA",
  clusterOpacity = 1,
  pinBorderColor = "#ffffff",
  pinBorderSize = 0,
  pinFaviconUrl = null,
  pinDropShadow = 0,
  pinShadowDistance = 20,
  pinShadowOpacity = 100,
  /** small | medium | large — medium matches historical default marker scale */
  pinSize = "medium",
  /** When set (e.g. listing detail panel open), keep updating screen position on pan/zoom */
  screenOverlayListing = null,
  onScreenOverlayPosition,
  /** `greedy` captures wheel/trackpad for zoom; `cooperative` lets the page scroll (use Ctrl/Cmd+wheel to zoom). */
  /** `cooperative`: wheel/trackpad scroll does not zoom the map (use Ctrl+scroll to zoom); pinch/2-finger gestures still zoom/pan. `greedy`: wheel zooms the map. */
  gestureHandling = "cooperative",
  /** Slider next to the default +/- zoom controls */
  showZoomSlider = true,
  /**
   * When set (new `id` each time), pans/zooms or fits bounds — e.g. geocoded country/place from search.
   * `bounds` preferred for countries/regions; else `center` + `zoom`.
   */
  cameraRequest = null,
  /** Padding passed to `fitBounds` so the list panel doesn’t cover the result */
  mapFitBoundsPadding = null,
  /** Zoom level applied when selecting a pin or centering on a listing. Street-level default. */
  selectZoom = 15,
  /** Horizontal pixel offset applied via panBy after centering on a selection. Positive shifts the
   *  map center right so the pin appears left of center — use when a side panel occupies the right. */
  selectPanOffsetX = 0,
  mapStyles = null,
  showTrafficLayer = false,
  showTransitLayer = false,
  showBikeLayer = false,
  showZoomIndicator = false,
}) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map()); // id -> marker
  const clustererRef = useRef(null);
  const omsRef = useRef(null); // spiderfy cleanup handle
  const trafficLayerRef = useRef(null);
  const transitLayerRef = useRef(null);
  const bikeLayerRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [currentZoomDisplay, setCurrentZoomDisplay] = useState(null);

  const points = useMemo(
    () => (listings || []).filter((l) => l.lat != null && l.lng != null),
    [listings]
  );

  useEffect(() => {
    if (!centerOnListingId || !mapRef.current || !points.length) return;
    const point = points.find((p) => p.id === centerOnListingId);
    if (!point) return;

    const map = mapRef.current;
    const pos = { lat: Number(point.lat), lng: Number(point.lng) };
    map.setCenter(pos);
    map.setZoom(selectZoom);
    if (selectPanOffsetX) map.panBy(selectPanOffsetX, 0);

    if (onSelect) {
      const pixel = latLngToMapDivPixel(map, pos.lat, pos.lng);
      if (pixel) onSelect(point, pixel);
      else onSelect(point, null);
    }
  }, [centerOnListingId, points]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      await loadGoogleMaps(apiKey);
      if (cancelled) return;

      const isCustomRoadmap = CUSTOM_ROADMAP_IDS.includes(mapTypeId);
      const builtinId = MAP_TYPE_IDS.includes(mapTypeId) ? mapTypeId : "roadmap";
      const initialMapType =
        isCustomRoadmap ? "roadmap" : window.google.maps.MapTypeId?.[builtinId.toUpperCase()] ?? builtinId;

      if (!mapRef.current) {
        const { ControlPosition } = window.google.maps;
        mapRef.current = new window.google.maps.Map(elRef.current, {
          center,
          zoom,
          mapTypeId: initialMapType,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: !showZoomSlider,
          fullscreenControlOptions: { position: ControlPosition.RIGHT_BOTTOM },
          zoomControl: !showZoomSlider,
          zoomControlOptions: { position: ControlPosition.RIGHT_BOTTOM },
          gestureHandling,
          scrollwheel: gestureHandling === "greedy",
        });
        registerCustomMapTypes(mapRef.current);
      }

      const resolvedType =
        isCustomRoadmap ? mapTypeId : window.google.maps.MapTypeId?.[builtinId.toUpperCase()] ?? builtinId;
      mapRef.current.setMapTypeId(resolvedType);

      setMapReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [apiKey, mapTypeId]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.google?.maps) return;
    mapRef.current.setOptions({
      gestureHandling,
      scrollwheel: gestureHandling === "greedy",
      fullscreenControl: !showZoomSlider,
      zoomControl: !showZoomSlider,
    });
  }, [mapReady, gestureHandling, showZoomSlider]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.google?.maps) return;
    return attachZoomSliderControl(mapRef.current, showZoomSlider);
  }, [mapReady, showZoomSlider]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.google?.maps || !cameraRequest) return;
    const map = mapRef.current;
    const pad = mapFitBoundsPadding ?? { top: 40, right: 40, bottom: 40, left: 40 };

    if (cameraRequest.bounds) {
      const b = cameraRequest.bounds;
      map.fitBounds(
        {
          north: b.north,
          south: b.south,
          east: b.east,
          west: b.west,
        },
        pad
      );
    } else if (cameraRequest.center) {
      map.panTo(cameraRequest.center);
      if (typeof cameraRequest.zoom === "number") {
        map.setZoom(cameraRequest.zoom);
      }
    }
    // mapFitBoundsPadding: use latest from render when cameraRequest updates (omit from deps to avoid refitting every render)
  }, [mapReady, cameraRequest]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.google?.maps) return;
    mapRef.current.setOptions({ styles: Array.isArray(mapStyles) ? mapStyles : null });
  }, [mapReady, mapStyles]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.google?.maps) return;
    const map = mapRef.current;
    const mapsApi = window.google.maps;

    if (!trafficLayerRef.current) trafficLayerRef.current = new mapsApi.TrafficLayer();
    if (!transitLayerRef.current) transitLayerRef.current = new mapsApi.TransitLayer();
    if (!bikeLayerRef.current) bikeLayerRef.current = new mapsApi.BicyclingLayer();

    trafficLayerRef.current.setMap(showTrafficLayer ? map : null);
    transitLayerRef.current.setMap(showTransitLayer ? map : null);
    bikeLayerRef.current.setMap(showBikeLayer ? map : null);
  }, [mapReady, showTrafficLayer, showTransitLayer, showBikeLayer]);

  useEffect(() => {
    return () => {
      trafficLayerRef.current?.setMap(null);
      transitLayerRef.current?.setMap(null);
      bikeLayerRef.current?.setMap(null);
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.google?.maps || !onScreenOverlayPosition) return;
    const lat = screenOverlayListing?.lat;
    const lng = screenOverlayListing?.lng;
    if (lat == null || lng == null) return;

    const map = mapRef.current;
    let rafId = 0;

    function pushPosition() {
      const nlat = Number(lat);
      const nlng = Number(lng);
      if (Number.isNaN(nlat) || Number.isNaN(nlng)) return;
      const pixel = latLngToMapDivPixel(map, nlat, nlng);
      if (pixel) onScreenOverlayPosition(pixel);
    }

    function onBoundsChanged() {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        pushPosition();
      });
    }

    const listener = map.addListener("bounds_changed", onBoundsChanged);
    pushPosition();

    return () => {
      window.google.maps.event.removeListener(listener);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [mapReady, screenOverlayListing?.id, screenOverlayListing?.lat, screenOverlayListing?.lng, onScreenOverlayPosition]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.google?.maps) return;

    const map = mapRef.current;

    const makeIcon = (
      styleForMarker,
      color,
      customUrlForMarker,
      faviconForMarker,
      borderColorForMarker,
      borderSizeForMarker,
      dropShadowForMarker,
      pinSizeForMarker,
    ) => {
      const styleKey = styleForMarker === "custom" && customUrlForMarker ? "custom" : styleForMarker || "pin";
      const { scaledSize, anchor } = getScaledMarkerAnchors(styleKey, pinSizeForMarker);
      return {
        url: getMarkerIconUrl({
          style: styleForMarker,
          color,
          customIconUrl: customUrlForMarker || undefined,
          pinBorderColor: borderColorForMarker,
          pinBorderSize: borderSizeForMarker,
          pinFaviconUrl: faviconForMarker || undefined,
          pinDropShadowPx: dropShadowForMarker,
          pinDropShadowDistance: pinShadowDistance,
          pinDropShadowOpacity: pinShadowOpacity,
        }),
        scaledSize: new window.google.maps.Size(scaledSize.w, scaledSize.h),
        anchor: new window.google.maps.Point(anchor.x, anchor.y),
      };
    };

    // Remove clusterer when toggling off or when radius changes (we'll recreate below if needed)
    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
      clustererRef.current.setMap(null);
      clustererRef.current = null;
    }

    // Remove any markers from the map when switching from non-clustering to clustering
    const keepIds = new Set(points.map((p) => p.id));
    for (const [id, marker] of markersRef.current.entries()) {
      if (!keepIds.has(id)) {
        marker.setMap(null);
        markersRef.current.delete(id);
      } else {
        marker.setMap(null);
      }
    }

    const markerList = [];
    points.forEach((p) => {
      const color = p.group_color || defaultMarkerColor;
      const styleForListing = p.group_marker_style || markerStyle;
      const customUrlForListing = p.group_custom_pin_url || customMarkerIconUrl;
      let faviconForListing = pinFaviconUrl || null;
      if (p.group_pin_favicon_mode === "off") {
        faviconForListing = null;
      } else if (p.group_pin_favicon_mode === "custom") {
        faviconForListing = p.group_pin_favicon_url || null;
      }
      const borderColorForListing = p.group_pin_border_color || pinBorderColor;
      const borderSizeForListing =
        typeof p.group_pin_border_size === "number" ? p.group_pin_border_size : pinBorderSize;
      const dropShadowForListing =
        typeof p.group_pin_drop_shadow === "number" ? p.group_pin_drop_shadow : pinDropShadow;
      const pinSizeForListing =
        p.group_pin_size != null && p.group_pin_size !== ""
          ? normalizePinSize(p.group_pin_size)
          : normalizePinSize(pinSize);
      const icon = makeIcon(
        styleForListing === "custom" && customUrlForListing ? "custom" : styleForListing || "pin",
        color,
        customUrlForListing,
        faviconForListing,
        borderColorForListing,
        borderSizeForListing,
        dropShadowForListing,
        pinSizeForListing,
      );

      let marker = markersRef.current.get(p.id);
      if (marker) {
        marker.setIcon(icon);
        marker.setTitle(p.name);
        // Reset to original coords in case a previous spiderfy left it spread.
        marker.setPosition({ lat: Number(p.lat), lng: Number(p.lng) });
      } else {
        marker = new window.google.maps.Marker({
          position: { lat: Number(p.lat), lng: Number(p.lng) },
          map: null,
          title: p.name,
          icon,
          zIndex: 2000,
        });
        markersRef.current.set(p.id, marker);
      }
      marker._listing = p;
      markerList.push(marker);
    });

    // --- Spiderfy: fan out co-located pins so all are clickable ---
    // Cleanup any previous spiderfy state before rebuilding.
    if (omsRef.current) { omsRef.current.cleanup(); omsRef.current = null; }

    const POS_PRECISION = 5; // ~1 m
    const byPos = new Map();
    markerList.forEach((m) => {
      const pos = m.getPosition();
      if (!pos) return;
      const key = `${pos.lat().toFixed(POS_PRECISION)},${pos.lng().toFixed(POS_PRECISION)}`;
      m._posKey = key; // store original key — stays valid even after position is spread
      if (!byPos.has(key)) byPos.set(key, []);
      byPos.get(key).push(m);
    });

    const spiderfied = new Map(); // posKey -> { legs, origPositions }

    function unspiderfy() {
      spiderfied.forEach(({ legs, origPositions, pulledFromClusterer }, key) => {
        const markers = byPos.get(key) || [];
        markers.forEach((m, i) => {
          if (origPositions[i]) m.setPosition(origPositions[i]);
          if (pulledFromClusterer) m.setMap(null); // return control to clusterer
        });
        legs.forEach((l) => l.setMap(null));
        // Re-add to clusterer so it reclusters them at original positions.
        if (pulledFromClusterer && clustererRef.current) {
          clustererRef.current.addMarkers(markers);
        }
      });
      spiderfied.clear();
    }

    function spiderfyGroup(posKey, centerLatLng) {
      if (spiderfied.has(posKey)) return;
      unspiderfy();
      const markers = byPos.get(posKey) || [];
      if (markers.length < 2) return;
      const origPositions = markers.map((m) => m.getPosition());
      const legs = [];
      const count = markers.length;
      const SPREAD_DEG = 0.00006 + count * 0.000008;

      // If markers are currently managed by the clusterer (map=null), pull them out
      // so we can show them directly on the map as spread pins.
      const pulledFromClusterer = !!(clustererRef.current && markers[0]?.getMap() === null);
      if (pulledFromClusterer) {
        clustererRef.current.removeMarkers(markers);
      }

      markers.forEach((m, i) => {
        const angle = (2 * Math.PI * i) / count - Math.PI / 2;
        const spreadLat = centerLatLng.lat() + SPREAD_DEG * Math.cos(angle);
        const spreadLng = centerLatLng.lng() + SPREAD_DEG * Math.sin(angle) / Math.cos((centerLatLng.lat() * Math.PI) / 180);
        const spreadPos = new window.google.maps.LatLng(spreadLat, spreadLng);
        m.setPosition(spreadPos);
        m.setMap(map); // show individually on the map
        legs.push(new window.google.maps.Polyline({
          path: [centerLatLng, spreadPos],
          strokeColor: "#888",
          strokeOpacity: 0.5,
          strokeWeight: 1.5,
          map,
        }));
      });
      spiderfied.set(posKey, { legs, origPositions, pulledFromClusterer });
    }

    // Add click listeners, clearing any stale ones first.
    markerList.forEach((m) => {
      window.google.maps.event.clearListeners(m, "click");
      m.addListener("click", () => {
        const posKey = m._posKey; // always the original position key
        const group = byPos.get(posKey) || [];

        if (group.length > 1 && !spiderfied.has(posKey)) {
          // Stack detected — fan out instead of selecting
          const [lat, lng] = posKey.split(",").map(Number);
          spiderfyGroup(posKey, new window.google.maps.LatLng(lat, lng));
          return;
        }

        // Solo pin or already spread — open the listing
        unspiderfy();
        const p = m._listing;
        if (!p) return;
        const pos = m.getPosition();
        if (!pos) return;
        map.setCenter(pos);
        map.setZoom(selectZoom);
        if (selectPanOffsetX) map.panBy(selectPanOffsetX, 0);
        if (!onSelect) return;
        const pixel = latLngToMapDivPixel(map, pos.lat(), pos.lng());
        if (pixel) onSelect(p, pixel);
        else onSelect(p, null);
      });
    });

    const mapClickListener = map.addListener("click", unspiderfy);
    const zoomListener = map.addListener("zoom_changed", unspiderfy);
    omsRef.current = {
      cleanup: () => {
        unspiderfy();
        window.google.maps.event.removeListener(mapClickListener);
        window.google.maps.event.removeListener(zoomListener);
      },
    };

    if (enableClustering && markerList.length > 0) {
      const algorithm = new SuperClusterAlgorithm({
        radius: Math.max(20, Math.min(200, Number(clusterRadius) || 80)),
        maxZoom: 20,
      });
      const clusterColorHex = clusterColor || "#4A9BAA";
      const renderer = {
        render: (cluster, _stats, _map) => {
          const count = cluster.count;
          const position = cluster.position;
          return new window.google.maps.Marker({
            position,
            icon: {
              url: clusterIconDataUrl(clusterColorHex, clusterOpacity),
              scaledSize: new window.google.maps.Size(45, 45),
              anchor: new window.google.maps.Point(22, 22),
            },
            label: {
              text: String(count),
              color: "rgba(255,255,255,0.95)",
              fontSize: "13px",
              fontWeight: "bold",
            },
            zIndex: 3000 + count, // above individual pins (zIndex 2000) so cluster clicks register correctly
          });
        },
      };
      clustererRef.current = new MarkerClusterer({
        map,
        markers: markerList,
        algorithm,
        renderer,
        onClusterClick: (_event, cluster, m) => {
          const targetMap = m || map;
          const currentZoom = targetMap.getZoom() ?? zoom ?? 10;
          const clusterMarkers = cluster.markers || [];
          // Same-address cluster: fan out at zoom 17+, else zoom to 17 and auto-fan on idle.
          if (clusterMarkers.length > 1) {
            const firstKey = clusterMarkers[0]?._posKey;
            if (firstKey && clusterMarkers.every((mk) => mk._posKey === firstKey)) {
              const [lat, lng] = firstKey.split(",").map(Number);
              const center = new window.google.maps.LatLng(lat, lng);
              if (currentZoom >= 17) {
                spiderfyGroup(firstKey, center);
              } else {
                targetMap.panTo(cluster.position);
                targetMap.setZoom(17);
                // Auto-fan once the zoom animation completes.
                const idleListener = targetMap.addListener("idle", () => {
                  window.google.maps.event.removeListener(idleListener);
                  spiderfyGroup(firstKey, center);
                });
              }
              return;
            }
          }
          // Mixed-address cluster — zoom in normally.
          const nextZoom = Math.min(currentZoom + 3, 20);
          targetMap.panTo(cluster.position);
          targetMap.setZoom(nextZoom);
        },
      });
    } else {
      markerList.forEach((marker) => marker.setMap(map));
    }

    return () => { omsRef.current?.cleanup?.(); };
  }, [
    mapReady,
    points,
    onSelect,
    markerStyle,
    customMarkerIconUrl,
    defaultMarkerColor,
    enableClustering,
    clusterRadius,
    clusterColor,
    clusterOpacity,
    pinBorderColor,
    pinBorderSize,
    pinFaviconUrl,
    pinDropShadow,
    pinShadowDistance,
    pinShadowOpacity,
    pinSize,
    selectZoom,
    selectPanOffsetX,
  ]);

  useEffect(() => {
    if (!mapReady || !showZoomIndicator || !mapRef.current || !window.google?.maps) return;
    const map = mapRef.current;
    setCurrentZoomDisplay(map.getZoom() ?? null);
    const listener = map.addListener("zoom_changed", () => setCurrentZoomDisplay(map.getZoom() ?? null));
    return () => window.google.maps.event.removeListener(listener);
  }, [mapReady, showZoomIndicator]);

  return (
    <div style={{ position: "relative", width: "100%", height }}>
      <div ref={elRef} style={{ width: "100%", height, borderRadius: 12 }} />
      {showZoomIndicator && currentZoomDisplay != null && (
        <div style={{
          position: "absolute",
          bottom: 8,
          left: 8,
          background: "rgba(0,0,0,0.55)",
          color: "#fff",
          fontSize: 12,
          fontFamily: "monospace",
          padding: "2px 7px",
          borderRadius: 4,
          pointerEvents: "none",
          zIndex: 10,
          userSelect: "none",
        }}>
          zoom {currentZoomDisplay}
        </div>
      )}
    </div>
  );
}

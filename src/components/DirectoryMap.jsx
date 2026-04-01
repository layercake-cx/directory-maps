import { useEffect, useMemo, useRef, useState } from "react";
import { MarkerClusterer, SuperClusterAlgorithm } from "@googlemaps/markerclusterer";
import { loadGoogleMaps } from "../lib/loadGoogleMaps";
import { getMarkerIconUrl, getScaledMarkerAnchors, normalizePinSize } from "../lib/markerIcons";

function clusterIconDataUrl(color) {
  const fill = color || "#4A9BAA";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="20" fill="${fill}" opacity="0.85" stroke="white" stroke-width="2"/>
      <circle cx="24" cy="24" r="14" fill="${fill}" opacity="0.5"/>
    </svg>
  `.trim();
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

const MAP_TYPE_IDS = ["roadmap", "satellite", "hybrid", "terrain"];
const CUSTOM_ROADMAP_IDS = ["roadmap_silver", "roadmap_dark", "roadmap_muted"];

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

function registerCustomMapTypes(map) {
  if (!window.google?.maps?.StyledMapType) return;
  if (map.mapTypes.get("roadmap_silver")) return;
  const silver = new window.google.maps.StyledMapType(ROADMAP_SILVER_STYLES, { name: "Roadmap (Silver)" });
  const dark = new window.google.maps.StyledMapType(ROADMAP_DARK_STYLES, { name: "Roadmap (Dark)" });
  const muted = new window.google.maps.StyledMapType(ROADMAP_MUTED_STYLES, { name: "Roadmap (Muted)" });
  map.mapTypes.set("roadmap_silver", silver);
  map.mapTypes.set("roadmap_dark", dark);
  map.mapTypes.set("roadmap_muted", muted);
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
  pinBorderColor = "#ffffff",
  pinBorderSize = 0,
  pinFaviconUrl = null,
  /** small | medium | large — medium matches historical default marker scale */
  pinSize = "medium",
  /** When set (e.g. listing detail panel open), keep updating screen position on pan/zoom */
  screenOverlayListing = null,
  onScreenOverlayPosition,
}) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map()); // id -> marker
  const clustererRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

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
    map.setZoom(12);

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
          fullscreenControl: true,
          fullscreenControlOptions: { position: ControlPosition.RIGHT_BOTTOM },
          zoomControl: true,
          zoomControlOptions: { position: ControlPosition.RIGHT_BOTTOM },
          gestureHandling: "greedy",
          scrollwheel: true,
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
        pinSizeForListing,
      );

      let marker = markersRef.current.get(p.id);
      if (marker) {
        marker.setIcon(icon);
        marker.setTitle(p.name);
      } else {
        marker = new window.google.maps.Marker({
          position: { lat: Number(p.lat), lng: Number(p.lng) },
          map: null,
          title: p.name,
          icon,
        });
        marker.addListener("click", () => {
          const pos = marker.getPosition();
          if (!pos) return;
          map.setCenter(pos);
          map.setZoom(12);
          if (!onSelect) return;
          const pixel = latLngToMapDivPixel(map, pos.lat(), pos.lng());
          if (pixel) onSelect(p, pixel);
          else onSelect(p, null);
        });
        markersRef.current.set(p.id, marker);
      }
      markerList.push(marker);
    });

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
              url: clusterIconDataUrl(clusterColorHex),
              scaledSize: new window.google.maps.Size(45, 45),
              anchor: new window.google.maps.Point(22, 22),
            },
            label: {
              text: String(count),
              color: "rgba(255,255,255,0.95)",
              fontSize: "13px",
              fontWeight: "bold",
            },
            zIndex: 1000 + count,
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
          const pos = cluster.position;
          const currentZoom = targetMap.getZoom() ?? zoom ?? 10;
          const nextZoom = Math.min(currentZoom + 2, 18);
          targetMap.panTo(pos);
          targetMap.setZoom(nextZoom);
        },
      });
    } else {
      markerList.forEach((marker) => marker.setMap(map));
    }
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
    pinBorderColor,
    pinBorderSize,
    pinFaviconUrl,
    pinSize,
  ]);

  return <div ref={elRef} style={{ width: "100%", height, borderRadius: 12 }} />;
}

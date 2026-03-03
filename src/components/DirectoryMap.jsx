import { useEffect, useMemo, useRef, useState } from "react";
import { loadGoogleMaps } from "../lib/loadGoogleMaps";

function pinSvgDataUrl(color) {
  const fill = color || "#4A9BAA";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="46" viewBox="0 0 32 46">
      <path d="M16 0C7.7 0 1 6.7 1 15c0 11.6 15 31 15 31s15-19.4 15-31C31 6.7 24.3 0 16 0z" fill="${fill}"/>
      <circle cx="16" cy="15" r="6" fill="white" fill-opacity="0.9"/>
    </svg>
  `.trim();

  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

export default function DirectoryMap({
  apiKey,
  center,
  zoom,
  listings,
  onSelect,
  defaultMarkerColor = "#4A9BAA",
}) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map()); // id -> marker
  const [mapReady, setMapReady] = useState(false);

  const points = useMemo(
    () => (listings || []).filter((l) => l.lat != null && l.lng != null),
    [listings]
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      await loadGoogleMaps(apiKey);
      if (cancelled) return;

      if (!mapRef.current) {
        mapRef.current = new window.google.maps.Map(elRef.current, {
          center,
          zoom,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });
      } else {
        mapRef.current.setCenter(center);
        mapRef.current.setZoom(zoom);
      }

      setMapReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [apiKey, center, zoom]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.google?.maps) return;

    const keepIds = new Set(points.map((p) => p.id));

    for (const [id, marker] of markersRef.current.entries()) {
      if (!keepIds.has(id)) {
        marker.setMap(null);
        markersRef.current.delete(id);
      }
    }

    points.forEach((p) => {
      if (markersRef.current.has(p.id)) return;

      const color = p.group_color || defaultMarkerColor;
const marker = new window.google.maps.Marker({
  position: { lat: Number(p.lat), lng: Number(p.lng) },
  map: mapRef.current,
  title: p.name,
  icon: {
    url: pinSvgDataUrl(color),
    scaledSize: new window.google.maps.Size(28, 40),
    anchor: new window.google.maps.Point(14, 40),
  },
});

      marker.addListener("click", () => onSelect?.(p));
      markersRef.current.set(p.id, marker);
    });
  }, [mapReady, points, onSelect]);

  return <div ref={elRef} style={{ width: "100%", height: "75vh", borderRadius: 12 }} />;
}
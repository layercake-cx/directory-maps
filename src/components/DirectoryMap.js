import { useEffect, useMemo, useRef } from "react";
import { loadGoogleMaps } from "../lib/loadGoogleMaps";

export default function DirectoryMap({ apiKey, center, zoom, listings, onSelect }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map()); // id -> marker

  const points = useMemo(
    () => (listings || []).filter((l) => l.lat != null && l.lng != null),
    [listings]
  );

  // init map
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
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiKey, center, zoom]);

  // sync markers with points
  useEffect(() => {
    if (!mapRef.current || !window.google?.maps) return;

    // remove markers that are no longer present
    const keepIds = new Set(points.map((p) => p.id));
    for (const [id, marker] of markersRef.current.entries()) {
      if (!keepIds.has(id)) {
        marker.setMap(null);
        markersRef.current.delete(id);
      }
    }

    // add/update markers
    points.forEach((p) => {
      if (markersRef.current.has(p.id)) return;

      const marker = new window.google.maps.Marker({
        position: { lat: Number(p.lat), lng: Number(p.lng) },
        map: mapRef.current,
        title: p.name,
      });

      marker.addListener("click", () => onSelect?.(p));
      markersRef.current.set(p.id, marker);
    });
  }, [points, onSelect]);

  return <div ref={elRef} style={{ width: "100%", height: "75vh", borderRadius: 12 }} />;
}
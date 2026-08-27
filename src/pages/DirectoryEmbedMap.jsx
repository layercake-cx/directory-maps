import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import DirectoryMap from "../components/DirectoryMap.jsx";

/**
 * Pins-only map embed for a Directory's homepage "Explore" section
 * (generate_directory_site's <iframe src="/directory-embed?src=...">).
 * Fetches a static entries.json blob URL (passed in full, since directory
 * pages don't have a stable id to look up by the way maps do) rather than
 * querying Supabase directly — directory_entries has no anon-select RLS
 * policy, and this mirrors EmbedMap.jsx's own snapshot.json fetch pattern
 * instead of adding a new one. Default map chrome only; the bespoke
 * floating AI/filter-panel treatment from the design canvas is a later,
 * separate phase (see docs/DEPLOYMENTS.md's DIR-E3 visual-rebuild entry).
 */
export default function DirectoryEmbedMap() {
  const [params] = useSearchParams();
  const src = params.get("src");
  const [listings, setListings] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!src) {
      setErr("Missing src parameter.");
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    fetch(src, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setListings(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        if (!cancelled) setErr(e?.message ?? String(e));
      })
      .finally(() => clearTimeout(timer));
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [src]);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return <div style={{ padding: 16 }}>Missing VITE_GOOGLE_MAPS_API_KEY</div>;
  if (err) return <div style={{ padding: 16 }}>{err}</div>;
  if (!listings) return null;

  const points = listings.filter((l) => l.lat != null && l.lng != null);
  const center =
    points.length > 0
      ? { lat: points.reduce((s, p) => s + Number(p.lat), 0) / points.length, lng: points.reduce((s, p) => s + Number(p.lng), 0) / points.length }
      : { lat: 0, lng: 0 };

  return (
    <DirectoryMap
      apiKey={apiKey}
      center={center}
      zoom={points.length > 0 ? 6 : 2}
      listings={listings}
      onSelect={() => {}}
      height="100vh"
    />
  );
}

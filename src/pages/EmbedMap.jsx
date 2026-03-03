import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import DirectoryMap from "../components/DirectoryMap.jsx";

export default function EmbedMap() {
  const [params] = useSearchParams();
  const mapId = params.get("map");

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [map, setMap] = useState(null);
  const [listings, setListings] = useState([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr("");

        if (!mapId) {
          setErr("Missing map parameter. Use /#/embed?map=<MAP_ID>");
          return;
        }

        // 1) Load map config
        const { data: m, error: mErr } = await supabase
          .from("maps")
          .select("id,name,default_lat,default_lng,default_zoom,show_list_panel,enable_clustering")
          .eq("id", mapId)
          .single();

        if (mErr) throw mErr;

        // 2) Load listings for this map (public view is ideal)
        const { data: l, error: lErr } = await supabase
          .from("public_listings") // if you didn't create this view, use "listings" with RLS
          .select("*")
          .eq("map_id", mapId);

        if (lErr) throw lErr;

        if (!cancelled) {
          setMap(m);
          setListings(l ?? []);
        }
      } catch (e) {
        if (!cancelled) setErr(e.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mapId]);

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (err) return <div style={{ padding: 16 }}>{err}</div>;
  if (!map) return <div style={{ padding: 16 }}>Map not found.</div>;
  if (!apiKey) return <div style={{ padding: 16 }}>Missing VITE_GOOGLE_MAPS_API_KEY</div>;

  return (
    <div style={{ width: "100%", height: "100vh" }}>
      <DirectoryMap
        apiKey={apiKey}
        center={{ lat: Number(map.default_lat), lng: Number(map.default_lng) }}
        zoom={Number(map.default_zoom)}
        listings={listings}
        defaultMarkerColor={map.marker_color || "#4A9BAA"}
        onSelect={(l) => setSelected(l)}
      />
    </div>
  );
}
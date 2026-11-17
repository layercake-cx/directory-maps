import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import EmbedMap from "./EmbedMap.jsx";
import MapUnavailable from "../components/MapUnavailable.jsx";
import { fetchEntityStatusBySlug } from "../lib/archive.js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL ?? "https://placeholder.supabase.co",
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? "placeholder-key",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);

export default function SlugMap() {
  const { clientSlug, mapSlug } = useParams();
  const [mapId, setMapId] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_map_id_by_slugs", {
        p_client_slug: clientSlug,
        p_map_slug: mapSlug,
      });

      if (cancelled) return;
      if (error || !data) {
        // RLS hides archived maps from the public, so distinguish "taken down" from "never existed".
        const status = await fetchEntityStatusBySlug("map", clientSlug, mapSlug);
        if (cancelled) return;
        if (status === "archived") setUnavailable(true);
        else setNotFound(true);
      } else {
        setMapId(data);
      }
    })();
    return () => { cancelled = true; };
  }, [clientSlug, mapSlug]);

  if (unavailable) return <MapUnavailable />;
  if (notFound) return <div style={{ padding: 16 }}>Map not found.</div>;
  if (!mapId) return <div style={{ padding: 16 }}>Loading…</div>;

  return <EmbedMap mapId={mapId} />;
}

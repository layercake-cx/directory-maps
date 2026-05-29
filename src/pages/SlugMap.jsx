import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import EmbedMap from "./EmbedMap.jsx";

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_map_id_by_slugs", {
        p_client_slug: clientSlug,
        p_map_slug: mapSlug,
      });

      if (cancelled) return;
      if (error || !data) {
        setNotFound(true);
      } else {
        setMapId(data);
      }
    })();
    return () => { cancelled = true; };
  }, [clientSlug, mapSlug]);

  if (notFound) return <div style={{ padding: 16 }}>Map not found.</div>;
  if (!mapId) return <div style={{ padding: 16 }}>Loading…</div>;

  return <EmbedMap mapId={mapId} />;
}

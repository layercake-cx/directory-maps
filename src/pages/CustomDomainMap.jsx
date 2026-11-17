import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import EmbedMap from "./EmbedMap.jsx";
import MapUnavailable from "../components/MapUnavailable.jsx";
import { fetchEntityStatus } from "../lib/archive.js";

/**
 * Serves the interactive map at /map on a client's verified custom domain.
 * Resolves which map to show from the request hostname (client_domains),
 * then renders the same embeddable view /embed?map=<id> already provides —
 * this is deliberately the same component, just resolved by domain instead
 * of a query param, so the URL also works as a legitimate iframe source.
 *
 * middleware.js only lets requests to /map through to the SPA on an active,
 * resolvable custom domain (anything else gets a "domain not configured"
 * response before reaching this component) — the lookup here is a second,
 * independent resolution, not a trust of the middleware's decision.
 */
export default function CustomDomainMap() {
  const [mapId, setMapId] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("client_domains")
        .select("map_id")
        .ilike("hostname", window.location.hostname)
        .eq("status", "active")
        .maybeSingle();
      if (cancelled) return;
      if (data?.map_id) {
        if ((await fetchEntityStatus("map", data.map_id)) === "archived") {
          if (!cancelled) setUnavailable(true);
          return;
        }
        if (!cancelled) setMapId(data.map_id);
      } else setNotFound(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (unavailable) return <MapUnavailable />;

  if (notFound) {
    return (
      <div style={{ fontFamily: "sans-serif", padding: 60, textAlign: "center", color: "#444" }}>
        <h1>Domain not configured</h1>
        <p>This domain isn&apos;t connected to a Layercake Maps directory.</p>
      </div>
    );
  }

  if (!mapId) return null;

  return <EmbedMap mapId={mapId} />;
}

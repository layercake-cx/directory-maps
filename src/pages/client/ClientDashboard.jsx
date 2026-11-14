import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useClient } from "../../hooks/useClient.js";
import { Callout } from "../../components/ui/index.js";
import MapsView from "./MapsView.jsx";
import "../../styles/wave-b/map-pages.css";

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

export default function ClientDashboard() {
  const { client } = useClient();
  const [maps, setMaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [failedSyncs, setFailedSyncs] = useState([]);

  useEffect(() => {
    if (!client?.id) return;

    (async () => {
      try {
        setLoading(true);
        setErr("");

        const [{ data: ms, error: mErr }, { data: fs }] = await Promise.all([
          supabase
            .from("maps")
            .select("id,name,slug,updated_at,default_lat,default_lng,default_zoom,published_at,map_data_sources(provider,spreadsheet_id,sheet_name),listings(count)")
            .eq("client_id", client.id)
            .order("updated_at", { ascending: false }),
          supabase
            .from("sync_logs")
            .select("map_id, started_at, error_message, maps(name)")
            .eq("client_id", client.id)
            .eq("status", "error")
            .order("started_at", { ascending: false }),
        ]);

        if (mErr) throw mErr;
        setMaps(ms ?? []);

        // Deduplicate to most recent failure per map_id (first occurrence since ordered desc)
        const seen = new Set();
        const deduped = (fs ?? []).filter((r) => {
          if (seen.has(r.map_id)) return false;
          seen.add(r.map_id);
          return true;
        });
        setFailedSyncs(deduped);
      } catch (e) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [client?.id]);

  const syncNotice = failedSyncs.length > 0 ? (
    <Callout tone="danger" title="Sync errors detected">
      <ul className="mp-list-plain">
        {failedSyncs.map((f) => (
          <li key={f.map_id}>
            <strong>{f.maps?.name ?? f.map_id}</strong> — last failed {relativeTime(f.started_at)}.{" "}
            <Link to={`/client/maps/${encodeURIComponent(f.map_id)}/data`}>View sync history →</Link>
          </li>
        ))}
      </ul>
    </Callout>
  ) : null;

  return (
    <MapsView
      maps={maps}
      workspaceName={client?.name}
      loading={loading}
      error={err}
      notice={syncNotice}
    />
  );
}

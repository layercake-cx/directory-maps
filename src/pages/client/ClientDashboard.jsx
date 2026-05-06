import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useClient } from "../../hooks/useClient.js";
import MapsView from "./MapsView.jsx";

export default function ClientDashboard() {
  const { client } = useClient();
  const [maps, setMaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!client?.id) return;

    (async () => {
      try {
        setLoading(true);
        setErr("");

        const { data: ms, error: mErr } = await supabase
          .from("maps")
          .select("id,name,slug,updated_at,default_lat,default_lng,default_zoom,published_at,map_data_sources(provider,spreadsheet_id,sheet_name),listings(count)")
          .eq("client_id", client.id)
          .order("updated_at", { ascending: false });

        if (mErr) throw mErr;
        setMaps(ms ?? []);
      } catch (e) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [client?.id]);

  return (
    <MapsView
      maps={maps}
      workspaceName={client?.name}
      loading={loading}
      error={err}
    />
  );
}

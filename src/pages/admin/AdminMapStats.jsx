import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { signOut } from "../../lib/auth";
import AdminLayout from "./AdminLayout.jsx";
import MapStats from "../client/MapStats.jsx";

export default function AdminMapStats() {
  const { clientId, mapId } = useParams();
  const [client, setClient] = useState(null);
  const [map, setMap] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: c }, { data: m }] = await Promise.all([
        supabase.from("clients").select("id,name").eq("id", clientId).maybeSingle(),
        supabase.from("maps").select("id,name,client_id").eq("id", mapId).maybeSingle(),
      ]);
      if (!cancelled) {
        setClient(c ?? null);
        setMap(m ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, mapId]);

  const mapPath = `/admin/clients/${encodeURIComponent(clientId)}/maps/${encodeURIComponent(mapId)}`;

  return (
    <AdminLayout
      breadcrumbs={[
        { label: "Customers", path: "/admin/clients" },
        { label: client?.name ?? "…", path: `/admin/clients/${encodeURIComponent(clientId)}` },
        { label: map?.name ?? "Map", path: mapPath },
        { label: "Stats" },
      ]}
      rightActions={
        <button onClick={signOut} type="button">
          Sign out
        </button>
      }
    >
      <MapStats />
    </AdminLayout>
  );
}

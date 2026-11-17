import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { fetchMapsForList } from "../../lib/mapsList.js";
import AdminLayout from "./AdminLayout.jsx";
import { Button } from "../../components/ui/index.js";
import MapsList from "../../components/maps/MapsList.jsx";

/** Platform › All maps: the shared maps list with a Customer column, across every customer. */
export default function AdminMaps() {
  const [maps, setMaps] = useState([]);
  const [clientsById, setClientsById] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    try {
      setLoading(true);
      setErr("");
      const [mapRows, { data: clientsData, error: clientsError }] = await Promise.all([
        fetchMapsForList(),
        supabase.from("clients").select("id, name, slug").order("name", { ascending: true }),
      ]);
      if (clientsError) throw clientsError;
      setMaps(mapRows);
      setClientsById(Object.fromEntries((clientsData ?? []).map((c) => [c.id, c])));
    } catch (e) {
      setErr(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <AdminLayout>
      <MapsList
        head={{ title: "Maps", subtitle: "Every map across all customers.", actions: <Button onClick={load}>Refresh</Button> }}
        maps={maps}
        clientsById={clientsById}
        showCustomer
        // A map without a customer has no admin route to open.
        mapHref={(m) => (m.client_id ? `/admin/clients/${encodeURIComponent(m.client_id)}/maps/${encodeURIComponent(m.id)}` : "#")}
        loading={loading}
        error={err}
      />
    </AdminLayout>
  );
}

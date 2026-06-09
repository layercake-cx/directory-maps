import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { signOut } from "../../lib/auth";
import AdminLayout from "./AdminLayout.jsx";
import ListingStats from "../client/ListingStats.jsx";

export default function AdminListingStats() {
  const { clientId, mapId, listingId } = useParams();
  const [client, setClient] = useState(null);
  const [map, setMap] = useState(null);
  const [listing, setListing] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: c }, { data: m }, { data: l }] = await Promise.all([
        supabase.from("clients").select("id,name").eq("id", clientId).maybeSingle(),
        supabase.from("maps").select("id,name,client_id").eq("id", mapId).maybeSingle(),
        supabase.from("listings").select("id,name").eq("id", listingId).maybeSingle(),
      ]);
      if (!cancelled) {
        setClient(c ?? null);
        setMap(m ?? null);
        setListing(l ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, mapId, listingId]);

  const mapPath = `/admin/clients/${encodeURIComponent(clientId)}/maps/${encodeURIComponent(mapId)}`;
  const statsPath = `${mapPath}/stats`;

  return (
    <AdminLayout
      breadcrumbs={[
        { label: "Customers", path: "/admin/clients" },
        { label: client?.name ?? "…", path: `/admin/clients/${encodeURIComponent(clientId)}` },
        { label: map?.name ?? "Map", path: mapPath },
        { label: "Stats", path: statsPath },
        { label: listing?.name ?? "Listing" },
      ]}
      rightActions={
        <button onClick={signOut} type="button">
          Sign out
        </button>
      }
    >
      <ListingStats />
    </AdminLayout>
  );
}

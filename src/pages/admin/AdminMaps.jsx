import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import AdminLayout from "./AdminLayout.jsx";
import { Button, Callout, DataTable, EmptyState, Field, PageLayout, Section, TextInput, Toolbar } from "../../components/ui/index.js";
import "../../styles/wave-b/map-pages.css";

export default function AdminMaps() {
  const [maps, setMaps] = useState([]);
  const [clientsById, setClientsById] = useState({});
  const [listingCountByMapId, setListingCountByMapId] = useState({});
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    try {
      setLoading(true);
      setErr("");

      const [
        { data: mapsData, error: mapsError },
        { data: clientsData, error: clientsError },
        { data: listingsData, error: listingsError },
      ] = await Promise.all([
        supabase
          .from("maps")
          .select("id, name, slug, client_id, default_lat, default_lng, default_zoom")
          .order("name", { ascending: true }),
        supabase
          .from("clients")
          .select("id, name, slug")
          .order("name", { ascending: true }),
        supabase.from("listings").select("map_id"),
      ]);

      if (mapsError) throw mapsError;
      if (clientsError) throw clientsError;
      if (listingsError) throw listingsError;

      const byId = {};
      (clientsData ?? []).forEach((c) => {
        byId[c.id] = c;
      });

      const countByMapId = {};
      (listingsData ?? []).forEach((row) => {
        if (row.map_id) countByMapId[row.map_id] = (countByMapId[row.map_id] ?? 0) + 1;
      });

      setMaps(mapsData ?? []);
      setClientsById(byId);
      setListingCountByMapId(countByMapId);
    } catch (e) {
      setErr(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const query = (q || "").trim().toLowerCase();
    if (!query) return maps;

    return maps.filter((m) => {
      const client = clientsById[m.client_id];
      const mapName = (m.name ?? "").toLowerCase();
      const mapSlug = (m.slug ?? "").toLowerCase();
      const clientName = (client?.name ?? "").toLowerCase();
      const clientSlug = (client?.slug ?? "").toLowerCase();
      return (
        mapName.includes(query) ||
        mapSlug.includes(query) ||
        clientName.includes(query) ||
        clientSlug.includes(query) ||
        (m.id ?? "").toLowerCase().includes(query)
      );
    });
  }, [maps, clientsById, q]);

  const columns = [
    {
      key: "name",
      label: "Map name",
      render: (m) => {
        const adminMapUrl = m.client_id
          ? `/admin/clients/${encodeURIComponent(m.client_id)}/maps/${encodeURIComponent(m.id)}`
          : null;
        return (
          <>
            {adminMapUrl ? (
              <Link to={adminMapUrl} className="row-link">{m.name ?? "—"}</Link>
            ) : (
              <strong>{m.name ?? "—"}</strong>
            )}
            {m.slug ? <span className="mp-cell-sub">{m.slug}</span> : null}
          </>
        );
      },
    },
    {
      key: "customer",
      label: "Customer",
      render: (m) => {
        const client = clientsById[m.client_id];
        return client ? <Link to={`/admin/clients/${encodeURIComponent(m.client_id)}`}>{client.name}</Link> : "—";
      },
    },
    { key: "listings", label: "Listings", className: "mp-num", align: "right", render: (m) => listingCountByMapId[m.id] ?? 0 },
    {
      key: "launch",
      label: "Launch map",
      align: "right",
      render: (m) => {
        const client = clientsById[m.client_id];
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const launchUrl =
          client?.slug && m.slug
            ? `${origin}/${client.slug}/${m.slug}`
            : `${origin}/embed?map=${encodeURIComponent(m.id)}`;
        return (
          <Button as="a" size="sm" href={launchUrl} target="_blank" rel="noopener noreferrer">
            Launch map
          </Button>
        );
      },
    },
  ];

  return (
    <AdminLayout>
      <PageLayout head={{ title: "Maps" }}>
        <div className="mp-stack">
          {err ? <Callout tone="danger">{err}</Callout> : null}

          <Section>
            <div className="mp-stack">
              <Toolbar>
                <Field label="Search" className="mp-grow">
                  <TextInput
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search by map name or customer name…"
                  />
                </Field>
                <Button onClick={load}>Refresh</Button>
              </Toolbar>

              <DataTable
                columns={columns}
                rows={filtered}
                getRowId={(m) => m.id}
                getRowLabel={(m) => m.name ?? "Map"}
                loading={loading}
                caption="Maps"
                empty={
                  maps.length === 0 ? (
                    <EmptyState art="welcome" title="No maps yet" body="Maps created for customers will appear here." />
                  ) : (
                    <EmptyState art="searching" title="No maps match your search" body="Try a different search." />
                  )
                }
              />
            </div>
          </Section>
        </div>
      </PageLayout>
    </AdminLayout>
  );
}

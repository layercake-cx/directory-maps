import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { signOut } from "../../lib/auth";
import { deleteMap as deleteMapRpc } from "../../lib/maps.js";
import { recordAdminEvent } from "../../lib/adminEvents.js";
import ConfirmDeleteModal, { TrashIcon } from "../../components/ConfirmDeleteModal.jsx";
import AdminLayout from "./AdminLayout.jsx";

export default function AdminMaps() {
  const [maps, setMaps] = useState([]);
  const [clientsById, setClientsById] = useState({});
  const [listingCountByMapId, setListingCountByMapId] = useState({});
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [mapToDelete, setMapToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");

  async function confirmDeleteMap() {
    if (!mapToDelete) return;
    try {
      setDeleting(true);
      setDeleteErr("");
      await deleteMapRpc(mapToDelete.id);
      recordAdminEvent(supabase, {
        eventType: "map_design_deleted",
        source: "admin_maps",
        clientId: mapToDelete.client_id ?? null,
        mapId: mapToDelete.id,
        meta: {
          client_id: mapToDelete.client_id ?? null,
          map_id: mapToDelete.id,
          name: mapToDelete.name ?? null,
          slug: mapToDelete.slug ?? null,
          actor_admin_scope: "platform_admin",
        },
      });
      setMapToDelete(null);
      await load();
    } catch (e) {
      setDeleteErr(e.message ?? String(e));
    } finally {
      setDeleting(false);
    }
  }

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

  return (
    <AdminLayout
      breadcrumbs={[{ label: "Maps" }]}
      rightActions={
        <button onClick={signOut} type="button">
          Sign out
        </button>
      }
    >
      <div className="admin-card">
        <div className="admin-controls">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by map name or customer name…"
          />
          <button className="btn" onClick={load} type="button">
            Refresh
          </button>
        </div>

        {loading ? <p style={{ marginTop: 12 }}>Loading…</p> : null}
        {err ? <p style={{ marginTop: 12 }}>{err}</p> : null}

        <table className="admin-table">
          <thead>
            <tr>
              <th>Map name</th>
              <th>Customer</th>
              <th>Listings</th>
              <th>Settings</th>
              <th style={{ textAlign: "right" }}>Launch map</th>
              <th style={{ width: 44 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => {
              const client = clientsById[m.client_id];
              const adminMapUrl = m.client_id
                ? `/admin/clients/${encodeURIComponent(m.client_id)}/maps/${encodeURIComponent(m.id)}`
                : null;
              const origin = typeof window !== "undefined" ? window.location.origin : "";
              const launchUrl =
                client?.slug && m.slug
                  ? `${origin}/${client.slug}/${m.slug}`
                  : `${origin}/embed?map=${encodeURIComponent(m.id)}`;
              const listingCount = listingCountByMapId[m.id] ?? 0;
              return (
                <tr key={m.id}>
                  <td>
                    {adminMapUrl ? (
                      <Link to={adminMapUrl} style={{ fontWeight: 600, textDecoration: "none" }}>
                        {m.name ?? "—"}
                      </Link>
                    ) : (
                      <strong>{m.name ?? "—"}</strong>
                    )}
                    {m.slug ? (
                      <span style={{ fontSize: 12, opacity: 0.8, display: "block" }}>{m.slug}</span>
                    ) : null}
                  </td>
                  <td>
                    {client ? (
                      <Link to={`/admin/clients/${encodeURIComponent(m.client_id)}`}>
                        {client.name}
                      </Link>
                    ) : (
                      <span style={{ opacity: 0.6 }}>—</span>
                    )}
                  </td>
                  <td>{listingCount}</td>
                  <td>
                    {adminMapUrl ? (
                      <Link className="btn" to={adminMapUrl}>
                        Open
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <a
                      className="btn"
                      href={launchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Launch map
                    </a>
                  </td>
                  <td style={{ width: 44, textAlign: "right" }}>
                    <button
                      type="button"
                      className="admin-table__delete-btn"
                      onClick={() => { setDeleteErr(""); setMapToDelete({ id: m.id, name: m.name, slug: m.slug, client_id: m.client_id }); }}
                      title="Delete map"
                      aria-label={`Delete map ${m.name ?? m.id}`}
                    >
                      {TrashIcon}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!loading && !err && filtered.length === 0 ? (
          <p style={{ marginTop: 12, color: "var(--lc-muted)" }}>
            {maps.length === 0 ? "No maps yet." : "No maps match your search."}
          </p>
        ) : null}
      </div>

      <ConfirmDeleteModal
        open={!!mapToDelete}
        title="Delete map"
        message={
          <>
            Permanently delete <strong>{mapToDelete?.name || "this map"}</strong> and all of its listings,
            groups, publications and stats? This cannot be undone.
          </>
        }
        confirmWord="DELETE"
        confirmLabel="Delete map"
        busy={deleting}
        error={deleteErr}
        onConfirm={confirmDeleteMap}
        onCancel={() => setMapToDelete(null)}
      />
    </AdminLayout>
  );
}

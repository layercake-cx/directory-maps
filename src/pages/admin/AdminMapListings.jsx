import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { signOut } from "../../lib/auth";
import AdminLayout from "./AdminLayout.jsx";

export default function AdminMapListings() {
  const { clientId, mapId } = useParams();

  const [map, setMap] = useState(null);
  const [groups, setGroups] = useState([]);
  const [rows, setRows] = useState([]);

  const [q, setQ] = useState("");
  const [groupId, setGroupId] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    try {
      setLoading(true);
      setErr("");

      const [{ data: m, error: me }, { data: g, error: ge }, { data: l, error: le }] =
        await Promise.all([
          supabase.from("maps").select("id,name,client_id").eq("id", mapId).single(),
          supabase
            .from("groups")
            .select("id,name")
            .eq("map_id", mapId)
            .order("sort_order", { ascending: true }),
          supabase
            .from("listings")
            .select("id,name,postcode,country,lat,lng,group_id,is_active,updated_at")
            .eq("map_id", mapId)
            .order("updated_at", { ascending: false }),
        ]);

      if (me) throw me;
      if (ge) throw ge;
      if (le) throw le;

      // sanity: map belongs to this client
      if (m.client_id !== clientId) {
        throw new Error("This map does not belong to the selected client.");
      }

      setMap(m);
      setGroups(g ?? []);
      setRows(l ?? []);
    } catch (e) {
      setErr(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId]);

  const groupNameById = useMemo(() => {
    const m = new Map();
    groups.forEach((g) => m.set(g.id, g.name));
    return m;
  }, [groups]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    return rows.filter((r) => {
      if (onlyActive && !r.is_active) return false;
      if (groupId && r.group_id !== groupId) return false;

      if (!query) return true;

      const hay = [
        r.name,
        r.postcode,
        r.country,
        r.id,
        groupNameById.get(r.group_id) || "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(query);
    });
  }, [rows, q, groupId, onlyActive, groupNameById]);

  return (
    <AdminLayout
      title={`Admin · ${map?.name ?? "Map"} · Listings`}
      rightActions={
        <button onClick={signOut} type="button">
          Sign out
        </button>
      }
    >
      <div className="admin-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              <Link to={`/admin/clients/${encodeURIComponent(clientId)}/maps/${encodeURIComponent(mapId)}`}>
                ← Back to map dashboard
              </Link>
            </div>
            <h2 style={{ margin: "8px 0 0 0" }}>Listings</h2>
            <div style={{ fontSize: 13, opacity: 0.8, marginTop: 6 }}>
              Showing <strong>{filtered.length}</strong> of <strong>{rows.length}</strong>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn" type="button" onClick={load}>
              Refresh
            </button>

            {/* next: create listing form */}
            <button className="btn btn-primary" type="button" disabled>
              New listing (next)
            </button>
          </div>
        </div>

        <div className="admin-controls" style={{ marginTop: 14 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, postcode, country, group…"
          />

          <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">All groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>

          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, opacity: 0.85 }}>
            <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
            Active only
          </label>
        </div>

        {loading ? <p style={{ marginTop: 12 }}>Loading…</p> : null}
        {err ? <pre style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{err}</pre> : null}

        <table className="admin-table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              {["Name", "Group", "Location", "Coords", "Active", "Updated"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filtered.map((r) => {
              const hasCoords = r.lat != null && r.lng != null;
              return (
                <tr key={r.id}>
                  <td>
                    {/* if you want to reuse your edit page, link it here */}
                    <strong>{r.name}</strong>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>{r.id}</div>
                  </td>

                  <td>{groupNameById.get(r.group_id) || "—"}</td>

                  <td>
                    {(r.postcode || "—") + (r.country ? ` · ${r.country}` : "")}
                  </td>

                  <td>{hasCoords ? "✓" : "—"}</td>

                  <td>{r.is_active ? "Yes" : "No"}</td>

                  <td>{r.updated_at ? new Date(r.updated_at).toLocaleDateString() : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
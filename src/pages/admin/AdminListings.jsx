import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { signOut } from "../../lib/auth";
import AdminLayout from "./AdminLayout.jsx";

export default function AdminListings() {
  const [rows, setRows] = useState([]);
  const [groups, setGroups] = useState([]);

  const [q, setQ] = useState("");
  const [groupId, setGroupId] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    try {
      setLoading(true);
      setErr("");

      const [{ data: g, error: ge }, { data: l, error: le }] = await Promise.all([
        supabase.from("groups").select("id,name,sort_order").order("sort_order", { ascending: true }),
        supabase
          .from("listings")
          .select("id,name,postcode,country,group_id,is_active,updated_at,geocode_status")
          .order("updated_at", { ascending: false })
          .limit(1000),
      ]);

      if (ge) throw ge;
      if (le) throw le;

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
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    return rows.filter((r) => {
      if (activeOnly && !r.is_active) return false;
      if (groupId && r.group_id !== groupId) return false;
      if (!query) return true;

      return (
        (r.name ?? "").toLowerCase().includes(query) ||
        (r.postcode ?? "").toLowerCase().includes(query) ||
        (r.country ?? "").toLowerCase().includes(query) ||
        (r.id ?? "").toLowerCase().includes(query)
      );
    });
  }, [rows, q, groupId, activeOnly]);

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
            placeholder="Search name, postcode, country, id…"
          />

          <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">All groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
            Active only
          </label>

          <button className="btn" onClick={load} type="button">
            Refresh
          </button>

          <Link className="btn btn-primary" to="/admin/listings/new">
            New listing
          </Link>
        </div>

        {loading ? <p style={{ marginTop: 12 }}>Loading…</p> : null}
        {err ? <p style={{ marginTop: 12 }}>{err}</p> : null}

        <table className="admin-table">
          <thead>
            <tr>
              {["Name", "Group", "Active", "Postcode", "Country", "Geocode", "Updated"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link to={`/admin/listings/${encodeURIComponent(r.id)}`}>{r.name}</Link>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{r.id}</div>
                </td>

                <td>{groups.find((g) => g.id === r.group_id)?.name ?? "—"}</td>

                <td>
                  <span className={`badge ${r.is_active ? "" : "badge--off"}`}>{r.is_active ? "Active" : "Off"}</span>
                </td>

                <td>{r.postcode ?? "—"}</td>
                <td>{r.country ?? "—"}</td>
                <td>{r.geocode_status ?? "—"}</td>
                <td>{r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
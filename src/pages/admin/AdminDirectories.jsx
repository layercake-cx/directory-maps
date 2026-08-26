import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { signOut } from "../../lib/auth";
import AdminLayout from "./AdminLayout.jsx";

/**
 * Top-level, cross-client Directories list (DIR-E1 hardening) — mirrors
 * AdminMaps.jsx. Directories were previously only reachable via a per-customer
 * tab in AdminClientDetail.jsx; this gives admin the same "/admin/maps"-style
 * searchable overview for the Directories entity.
 */
export default function AdminDirectories() {
  const [directories, setDirectories] = useState([]);
  const [clientsById, setClientsById] = useState({});
  const [entryCountByDirectoryId, setEntryCountByDirectoryId] = useState({});
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    try {
      setLoading(true);
      setErr("");

      const [
        { data: dirsData, error: dirsError },
        { data: clientsData, error: clientsError },
        { data: entriesData, error: entriesError },
      ] = await Promise.all([
        supabase
          .from("directories")
          .select("id, name, slug, client_id, is_active")
          .order("name", { ascending: true }),
        supabase.from("clients").select("id, name, slug").order("name", { ascending: true }),
        supabase.from("directory_entries").select("directory_id"),
      ]);

      if (dirsError) throw dirsError;
      if (clientsError) throw clientsError;
      if (entriesError) throw entriesError;

      const byId = {};
      (clientsData ?? []).forEach((c) => { byId[c.id] = c; });

      const countByDirectoryId = {};
      (entriesData ?? []).forEach((row) => {
        if (row.directory_id) countByDirectoryId[row.directory_id] = (countByDirectoryId[row.directory_id] ?? 0) + 1;
      });

      setDirectories(dirsData ?? []);
      setClientsById(byId);
      setEntryCountByDirectoryId(countByDirectoryId);
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
    if (!query) return directories;
    return directories.filter((d) => {
      const client = clientsById[d.client_id];
      return (
        (d.name ?? "").toLowerCase().includes(query) ||
        (d.slug ?? "").toLowerCase().includes(query) ||
        (client?.name ?? "").toLowerCase().includes(query) ||
        (client?.slug ?? "").toLowerCase().includes(query)
      );
    });
  }, [directories, clientsById, q]);

  return (
    <AdminLayout
      breadcrumbs={[{ label: "Directories" }]}
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
            placeholder="Search by directory name or customer name…"
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
              <th>Directory name</th>
              <th>Customer</th>
              <th>Entries</th>
              <th>Status</th>
              <th>Settings</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => {
              const client = clientsById[d.client_id];
              const adminUrl = d.client_id
                ? `/admin/clients/${encodeURIComponent(d.client_id)}/directories/${encodeURIComponent(d.id)}`
                : null;
              const entryCount = entryCountByDirectoryId[d.id] ?? 0;
              return (
                <tr key={d.id}>
                  <td>
                    {adminUrl ? (
                      <Link to={adminUrl} style={{ fontWeight: 600, textDecoration: "none" }}>
                        {d.name ?? "—"}
                      </Link>
                    ) : (
                      <strong>{d.name ?? "—"}</strong>
                    )}
                    {d.slug ? <span style={{ fontSize: 12, opacity: 0.8, display: "block" }}>{d.slug}</span> : null}
                  </td>
                  <td>
                    {client ? (
                      <Link to={`/admin/clients/${encodeURIComponent(d.client_id)}`}>{client.name}</Link>
                    ) : (
                      <span style={{ opacity: 0.6 }}>—</span>
                    )}
                  </td>
                  <td>{entryCount}</td>
                  <td>{d.is_active ? "Active" : "Archived"}</td>
                  <td>
                    {adminUrl ? <Link className="btn" to={adminUrl}>Open</Link> : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!loading && !err && filtered.length === 0 ? (
          <p style={{ marginTop: 12, color: "var(--lc-muted)" }}>
            {directories.length === 0 ? "No directories yet." : "No directories match your search."}
          </p>
        ) : null}
      </div>
    </AdminLayout>
  );
}

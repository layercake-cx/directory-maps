import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { signOut } from "../../lib/auth";
import AdminLayout from "./AdminLayout.jsx";

export default function AdminClients() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    try {
      setLoading(true);
      setErr("");

      const { data, error } = await supabase
        .from("clients")
        .select("id, name, slug, created_at, updated_at")
        .order("name", { ascending: true });

      if (error) throw error;

      setRows(data ?? []);
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
    if (!query) return rows;

    return rows.filter((r) => {
      return (
        (r.name ?? "").toLowerCase().includes(query) ||
        (r.slug ?? "").toLowerCase().includes(query) ||
        (r.id ?? "").toLowerCase().includes(query)
      );
    });
  }, [rows, q]);

  return (
    <AdminLayout
      title="Admin · Clients"
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
            placeholder="Search client name, slug, id…"
          />

          <button className="btn" onClick={load} type="button">
            Refresh
          </button>

          {/* Create button wired in next step */}
            <a className="btn btn-primary" href="/#/admin/clients/new">
                New client
            </a>
        </div>

        {loading ? <p style={{ marginTop: 12 }}>Loading…</p> : null}
        {err ? <p style={{ marginTop: 12 }}>{err}</p> : null}

        <table className="admin-table">
          <thead>
            <tr>
              {["Client", "Slug", "Created", "Updated"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.name}</strong>
                  <div style={{ fontSize: 11, opacity: 0.6 }}>
                    <a href={`/#/admin/clients/${encodeURIComponent(r.id)}`} style={{ fontWeight: 600, color: "inherit" }}>
                    {r.name}
                    </a>
                  </div>
                </td>

                <td>{r.slug}</td>

                <td>
                  {r.created_at
                    ? new Date(r.created_at).toLocaleDateString()
                    : "—"}
                </td>

                <td>
                  {r.updated_at
                    ? new Date(r.updated_at).toLocaleDateString()
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
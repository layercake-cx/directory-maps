import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { signOut } from "../../lib/auth";
import AdminLayout from "./AdminLayout.jsx";

export default function AdminClientDetail() {
  const { clientId } = useParams();

  const [client, setClient] = useState(null);
  const [maps, setMaps] = useState([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    try {
      setLoading(true);
      setErr("");

      const [{ data: c, error: ce }, { data: m, error: me }] = await Promise.all([
        supabase.from("clients").select("id,name,slug,created_at,updated_at").eq("id", clientId).single(),
        supabase
          .from("maps")
          .select("id,name,slug,default_lat,default_lng,default_zoom,show_list_panel,enable_clustering")
          .eq("client_id", clientId)
          .order("name", { ascending: true }),
      ]);

      if (ce) throw ce;
      if (me) throw me;

      setClient(c);
      setMaps(m ?? []);
    } catch (e) {
      setErr(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [clientId]);

  return (
    <AdminLayout
      title="Admin · Client"
      rightActions={
        <button onClick={signOut} type="button">
          Sign out
        </button>
      }
    >
      <div className="admin-card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              <Link to="/admin/clients">← Back to clients</Link>
            </div>

            <h2 style={{ margin: "8px 0 4px 0" }}>{client?.name ?? "Client"}</h2>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 13, opacity: 0.8 }}>
              <div>
                <strong>Slug:</strong> {client?.slug ?? "—"}
              </div>
              <div>
                <strong>ID:</strong> {client?.id ?? "—"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Link className="btn btn-primary" to={`/admin/clients/${encodeURIComponent(clientId)}/maps/new`}>
            New map
            </Link>
          </div>
        </div>

        {loading ? <p style={{ marginTop: 12 }}>Loading…</p> : null}
        {err ? <p style={{ marginTop: 12 }}>{err}</p> : null}

        <div style={{ marginTop: 18 }}>
          <h3 style={{ margin: "0 0 10px 0", fontSize: 16 }}>Maps</h3>

          {maps.length === 0 && !loading ? (
            <p style={{ marginTop: 8, opacity: 0.8 }}>No maps yet for this client.</p>
          ) : null}

          <table className="admin-table" style={{ marginTop: 0 }}>
            <thead>
              <tr>
                {["Map", "Slug", "Defaults", "Options"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>

            <tbody>
            {maps.map((m) => (
                <tr key={m.id}>
                <td>
                    <Link to={`/admin/clients/${encodeURIComponent(clientId)}/maps/${encodeURIComponent(m.id)}`}>
                    {m.name}
                    </Link>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>{m.id}</div>
                </td>

                <td>{m.slug}</td>

                <td>
                    <span style={{ opacity: 0.85 }}>
                    {Number(m.default_lat).toFixed(4)}, {Number(m.default_lng).toFixed(4)} · z{m.default_zoom}
                    </span>
                </td>

                <td>
                    <span className="badge">{m.show_list_panel ? "List on" : "List off"}</span>{" "}
                    <span className="badge">{m.enable_clustering ? "Cluster on" : "Cluster off"}</span>
                </td>
                </tr>
            ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
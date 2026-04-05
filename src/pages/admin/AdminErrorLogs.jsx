import React, { useCallback, useEffect, useState } from "react";
import { signOut } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import AdminLayout from "./AdminLayout.jsx";

const PAGE_SIZE = 100;

function formatJson(v) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export default function AdminErrorLogs() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [expanded, setExpanded] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const { data, error } = await supabase
        .from("error_logs")
        .select("id,created_at,type,severity,message,stack,component_stack,context,user_id,environment,route,user_agent")
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (error) throw error;
      setRows(data ?? []);
    } catch (e) {
      setErr(e?.message ?? String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(id) {
    setExpanded((s) => ({ ...s, [id]: !s[id] }));
  }

  return (
    <AdminLayout
      breadcrumbs={[{ label: "Error log" }]}
      rightActions={
        <button onClick={signOut} type="button">
          Sign out
        </button>
      }
    >
      <div className="admin-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <h2 style={{ margin: 0 }}>Error log</h2>
          <button type="button" className="btn" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
        <p style={{ color: "var(--lc-muted)", marginBottom: 16 }}>
          Recent client-side errors (newest first, last {PAGE_SIZE} entries). Ensure the <code>error_logs</code> migration is applied.
        </p>

        {err ? (
          <p style={{ color: "#b91c1c" }}>{err}</p>
        ) : null}

        {loading && !rows.length ? (
          <p>Loading…</p>
        ) : !rows.length ? (
          <p style={{ color: "var(--lc-muted)" }}>No entries yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table" style={{ width: "100%", fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Time (UTC)</th>
                  <th>Type</th>
                  <th>Severity</th>
                  <th>Message</th>
                  <th>User</th>
                  <th>Env</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <React.Fragment key={r.id}>
                    <tr>
                      <td style={{ whiteSpace: "nowrap" }}>{r.created_at?.replace("T", " ").replace(/\.\d{3}Z?$/, "Z") ?? "—"}</td>
                      <td>{r.type}</td>
                      <td>{r.severity}</td>
                      <td style={{ maxWidth: 360, wordBreak: "break-word" }}>{r.message}</td>
                      <td style={{ fontSize: 11, maxWidth: 100 }} title={r.user_id || ""}>
                        {r.user_id ? `${r.user_id.slice(0, 8)}…` : "—"}
                      </td>
                      <td>{r.environment ?? "—"}</td>
                      <td>
                        <button type="button" className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => toggle(r.id)}>
                          {expanded[r.id] ? "Hide" : "Details"}
                        </button>
                      </td>
                    </tr>
                    {expanded[r.id] ? (
                      <tr>
                        <td colSpan={7} style={{ background: "#f9fafb", verticalAlign: "top", padding: 12 }}>
                          <div style={{ marginBottom: 8 }}>
                            <strong>Route</strong> {r.route || "—"}
                          </div>
                          {r.stack ? (
                            <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: "0 0 8px" }}>{r.stack}</pre>
                          ) : null}
                          {r.component_stack ? (
                            <>
                              <strong style={{ fontSize: 12 }}>Component stack</strong>
                              <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: "4px 0 8px" }}>
                                {r.component_stack}
                              </pre>
                            </>
                          ) : null}
                          <strong style={{ fontSize: 12 }}>Context</strong>
                          <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: "4px 0 0" }}>
                            {formatJson(r.context)}
                          </pre>
                          {r.user_agent ? (
                            <p style={{ fontSize: 11, marginTop: 8, opacity: 0.85 }} title={r.user_agent}>
                              UA: {r.user_agent.slice(0, 120)}
                              {r.user_agent.length > 120 ? "…" : ""}
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

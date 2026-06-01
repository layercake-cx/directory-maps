import React, { useEffect, useMemo, useState } from "react";
import { signOut } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import AdminLayout from "./AdminLayout.jsx";
import { Alert, Badge, Button, Group, Loader, Select, Text } from "@mantine/core";

const PAGE_SIZE = 100;

function formatDuration(startedAt, completedAt) {
  if (!completedAt) return "—";
  const secs = Math.round((new Date(completedAt) - new Date(startedAt)) / 1000);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}

function StatusBadge({ status }) {
  if (status === "success") return <Badge color="green" variant="light" size="xs">Success</Badge>;
  if (status === "warning") return <Badge color="yellow" variant="light" size="xs">Warning</Badge>;
  if (status === "error") return <Badge color="red" variant="light" size="xs">Error</Badge>;
  return <Badge color="gray" variant="light" size="xs">Running</Badge>;
}

export default function AdminSyncLog() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr("");
        let query = supabase
          .from("sync_logs")
          .select("*, maps(name), clients(name)")
          .order("started_at", { ascending: false });
        if (!showAll) query = query.eq("status", "error");
        const { data, error } = await query;
        if (error) throw error;
        setRows(data ?? []);
        setPage(0);
      } catch (e) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [showAll]);

  const clientOptions = useMemo(() => {
    const names = [...new Set((rows ?? []).map((r) => r.clients?.name).filter(Boolean))].sort();
    return [{ value: "", label: "All clients" }, ...names.map((n) => ({ value: n, label: n }))];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      const clientName = (r.clients?.name ?? "").toLowerCase();
      const mapName = (r.maps?.name ?? "").toLowerCase();
      if (clientFilter && clientName !== clientFilter.toLowerCase()) return false;
      if (q && !clientName.includes(q) && !mapName.includes(q)) return false;
      return true;
    });
  }, [rows, search, clientFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <AdminLayout
      breadcrumbs={[{ label: "Sync log" }]}
      rightActions={<button onClick={signOut} type="button">Sign out</button>}
    >
      <div style={{ maxWidth: 1100 }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Sync log</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.65 }}>Google Sheets sync history across all maps.</p>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search by client or map name…"
            style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13, minWidth: 240 }}
          />
          <Select
            size="sm"
            value={clientFilter}
            onChange={(v) => { setClientFilter(v ?? ""); setPage(0); }}
            data={clientOptions}
            style={{ minWidth: 180 }}
          />
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            Show all syncs
          </label>
        </div>

        {loading && (
          <div style={{ padding: "40px 0", textAlign: "center", opacity: 0.5 }}>
            <Loader size="sm" />
          </div>
        )}

        {err && <Alert color="red" variant="light" mb="md">{err}</Alert>}

        {!loading && (
          <>
            <div style={{ overflowX: "auto", border: "1px solid var(--lc-border)", borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 900 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid var(--lc-border)", background: "rgba(0,0,0,0.02)" }}>
                    <th style={{ padding: "9px 12px" }}>Started</th>
                    <th style={{ padding: "9px 12px" }}>Client</th>
                    <th style={{ padding: "9px 12px" }}>Map</th>
                    <th style={{ padding: "9px 12px" }}>Duration</th>
                    <th style={{ padding: "9px 12px" }}>Status</th>
                    <th style={{ padding: "9px 12px" }}>Provider</th>
                    <th style={{ padding: "9px 12px" }}>Total rows</th>
                    <th style={{ padding: "9px 12px" }}>Inserted</th>
                    <th style={{ padding: "9px 12px" }}>Updated</th>
                    <th style={{ padding: "9px 12px" }}>Error message</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 && (
                    <tr>
                      <td colSpan={10} style={{ padding: "16px 12px", opacity: 0.6, textAlign: "center" }}>
                        No results.
                      </td>
                    </tr>
                  )}
                  {pageRows.map((row) => {
                    const isExpanded = expanded === row.id;
                    const errTrunc = row.error_message
                      ? row.error_message.length > 80 ? row.error_message.slice(0, 80) + "…" : row.error_message
                      : "—";
                    return (
                      <React.Fragment key={row.id}>
                        <tr
                          style={{ borderBottom: isExpanded ? "none" : "1px solid var(--lc-border)", cursor: "pointer" }}
                          onClick={() => setExpanded(isExpanded ? null : row.id)}
                        >
                          <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{new Date(row.started_at).toLocaleString()}</td>
                          <td style={{ padding: "8px 12px" }}>{row.clients?.name ?? "—"}</td>
                          <td style={{ padding: "8px 12px" }}>{row.maps?.name ?? "—"}</td>
                          <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{formatDuration(row.started_at, row.completed_at)}</td>
                          <td style={{ padding: "8px 12px" }}><StatusBadge status={row.status} /></td>
                          <td style={{ padding: "8px 12px", opacity: 0.7 }}>{row.provider ?? "—"}</td>
                          <td style={{ padding: "8px 12px" }}>{row.total_rows ?? "—"}</td>
                          <td style={{ padding: "8px 12px" }}>{row.inserted_count ?? "—"}</td>
                          <td style={{ padding: "8px 12px" }}>{row.updated_count ?? "—"}</td>
                          <td style={{ padding: "8px 12px", opacity: 0.7 }}>{errTrunc}</td>
                        </tr>
                        {isExpanded && (
                          <tr style={{ borderBottom: "1px solid var(--lc-border)" }}>
                            <td colSpan={10} style={{ padding: "8px 12px 12px", background: "rgba(0,0,0,0.02)" }}>
                              {row.error_code && (
                                <Text size="xs" mb={4}><strong>Error code:</strong> {row.error_code}</Text>
                              )}
                              {row.error_message && (
                                <Text size="xs" mb={4}><strong>Message:</strong> {row.error_message}</Text>
                              )}
                              {row.error_detail && (
                                <pre style={{ margin: 0, fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all", background: "rgba(0,0,0,0.04)", padding: 8, borderRadius: 4 }}>
                                  {row.error_detail}
                                </pre>
                              )}
                              {!row.error_code && !row.error_message && !row.error_detail && (
                                <Text size="xs" c="dimmed">No detail available.</Text>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 12 }}>
              <Text size="xs" c="dimmed">
                {filtered.length > 0 ? `Page ${page + 1} of ${totalPages} (${filtered.length} rows)` : "No rows"}
              </Text>
              <Group gap="xs">
                <Button size="xs" variant="default" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page <= 0}>Prev</Button>
                <Button size="xs" variant="default" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>Next</Button>
              </Group>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

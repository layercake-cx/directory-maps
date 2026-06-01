import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Alert, Badge, Button, Loader, Text, Group } from "@mantine/core";

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

export default function SyncHistoryTable({ mapId }) {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (!mapId) return;
    (async () => {
      try {
        setLoading(true);
        setErr("");
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        const { data, count, error } = await supabase
          .from("sync_logs")
          .select("*", { count: "exact" })
          .eq("map_id", mapId)
          .order("started_at", { ascending: false })
          .range(from, to);
        if (error) throw error;
        setLogs(data ?? []);
        setTotal(count ?? 0);
      } catch (e) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [mapId, page]);

  if (!mapId) return null;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {loading && (
        <div style={{ padding: "32px 0", textAlign: "center", opacity: 0.5 }}>
          <Loader size="sm" />
        </div>
      )}

      {err && <Alert color="red" variant="light">{err}</Alert>}

      {!loading && logs.length === 0 && !err && (
        <Text size="sm" c="dimmed">No sync history yet.</Text>
      )}

      {!loading && logs.length > 0 && (
        <>
          <div style={{ overflowX: "auto", border: "1px solid var(--lc-border)", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 700 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--lc-border)", background: "rgba(0,0,0,0.02)" }}>
                  <th style={{ padding: "9px 12px" }}>Started</th>
                  <th style={{ padding: "9px 12px" }}>Duration</th>
                  <th style={{ padding: "9px 12px" }}>Status</th>
                  <th style={{ padding: "9px 12px" }}>Provider</th>
                  <th style={{ padding: "9px 12px" }}>Total rows</th>
                  <th style={{ padding: "9px 12px" }}>Inserted</th>
                  <th style={{ padding: "9px 12px" }}>Updated</th>
                  <th style={{ padding: "9px 12px" }}>Error</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const isExpanded = expanded === log.id;
                  const errTrunc = log.error_message
                    ? log.error_message.length > 80
                      ? log.error_message.slice(0, 80) + "…"
                      : log.error_message
                    : "—";
                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        style={{ borderBottom: isExpanded ? "none" : "1px solid var(--lc-border)", cursor: log.error_message || log.error_code ? "pointer" : "default" }}
                        onClick={() => setExpanded(isExpanded ? null : log.id)}
                      >
                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                          {new Date(log.started_at).toLocaleString()}
                        </td>
                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                          {formatDuration(log.started_at, log.completed_at)}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <StatusBadge status={log.status} />
                        </td>
                        <td style={{ padding: "8px 12px", opacity: 0.7 }}>{log.provider ?? "—"}</td>
                        <td style={{ padding: "8px 12px" }}>{log.total_rows ?? "—"}</td>
                        <td style={{ padding: "8px 12px" }}>{log.inserted_count ?? "—"}</td>
                        <td style={{ padding: "8px 12px" }}>{log.updated_count ?? "—"}</td>
                        <td style={{ padding: "8px 12px", opacity: 0.7 }}>{errTrunc}</td>
                      </tr>
                      {isExpanded && (
                        <tr style={{ borderBottom: "1px solid var(--lc-border)" }}>
                          <td colSpan={8} style={{ padding: "8px 12px 12px", background: "rgba(0,0,0,0.02)" }}>
                            {log.error_code && (
                              <Text size="xs" mb={4}><strong>Error code:</strong> {log.error_code}</Text>
                            )}
                            {log.error_message && (
                              <Text size="xs" mb={4}><strong>Message:</strong> {log.error_message}</Text>
                            )}
                            {log.error_detail && (
                              <pre style={{ margin: 0, fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all", background: "rgba(0,0,0,0.04)", padding: 8, borderRadius: 4 }}>
                                {log.error_detail}
                              </pre>
                            )}
                            {!log.error_code && !log.error_message && !log.error_detail && (
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

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <Text size="xs" c="dimmed">Page {page + 1} of {totalPages}</Text>
            <Group gap="xs">
              <Button size="xs" variant="default" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page <= 0}>Prev</Button>
              <Button size="xs" variant="default" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>Next</Button>
            </Group>
          </div>
        </>
      )}
    </div>
  );
}

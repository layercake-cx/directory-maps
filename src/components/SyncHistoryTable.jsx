import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Button, Callout, EmptyState, Pill, Skeleton } from "./ui/index.js";
import "../styles/wave-b/map-data.css";

const PAGE_SIZE = 100;

function formatDuration(startedAt, completedAt) {
  if (!completedAt) return "—";
  const secs = Math.round((new Date(completedAt) - new Date(startedAt)) / 1000);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}

function StatusPill({ status }) {
  if (status === "success") return <Pill tone="ok">Success</Pill>;
  if (status === "warning") return <Pill tone="warn">Warning</Pill>;
  if (status === "error") return <Pill tone="danger">Error</Pill>;
  return <Pill tone="neutral">Running</Pill>;
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
    <div className="md-stack">
      {loading && <Skeleton variant="table" rows={4} label="Loading sync history" />}

      {err && <Callout tone="danger">{err}</Callout>}

      {!loading && logs.length === 0 && !err && (
        <EmptyState art="none" title="No sync history yet" />
      )}

      {!loading && logs.length > 0 && (
        <div className="table-wrap">
          <table className="table md-history-table">
            <caption className="sr-only">Sync history</caption>
            <thead>
              <tr>
                <th>Started</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Provider</th>
                <th>Total rows</th>
                <th>Inserted</th>
                <th>Updated</th>
                <th>Deleted</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const isExpanded = expanded === log.id;
                const hasError = !!(log.error_message || log.error_code);
                const errTrunc = log.error_message
                  ? log.error_message.length > 80
                    ? log.error_message.slice(0, 80) + "…"
                    : log.error_message
                  : "—";
                return (
                  <React.Fragment key={log.id}>
                    <tr
                      className={`md-history-row ${hasError ? "is-clickable" : ""}`.trim()}
                      onClick={() => setExpanded(isExpanded ? null : log.id)}
                    >
                      <td className="md-nowrap">
                        <button
                          type="button"
                          className="md-linkbtn"
                          aria-expanded={isExpanded}
                          onClick={(e) => { e.stopPropagation(); setExpanded(isExpanded ? null : log.id); }}
                        >
                          {new Date(log.started_at).toLocaleString("en-GB")}
                        </button>
                      </td>
                      <td className="md-nowrap">{formatDuration(log.started_at, log.completed_at)}</td>
                      <td><StatusPill status={log.status} /></td>
                      <td className="md-cell-muted">{log.provider ?? "—"}</td>
                      <td>{log.total_rows ?? "—"}</td>
                      <td>{log.inserted_count ?? "—"}</td>
                      <td>{log.updated_count ?? "—"}</td>
                      <td>{log.deleted_count ?? "—"}</td>
                      <td className="md-cell-muted">{errTrunc}</td>
                    </tr>
                    {isExpanded && (
                      <tr className="md-history-detail">
                        <td colSpan={9}>
                          {log.error_code && <p><strong>Error code:</strong> {log.error_code}</p>}
                          {log.error_message && <p><strong>Message:</strong> {log.error_message}</p>}
                          {log.error_detail && <pre>{log.error_detail}</pre>}
                          {!log.error_code && !log.error_message && !log.error_detail && (
                            <p className="md-muted">No detail available.</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          <div className="table-foot">
            <span>Page {page + 1} of {totalPages}</span>
            <span className="table-foot-actions">
              <Button size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page <= 0}>Previous</Button>
              <Button size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>Next</Button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import AdminLayout from "./AdminLayout.jsx";
import LogsFeaturePanel from "../../components/shell/LogsFeaturePanel.jsx";
import { Button, Callout, Checkbox, EmptyState, Field, PageLayout, Pill, Section, Select, Skeleton, TextInput, Toolbar } from "../../components/ui/index.js";
import "../../styles/wave-c/ops.css";

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
  if (status === "success") return <Pill tone="ok">Success</Pill>;
  if (status === "warning") return <Pill tone="warn">Warning</Pill>;
  if (status === "error") return <Pill tone="danger">Error</Pill>;
  return <Pill tone="neutral">Running</Pill>;
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
    <AdminLayout panel={<LogsFeaturePanel />}>
      <PageLayout
        head={{ title: "Sync log", subtitle: "Google Sheets sync history across all maps." }}
      >
        <Toolbar>
          <Field label="Search" className="ops-toolbar-search">
            <TextInput
              type="search"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Client or map name"
            />
          </Field>
          <Field label="Client" className="ops-toolbar-field">
            <Select
              value={clientFilter}
              onChange={(e) => { setClientFilter(e.target.value ?? ""); setPage(0); }}
              options={clientOptions}
            />
          </Field>
          <div className="ops-toolbar-check">
            <Checkbox label="Show all syncs" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          </div>
        </Toolbar>

        {err ? <Callout tone="danger">{err}</Callout> : null}

        <Section flush>
          {loading ? (
            <Skeleton variant="table" label="Loading sync log" />
          ) : pageRows.length === 0 ? (
            <EmptyState
              art="searching"
              title="No results"
              body={showAll ? "No syncs match these filters." : "No failed syncs match these filters. Show all syncs to see successful ones."}
            />
          ) : (
            <div className="table-wrap">
              <table className="table ops-sync-table">
                <caption className="sr-only">Sync log</caption>
                <thead>
                  <tr>
                    <th>Started</th>
                    <th>Client</th>
                    <th>Map</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th>Provider</th>
                    <th>Total rows</th>
                    <th>Inserted</th>
                    <th>Updated</th>
                    <th>Error message</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => {
                    const isExpanded = expanded === row.id;
                    const errTrunc = row.error_message
                      ? row.error_message.length > 80 ? row.error_message.slice(0, 80) + "…" : row.error_message
                      : "—";
                    return (
                      <React.Fragment key={row.id}>
                        <tr className="ops-row-click" onClick={() => setExpanded(isExpanded ? null : row.id)}>
                          <td className="ops-nowrap">
                            <button
                              type="button"
                              className="ops-linkbtn"
                              aria-expanded={isExpanded}
                              onClick={(e) => { e.stopPropagation(); setExpanded(isExpanded ? null : row.id); }}
                            >
                              {new Date(row.started_at).toLocaleString("en-GB")}
                            </button>
                          </td>
                          <td>{row.clients?.name ?? "—"}</td>
                          <td>{row.maps?.name ?? "—"}</td>
                          <td className="ops-nowrap">{formatDuration(row.started_at, row.completed_at)}</td>
                          <td><StatusBadge status={row.status} /></td>
                          <td className="ops-cell-muted">{row.provider ?? "—"}</td>
                          <td>{row.total_rows ?? "—"}</td>
                          <td>{row.inserted_count ?? "—"}</td>
                          <td>{row.updated_count ?? "—"}</td>
                          <td className="ops-cell-muted">{errTrunc}</td>
                        </tr>
                        {isExpanded && (
                          <tr className="ops-detail">
                            <td colSpan={10}>
                              <div className="ops-detail-body">
                                {row.error_code && (
                                  <p><span className="ops-detail-label">Error code:</span> {row.error_code}</p>
                                )}
                                {row.error_message && (
                                  <p><span className="ops-detail-label">Message:</span> {row.error_message}</p>
                                )}
                                {row.error_detail && <pre className="ops-pre">{row.error_detail}</pre>}
                                {!row.error_code && !row.error_message && !row.error_detail && (
                                  <p className="ops-cell-muted">No detail available.</p>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              <div className="table-foot">
                <span>{filtered.length > 0 ? `Page ${page + 1} of ${totalPages} (${filtered.length} rows)` : "No rows"}</span>
                <span className="table-foot-actions">
                  <Button size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page <= 0}>Previous</Button>
                  <Button size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>Next</Button>
                </span>
              </div>
            </div>
          )}
        </Section>
      </PageLayout>
    </AdminLayout>
  );
}

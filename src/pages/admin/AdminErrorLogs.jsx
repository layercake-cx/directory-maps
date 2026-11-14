import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import AdminLayout from "./AdminLayout.jsx";
import LogsFeaturePanel from "../../components/shell/LogsFeaturePanel.jsx";
import { Button, Callout, EmptyState, PageLayout, Pill, Section, Skeleton } from "../../components/ui/index.js";
import "../../styles/wave-c/ops.css";

const PAGE_SIZE = 100;

function formatJson(v) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function severityTone(severity) {
  const v = String(severity || "").toLowerCase();
  if (v === "error" || v === "fatal" || v === "critical") return "danger";
  if (v === "warn" || v === "warning") return "warn";
  if (v === "info") return "info";
  return "neutral";
}

export default function AdminErrorLogs() {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("id");
  const highlightRef = useRef(null);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [expanded, setExpanded] = useState(() => highlightId ? { [highlightId]: true } : {});

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

  useEffect(() => {
    if (highlightId && highlightRef.current && !loading) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [rows, highlightId, loading]);

  function toggle(id) {
    setExpanded((s) => ({ ...s, [id]: !s[id] }));
  }

  return (
    <AdminLayout panel={<LogsFeaturePanel />}>
      <PageLayout
        head={{
          title: "Error log",
          subtitle: (
            <>
              Recent client-side errors (newest first, last {PAGE_SIZE} entries). Ensure the <code>error_logs</code> migration is applied.
            </>
          ),
          actions: (
            <Button onClick={load} loading={loading} loadingLabel="Loading…">
              Refresh
            </Button>
          ),
        }}
      >
        {err ? <Callout tone="danger">{err}</Callout> : null}

        <Section flush>
          {loading && !rows.length ? (
            <Skeleton variant="table" label="Loading error log" />
          ) : !rows.length ? (
            <EmptyState art="encouraging" title="No entries yet" body="Client-side errors will appear here when they are reported." />
          ) : (
            <div className="table-wrap">
              <table className="table ops-log-table">
                <caption className="sr-only">Error log</caption>
                <thead>
                  <tr>
                    <th>Time (UTC)</th>
                    <th>Type</th>
                    <th>Severity</th>
                    <th>Message</th>
                    <th>User</th>
                    <th>Env</th>
                    <th>
                      <span className="sr-only">Details</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <React.Fragment key={r.id}>
                      <tr
                        ref={r.id === highlightId ? highlightRef : null}
                        className={r.id === highlightId ? "ops-row-highlight" : undefined}
                      >
                        <td className="ops-nowrap">{r.created_at?.replace("T", " ").replace(/\.\d{3}Z?$/, "Z") ?? "—"}</td>
                        <td>{r.type}</td>
                        <td>{r.severity ? <Pill tone={severityTone(r.severity)}>{r.severity}</Pill> : "—"}</td>
                        <td className="ops-cell-wrap">{r.message}</td>
                        <td className="ops-cell-id" title={r.user_id || ""}>
                          {r.user_id ? `${r.user_id.slice(0, 8)}…` : "—"}
                        </td>
                        <td>{r.environment ?? "—"}</td>
                        <td>
                          <Button size="sm" aria-expanded={!!expanded[r.id]} onClick={() => toggle(r.id)}>
                            {expanded[r.id] ? "Hide" : "Details"}
                          </Button>
                        </td>
                      </tr>
                      {expanded[r.id] ? (
                        <tr className="ops-detail">
                          <td colSpan={7}>
                            <div className="ops-detail-body">
                              <p>
                                <span className="ops-detail-label">Route</span> {r.route || "—"}
                              </p>
                              {r.stack ? <pre className="ops-pre">{r.stack}</pre> : null}
                              {r.component_stack ? (
                                <>
                                  <span className="ops-detail-label">Component stack</span>
                                  <pre className="ops-pre">{r.component_stack}</pre>
                                </>
                              ) : null}
                              <span className="ops-detail-label">Context</span>
                              <pre className="ops-pre">{formatJson(r.context)}</pre>
                              {r.user_agent ? (
                                <p className="ops-cell-muted" title={r.user_agent}>
                                  UA: {r.user_agent.slice(0, 120)}
                                  {r.user_agent.length > 120 ? "…" : ""}
                                </p>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </PageLayout>
    </AdminLayout>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import styles from "../pages/client/ClientEmail.module.css";

const PAGE_SIZE = 50;

function formatWhen(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function surfaceLabel(surface) {
  if (surface === "embed") return "Embed";
  if (surface === "client_preview" || surface === "admin_preview") return "Preview";
  return surface || "—";
}

function deliveryStatus(row) {
  if (row.email_sent === false) {
    return { label: "Send failed", tone: "error", title: row.email_error || undefined };
  }
  return { label: "Sent", tone: "success" };
}

function mergeSubmissions(rawRows) {
  const failures = rawRows.filter((r) => r.email_sent === false);
  const primary = rawRows.filter((r) => r.email_sent !== false);

  const merged = primary.map((row) => {
    const fail = failures.find(
      (f) =>
        f.map_id === row.map_id &&
        f.sender_email === row.sender_email &&
        f.message === row.message &&
        f.to_email === row.to_email &&
        Math.abs(new Date(f.submitted_at) - new Date(row.submitted_at)) < 60_000
    );
    if (!fail) return row;
    return { ...row, email_sent: false, email_error: fail.email_error };
  });

  for (const fail of failures) {
    const paired = primary.some(
      (p) =>
        p.map_id === fail.map_id &&
        p.sender_email === fail.sender_email &&
        p.message === fail.message &&
        p.to_email === fail.to_email &&
        Math.abs(new Date(p.submitted_at) - new Date(fail.submitted_at)) < 60_000
    );
    if (!paired) merged.push(fail);
  }

  return merged.sort(
    (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
  );
}

function truncate(text, max = 100) {
  const s = (text || "").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export default function MessagingSentMessages({ clientId }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setErr("");
    try {
      const { data, error } = await supabase.rpc("list_client_contact_submissions", {
        p_client_id: clientId,
        p_limit: 500,
      });
      if (error) throw error;
      setRows(mergeSubmissions(data ?? []));
    } catch (e) {
      setErr(e?.message ?? String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const mapNames = useMemo(
    () => Object.fromEntries(rows.map((r) => [r.map_id, r.map_name || r.map_id])),
    [rows]
  );

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const start = page * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, page]);

  useEffect(() => {
    if (page > 0 && page >= pageCount) setPage(Math.max(0, pageCount - 1));
  }, [page, pageCount]);

  if (loading) {
    return <p className={styles.messagesHint}>Loading sent messages…</p>;
  }

  if (err) {
    return <p className={styles.error}>{err}</p>;
  }

  if (!rows.length) {
    return (
      <p className={styles.messagesHint}>
        No contact messages yet. When visitors use Send message on your published maps, they will
        appear here.
      </p>
    );
  }

  return (
    <div className={styles.messagesPanel}>
      <p className={styles.messagesHint}>
        Contact form submissions across all maps for this organisation, newest first. Email delivery
        failures are marked — the visitor&apos;s message is still recorded.
      </p>

      <div className={styles.messagesTableWrap}>
        <table className={styles.messagesTable}>
          <thead>
            <tr>
              <th>Sent</th>
              <th>Map</th>
              <th>Listing</th>
              <th>From</th>
              <th>To</th>
              <th>Message</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const status = deliveryStatus(row);
              const expanded = expandedId === row.id;
              return (
                <React.Fragment key={row.id}>
                  <tr>
                    <td className={styles.messagesWhen}>{formatWhen(row.submitted_at)}</td>
                    <td>{mapNames[row.map_id] || "—"}</td>
                    <td>{row.listing_name || "—"}</td>
                    <td>
                      <div className={styles.messagesPerson}>
                        <span>{row.sender_name || "—"}</span>
                        <a href={`mailto:${row.sender_email}`}>{row.sender_email}</a>
                        {row.sender_phone ? <span className={styles.messagesMuted}>{row.sender_phone}</span> : null}
                      </div>
                    </td>
                    <td className={styles.messagesEmail}>{row.to_email}</td>
                    <td>
                      <button
                        type="button"
                        className={styles.messagesExpand}
                        onClick={() => setExpandedId(expanded ? null : row.id)}
                        aria-expanded={expanded}
                      >
                        {truncate(row.message)}
                      </button>
                    </td>
                    <td>
                      <span
                        className={`${styles.messagesBadge} ${styles[`messagesBadge--${status.tone}`]}`}
                        title={status.title}
                      >
                        {status.label}
                      </span>
                      <span className={styles.messagesSurface}>{surfaceLabel(row.surface)}</span>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className={styles.messagesDetailRow}>
                      <td colSpan={7}>
                        <div className={styles.messagesDetail}>
                          <strong>Message</strong>
                          <p>{row.message}</p>
                          {status.title ? (
                            <>
                              <strong>Delivery error</strong>
                              <pre>{status.title}</pre>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length > PAGE_SIZE ? (
        <div className={styles.messagesPager}>
          <button
            type="button"
            className="btn"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </button>
          <span className={styles.messagesPagerMeta}>
            Page {page + 1} of {pageCount} · {rows.length} messages
          </span>
          <button
            type="button"
            className="btn"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            Next
          </button>
        </div>
      ) : (
        <p className={styles.messagesPagerMeta}>{rows.length} message{rows.length === 1 ? "" : "s"}</p>
      )}
    </div>
  );
}

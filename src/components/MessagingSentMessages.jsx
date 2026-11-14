import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { Dialog, Button, DataTable, EmptyState, ErrorState, Pill, Section } from "./ui/index.js";
import "../styles/wave-b/messaging.css";

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
    return { label: "Send failed", tone: "danger", title: row.email_error || undefined };
  }
  return { label: "Sent", tone: "ok" };
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

  if (err) {
    return (
      <ErrorState
        title="Sent messages could not be loaded"
        body={`${err} Nothing has been lost.`}
        onRetry={load}
      />
    );
  }

  const expandedRow = rows.find((r) => r.id === expandedId) ?? null;
  const expandedStatus = expandedRow ? deliveryStatus(expandedRow) : null;

  const columns = [
    { key: "submitted_at", label: "Sent", className: "wb5-nowrap", render: (row) => formatWhen(row.submitted_at) },
    { key: "map", label: "Map", render: (row) => mapNames[row.map_id] || "—" },
    { key: "listing_name", label: "Listing", render: (row) => row.listing_name || "—" },
    {
      key: "sender",
      label: "From",
      render: (row) => (
        <div className="wb5-person">
          <span>{row.sender_name || "—"}</span>
          <a href={`mailto:${row.sender_email}`}>{row.sender_email}</a>
          {row.sender_phone ? <span className="wb5-cell-sub">{row.sender_phone}</span> : null}
        </div>
      ),
    },
    { key: "to_email", label: "To", className: "wb5-wrap", render: (row) => row.to_email },
    {
      key: "message",
      label: "Message",
      render: (row) => (
        <button
          type="button"
          className="wb5-msg-btn"
          onClick={() => setExpandedId(row.id)}
          aria-haspopup="dialog"
        >
          {truncate(row.message)}
        </button>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (row) => {
        const status = deliveryStatus(row);
        return (
          <>
            <Pill tone={status.tone} title={status.title}>{status.label}</Pill>
            <span className="wb5-cell-sub">{surfaceLabel(row.surface)}</span>
          </>
        );
      },
    },
  ];

  return (
    <>
      <Section
        title="Sent messages"
        description="Contact form submissions across all maps for this organisation, newest first. Email delivery failures are marked — the visitor's message is still recorded."
        flush
      >
        <DataTable
          caption="Sent messages"
          columns={columns}
          rows={pageRows}
          getRowId={(row) => row.id}
          getRowLabel={(row) => row.listing_name || row.sender_name || "message"}
          loading={loading}
          empty={(
            <EmptyState
              art="none"
              title="No contact messages yet"
              body="When visitors use Send message on your published maps, they will appear here."
            />
          )}
          pagination={{
            page: page + 1,
            pageSize: PAGE_SIZE,
            total: rows.length,
            onPage: (p) => setPage(Math.min(pageCount - 1, Math.max(0, p - 1))),
          }}
        />
      </Section>

      {expandedRow ? (
        <Dialog
          title="Message"
          onClose={() => setExpandedId(null)}
          footer={<Button onClick={() => setExpandedId(null)}>Close</Button>}
        >
          <div className="wb5-detail">
            <p>{expandedRow.message}</p>
            {expandedStatus.title ? (
              <>
                <h3>Delivery error</h3>
                <pre>{expandedStatus.title}</pre>
              </>
            ) : null}
          </div>
        </Dialog>
      ) : null}
    </>
  );
}

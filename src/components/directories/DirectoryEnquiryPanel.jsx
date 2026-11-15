import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import EntityMessagingSettings from "../EntityMessagingSettings.jsx";
import DirectoryEmailTemplatesEditor from "./DirectoryEmailTemplatesEditor.jsx";
import { Callout, DataTable, EmptyState, Pill, Section } from "../ui/index.js";
import "../../styles/wave-a/batch-1.css";


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

function truncate(text, max = 120) {
  const s = (text || "").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/**
 * Directory Emails › Email settings / Email log (`section` prop). The route (DirectoryEnquiriesRoute) provides the page layout and heading; this renders the Sections. The sending profile, enable switch, test
 * mode and message text are per directory. Each published entry page shows a
 * Contact button (when the entry has an email address); the message goes to that
 * entry's own email. Sending profiles (From address + domain) are the
 * organisation's, managed under Messaging.
 */
export default function DirectoryEnquiryPanel({ directoryId, clientId, canManage, eventSource, onSaved, section = "settings" }) {
  const [rows, setRows] = useState([]);
  const [rowsErr, setRowsErr] = useState("");
  const [rowsLoading, setRowsLoading] = useState(true);

  const loadRows = useCallback(async () => {
    if (!directoryId || section !== "log") return;
    setRowsLoading(true);
    setRowsErr("");
    const { data, error } = await supabase
      .from("directory_contact_submissions")
      .select("id, submitted_at, entry_name, sender_name, sender_email, message, email_sent, email_error")
      .eq("directory_id", directoryId)
      .order("submitted_at", { ascending: false })
      .limit(20);
    if (error) setRowsErr(error.message);
    else setRows(data ?? []);
    setRowsLoading(false);
  }, [directoryId, section]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const logColumns = [
    { key: "submitted_at", label: "When", className: "b1-nowrap", render: (row) => formatWhen(row.submitted_at) },
    { key: "entry_name", label: "Entry", render: (row) => row.entry_name || "—" },
    {
      key: "sender_name",
      label: "From",
      render: (row) => (
        <>
          {row.sender_name || "—"}
          {row.sender_email ? <span className="b1-cell-sub">{row.sender_email}</span> : null}
        </>
      ),
    },
    { key: "message", label: "Message", render: (row) => truncate(row.message) },
    {
      key: "email_sent",
      label: "Status",
      render: (row) => (
        <Pill tone={row.email_sent === false ? "danger" : "ok"} title={row.email_error || undefined}>
          {row.email_sent === false ? "Send failed" : "Sent"}
        </Pill>
      ),
    },
  ];

  return section === "settings" ? (
    <>
      <EntityMessagingSettings
        entity="directory"
        entityId={directoryId}
        clientId={clientId}
        eventSource={eventSource}
        canManage={canManage}
        onSaved={onSaved}
      />
      <DirectoryEmailTemplatesEditor
        directoryId={directoryId}
        clientId={clientId}
        canManage={canManage}
        eventSource={eventSource}
      />
    </>
  ) : (
    <Section title="Recent messages" flush={!rowsErr}>
      {rowsErr ? (
        <Callout tone="danger">{rowsErr}</Callout>
      ) : (
        <DataTable
          caption="Recent messages"
          columns={logColumns}
          rows={rows}
          getRowId={(row) => row.id}
          getRowLabel={(row) => row.entry_name || "message"}
          loading={rowsLoading}
          empty={(
            <EmptyState
              art="none"
              title="No messages yet"
              body="When visitors use Contact on a published entry page, they show up here."
            />
          )}
        />
      )}
    </Section>
  );
}

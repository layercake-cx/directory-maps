import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import EntityMessagingSettings from "../EntityMessagingSettings.jsx";


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
 * Directory Emails › Email settings / Email log (`section` prop). The sending profile, enable switch, test
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

  return (
    <>
      <div className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">{section === "log" ? "Email log" : "Email settings"}</h1>
        </div>
      </div>

      {section === "settings" ? (
          <EntityMessagingSettings
            entity="directory"
            entityId={directoryId}
            clientId={clientId}
            eventSource={eventSource}
            canManage={canManage}
            onSaved={onSaved}
          />
      ) : (
        <div className="admin-card">
          <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Recent messages</p>
          {rowsLoading ? <p style={{ fontSize: 13, opacity: 0.7 }}>Loading…</p> : null}
          {rowsErr ? <p style={{ color: "#b91c1c", fontSize: 13 }}>{rowsErr}</p> : null}
          {!rowsLoading && !rowsErr && rows.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, opacity: 0.75 }}>
              No messages yet. When visitors use Contact on a published entry page, they show up here.
            </p>
          ) : null}
          {rows.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", opacity: 0.7 }}>
                    <th style={{ padding: "6px 8px 6px 0", fontWeight: 600 }}>When</th>
                    <th style={{ padding: "6px 8px", fontWeight: 600 }}>Entry</th>
                    <th style={{ padding: "6px 8px", fontWeight: 600 }}>From</th>
                    <th style={{ padding: "6px 8px", fontWeight: 600 }}>Message</th>
                    <th style={{ padding: "6px 0 6px 8px", fontWeight: 600 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} style={{ borderTop: "1px solid var(--lc-border)" }}>
                      <td style={{ padding: "8px 8px 8px 0", whiteSpace: "nowrap" }}>{formatWhen(row.submitted_at)}</td>
                      <td style={{ padding: "8px" }}>{row.entry_name || "—"}</td>
                      <td style={{ padding: "8px" }}>
                        {row.sender_name || "—"}
                        {row.sender_email ? <div style={{ opacity: 0.7 }}>{row.sender_email}</div> : null}
                      </td>
                      <td style={{ padding: "8px" }}>{truncate(row.message)}</td>
                      <td style={{ padding: "8px 0 8px 8px", color: row.email_sent === false ? "#b91c1c" : "#15803d" }} title={row.email_error || undefined}>
                        {row.email_sent === false ? "Send failed" : "Sent"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}

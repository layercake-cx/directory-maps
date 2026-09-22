import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { updateDirectory } from "../../lib/directories.js";
import MessagingSettings from "../MessagingSettings.jsx";

const inputStyle = { width: "100%", maxWidth: 420, boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13 };
const labelStyle = { fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 };

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
 * Directory Email tab. The contact inbox is per directory. Enable, test mode,
 * from address, subject, and domain are the organisation's map messaging
 * settings — the same records edited at /client/email.
 */
export default function DirectoryEnquiryPanel({ directory, directoryId, clientId, clientName, canManage, recordEvent, eventSource, onSaved }) {
  const [email, setEmail] = useState(directory?.enquiry_email || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [rows, setRows] = useState([]);
  const [rowsErr, setRowsErr] = useState("");
  const [rowsLoading, setRowsLoading] = useState(true);

  useEffect(() => {
    setEmail(directory?.enquiry_email || "");
  }, [directory]);

  const loadRows = useCallback(async () => {
    if (!directoryId) return;
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
  }, [directoryId]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  async function handleSave(e) {
    e.preventDefault();
    if (!canManage) return;
    setErr("");
    setMsg("");
    const clean = email.trim();
    if (clean && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setErr("Enter a valid contact email, or leave it blank to hide Make an Enquiry.");
      return;
    }
    try {
      setSaving(true);
      await updateDirectory(directoryId, { enquiry_email: clean || null });
      recordEvent?.("directory_enquiry_settings_updated", {
        directory_id: directoryId,
        contact_email_set: !!clean,
        changed_fields: ["enquiry_email"],
      });
      setMsg(clean ? "Contact email saved. Publish the directory again for the button to appear on entry pages." : "Contact email cleared. Publish again to remove Make an Enquiry from entry pages.");
      onSaved?.();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="admin-card" style={{ marginBottom: 16 }}>
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Contact email</p>
        <p style={{ margin: "0 0 12px", fontSize: 13, opacity: 0.75, maxWidth: 640 }}>
          When this address is set and messaging is on, each published entry page shows <strong>Make an Enquiry</strong> next to Visit website. The message is sent here. Publish again after saving — the button is written into the public pages at publish time.
        </p>
        <form onSubmit={handleSave}>
          {err ? <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p> : null}
          {msg ? <p style={{ color: "#15803d", fontSize: 13 }}>{msg}</p> : null}
          <label style={labelStyle} htmlFor="directory-enquiry-email">
            Contact email
          </label>
          <input
            id="directory-enquiry-email"
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setMsg(""); }}
            disabled={!canManage}
            placeholder="hello@yourorganisation.com"
            style={inputStyle}
          />
          {canManage ? (
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save contact email"}
              </button>
            </div>
          ) : null}
        </form>
      </div>

      <MessagingSettings
        clientId={clientId}
        clientName={clientName}
        eventSource={eventSource}
        product="directory"
      />

      <div className="admin-card" style={{ marginTop: 16 }}>
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Recent enquiries</p>
        {rowsLoading ? <p style={{ fontSize: 13, opacity: 0.7 }}>Loading…</p> : null}
        {rowsErr ? <p style={{ color: "#b91c1c", fontSize: 13 }}>{rowsErr}</p> : null}
        {!rowsLoading && !rowsErr && rows.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, opacity: 0.75 }}>
            No enquiries yet. When visitors use Make an Enquiry on a published entry page, they show up here.
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
    </>
  );
}

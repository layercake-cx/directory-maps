import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { recordAdminEvent } from "../../lib/adminEvents.js";
import {
  SYSTEM_EMAILS,
  loadDirectoryEmailTemplates,
  previewDirectoryEmail,
  resetDirectoryEmailTemplate,
  saveDirectoryEmailTemplate,
  sendTestDirectoryEmail,
} from "../../lib/directoryEmailTemplates.js";

function textFromRow(def, row) {
  const d = def.defaults;
  return {
    subject: row?.subject || d.subject,
    heading: row?.heading || d.heading,
    body: row?.body || d.body,
    buttonLabel: row?.button_label || d.buttonLabel,
  };
}

/**
 * Directory Email settings > "System emails". Edit the subject, heading, body and button label of the
 * branded emails the platform sends on this directory's behalf. The look (logo, fonts, header colours)
 * comes from the directory's Branding tab and is shown in the live preview.
 */
export default function DirectoryEmailTemplatesEditor({ directoryId, clientId, canManage, eventSource }) {
  const [rows, setRows] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeKey, setActiveKey] = useState(SYSTEM_EMAILS[0].key);
  const [text, setText] = useState(textFromRow(SYSTEM_EMAILS[0], null));
  const [html, setHtml] = useState("");
  const [previewErr, setPreviewErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const debounce = useRef(null);

  const def = SYSTEM_EMAILS.find((d) => d.key === activeKey);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await loadDirectoryEmailTemplates(directoryId));
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [directoryId]);

  useEffect(() => {
    load();
  }, [load]);

  // Switch email -> load its saved (or default) text.
  useEffect(() => {
    setText(textFromRow(def, rows[activeKey]));
    setMsg("");
    setErr("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, rows]);

  // Debounced live preview rendered server-side so it matches what is sent.
  useEffect(() => {
    if (loading) return undefined;
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const r = await previewDirectoryEmail(directoryId, activeKey, text);
        setHtml(r.html || "");
        setPreviewErr("");
      } catch (e) {
        setPreviewErr(e?.message ?? String(e));
      }
    }, 400);
    return () => clearTimeout(debounce.current);
  }, [directoryId, activeKey, text, loading]);

  const meta = (extra) => ({ client_id: clientId, directory_id: directoryId, template_key: activeKey, source: eventSource, ...extra });

  async function run(fn) {
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      await fn();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(async () => {
      const changed = await saveDirectoryEmailTemplate(directoryId, def, text);
      recordAdminEvent(supabase, { eventType: "email_directory_template_updated", clientId, meta: meta({ changed_fields: changed }) });
      await load();
      setMsg("Saved.");
    });

  const reset = () =>
    run(async () => {
      await resetDirectoryEmailTemplate(directoryId, activeKey);
      recordAdminEvent(supabase, { eventType: "email_directory_template_reset", clientId, meta: meta({}) });
      await load();
      setMsg("Reset to the default text.");
    });

  const sendTest = () =>
    run(async () => {
      const r = await sendTestDirectoryEmail(directoryId, activeKey, text);
      recordAdminEvent(supabase, { eventType: "email_directory_template_test_sent", clientId, meta: meta({}) });
      setMsg(`Test email sent to ${r.sentTo}.`);
    });

  const field = (label, name, opts = {}) => (
    <div style={{ marginBottom: 12 }}>
      <label className="auth-form__label" htmlFor={`tpl-${name}`}>{label}</label>
      {opts.multiline ? (
        <textarea
          id={`tpl-${name}`}
          className="auth-form__input"
          rows={9}
          value={text[name]}
          disabled={!canManage}
          onChange={(e) => setText((t) => ({ ...t, [name]: e.target.value }))}
          style={{ fontFamily: "inherit" }}
        />
      ) : (
        <input
          id={`tpl-${name}`}
          className="auth-form__input"
          value={text[name]}
          disabled={!canManage}
          maxLength={opts.max ?? 200}
          onChange={(e) => setText((t) => ({ ...t, [name]: e.target.value }))}
        />
      )}
    </div>
  );

  return (
    <div className="admin-card" style={{ marginTop: 16 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>System emails</h2>
      <p style={{ margin: "0 0 12px", fontSize: 13, opacity: 0.75 }}>
        Emails sent on this directory&rsquo;s behalf use its logo, fonts and header colours from the Branding tab. Edit the wording
        here. Leave a field as it is to keep the default.
      </p>

      <div role="tablist" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {SYSTEM_EMAILS.map((d) => (
          <button
            key={d.key}
            type="button"
            role="tab"
            aria-selected={d.key === activeKey}
            className={d.key === activeKey ? "btn btn-primary" : "btn"}
            onClick={() => setActiveKey(d.key)}
          >
            {d.label}
          </button>
        ))}
      </div>
      <p style={{ margin: "0 0 12px", fontSize: 13 }}>{def.when}</p>

      {loading ? <p style={{ fontSize: 13, opacity: 0.7 }}>Loading…</p> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, alignItems: "start" }}>
          <div>
            {field("Subject", "subject")}
            {field("Heading", "heading")}
            {field("Message", "body", { multiline: true })}
            {def.hasButton ? field("Button label", "buttonLabel", { max: 60 }) : null}
            <p style={{ fontSize: 12, opacity: 0.75, margin: "0 0 12px" }}>
              Placeholders: {def.placeholders.map((p) => <code key={p} style={{ marginRight: 6 }}>{`{{${p}}}`}</code>)}
              Blank lines start a new paragraph.{def.hasButton ? " The sign-in button and link are added automatically." : ""}
            </p>
            {canManage ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>Save</button>
                <button type="button" className="btn" disabled={busy} onClick={sendTest}>Send test to me</button>
                <button type="button" className="btn" disabled={busy || !rows[activeKey]} onClick={reset}>Reset to default</button>
              </div>
            ) : null}
            {msg ? <p style={{ color: "#15803d", fontSize: 13 }}>{msg}</p> : null}
            {err ? <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p> : null}
          </div>
          <div>
            <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600 }}>Preview (sample values)</p>
            {previewErr ? <p style={{ color: "#b91c1c", fontSize: 13 }}>{previewErr}</p> : null}
            <iframe
              title="Email preview"
              sandbox=""
              srcDoc={html}
              style={{ width: "100%", height: 560, border: "1px solid var(--lc-border)", borderRadius: 6, background: "#fff" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

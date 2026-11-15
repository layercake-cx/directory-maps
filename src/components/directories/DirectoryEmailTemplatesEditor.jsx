import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, Callout, Field, SegmentedControl, Section, Skeleton, TextInput, Textarea } from "../ui/index.js";
import "../../styles/wave-a/batch-1.css";
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
    <Field label={label}>
      {opts.multiline ? (
        <Textarea
          rows={9}
          value={text[name]}
          disabled={!canManage}
          onChange={(e) => setText((t) => ({ ...t, [name]: e.target.value }))}
        />
      ) : (
        <TextInput
          value={text[name]}
          disabled={!canManage}
          maxLength={opts.max ?? 200}
          onChange={(e) => setText((t) => ({ ...t, [name]: e.target.value }))}
        />
      )}
    </Field>
  );

  return (
    <Section
      title="System emails"
      description={<>Emails sent on this directory&rsquo;s behalf use its logo, fonts and header colours from the Branding tab. Edit the wording here. Leave a field as it is to keep the default.</>}
    >
      <SegmentedControl
        label="System email"
        value={activeKey}
        onChange={setActiveKey}
        options={SYSTEM_EMAILS.map((d) => ({ value: d.key, label: d.label }))}
      />
      <p>{def.when}</p>

      {loading ? <Skeleton variant="form" rows={4} label="Loading email templates" /> : (
        <div className="b1-split">
          <div className="b1-split-col">
            {field("Subject", "subject")}
            {field("Heading", "heading")}
            {field("Message", "body", { multiline: true })}
            {def.hasButton ? field("Button label", "buttonLabel", { max: 60 }) : null}
            <p className="field-hint b1-placeholders">
              Placeholders: {def.placeholders.map((p) => <code key={p}>{`{{${p}}}`}</code>)}
              Blank lines start a new paragraph.{def.hasButton ? " The sign-in button and link are added automatically." : ""}
            </p>
            {canManage ? (
              <div className="toolbar toolbar--wrap">
                <Button variant="primary" disabled={busy} onClick={save}>Save</Button>
                <Button disabled={busy} onClick={sendTest}>Send test to me</Button>
                <Button disabled={busy || !rows[activeKey]} onClick={reset}>Reset to default</Button>
              </div>
            ) : null}
            {msg ? <Callout tone="ok">{msg}</Callout> : null}
            {err ? <Callout tone="danger">{err}</Callout> : null}
          </div>
          <div className="b1-split-col">
            <h3 className="card-title">Preview (sample values)</h3>
            {previewErr ? <Callout tone="danger">{previewErr}</Callout> : null}
            <iframe
              title="Email preview"
              sandbox=""
              srcDoc={html}
              className="b1-email-preview"
            />
          </div>
        </div>
      )}
    </Section>
  );
}

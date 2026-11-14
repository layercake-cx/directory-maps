import React, { useEffect, useId, useState } from "react";
import { updateDirectory } from "../../lib/directories.js";
import { analyticsFormFromJson, analyticsJsonEqual, analyticsJsonFromForm } from "../../lib/directoryAnalytics.js";
import { Button, Callout, Checkbox, Field, Section, TextInput } from "../ui/index.js";
import "../../styles/wave-a/batch-1.css";

/**
 * Directory Settings tab — Analytics & Tracking (GA4 / GTM destinations).
 * Saved on directories.analytics_json; baked into the public site on next Publish.
 */
export default function DirectoryAnalyticsPanel({ directory, directoryId, canManage, recordEvent, onSaved }) {
  const formId = useId();
  const [form, setForm] = useState(() => analyticsFormFromJson(directory?.analytics_json));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setForm(analyticsFormFromJson(directory?.analytics_json));
  }, [directory]);

  function patch(partial) {
    setForm((f) => ({ ...f, ...partial }));
    setMsg("");
    setErr("");
  }

  async function handleSave(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    const parsed = analyticsJsonFromForm(form);
    if (!parsed.ok) {
      setErr(parsed.error);
      return;
    }
    try {
      setSaving(true);
      const prev = directory?.analytics_json ?? null;
      await updateDirectory(directoryId, { analytics_json: parsed.json });
      if (!analyticsJsonEqual(prev, parsed.json)) {
        recordEvent?.("directory_settings_updated", {
          directory_id: directoryId,
          changed_fields: ["analytics_json"],
        });
      }
      setMsg("Analytics settings saved. Republish for tags and the cookie banner to appear on the live site.");
      onSaved?.();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  const disabled = !canManage;

  return (
    <Section
      title="Analytics & Tracking"
      description="Optional Google Analytics 4 and Google Tag Manager IDs for this directory's published pages. Each can be turned on independently. The live site asks visitors for analytics consent before loading Google tags. First-party directory events are still recorded in Directory Maps (no personal data). Changes apply after you Publish."
      footer={canManage ? (
        <Button type="submit" form={formId} variant="primary" loading={saving} loadingLabel="Saving…">Save analytics</Button>
      ) : null}
    >
      <form id={formId} onSubmit={handleSave} className="b1-form">
        <Checkbox
          label="Enable Google Analytics 4"
          checked={form.ga4Enabled}
          onChange={(e) => patch({ ga4Enabled: e.target.checked })}
          disabled={disabled}
        />
        <Field label="GA4 Measurement ID" hint="From Google Analytics → Admin → Data streams.">
          <TextInput
            value={form.ga4MeasurementId}
            onChange={(e) => patch({ ga4MeasurementId: e.target.value })}
            disabled={disabled}
            placeholder="G-XXXXXXXXXX"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        <Checkbox
          label="Enable Google Tag Manager"
          checked={form.gtmEnabled}
          onChange={(e) => patch({ gtmEnabled: e.target.checked })}
          disabled={disabled}
        />
        <Field label="GTM Container ID" hint="From Google Tag Manager → your container. Directory events are pushed to the data layer after consent.">
          <TextInput
            value={form.gtmContainerId}
            onChange={(e) => patch({ gtmContainerId: e.target.value })}
            disabled={disabled}
            placeholder="GTM-XXXXXXX"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        {err ? <Callout tone="danger">{err}</Callout> : null}
        {msg ? <Callout tone="ok">{msg}</Callout> : null}
      </form>
    </Section>
  );
}

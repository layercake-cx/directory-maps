import React, { useEffect, useId, useState } from "react";
import { updateDirectory } from "../../lib/directories.js";
import { Button, Callout, Field, Section, TextInput } from "../ui/index.js";
import "../../styles/wave-a/batch-1.css";

/**
 * Directory Settings › General — title + home nav label.
 * Split from the SEO half (now DirectorySeoSettingsPanel.jsx) for the admin shell redesign's
 * Settings › General vs. Settings › SEO nav split (Phase 2) — same fields/save call as before,
 * just its own independent form/save button instead of sharing one with the SEO fields.
 */
export default function DirectoryGeneralSettingsPanel({ directory, directoryId, canManage, recordEvent, onSaved }) {
  const formId = useId();
  const [name, setName] = useState(directory?.name || "");
  const [homeNavLabel, setHomeNavLabel] = useState(directory?.home_nav_label || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setName(directory?.name || "");
    setHomeNavLabel(directory?.home_nav_label || "");
  }, [directory]);

  async function handleSave(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    const cleanName = name.trim();
    if (!cleanName) {
      setErr("Directory title is required.");
      return;
    }
    try {
      setSaving(true);
      const cleanHomeNav = homeNavLabel.trim();
      const changedFields = [];
      if (cleanName !== (directory?.name || "")) changedFields.push("name");
      if (cleanHomeNav !== (directory?.home_nav_label || "")) changedFields.push("home_nav_label");

      await updateDirectory(directoryId, {
        name: cleanName,
        home_nav_label: cleanHomeNav || null,
      });
      if (changedFields.length) {
        recordEvent?.("directory_settings_updated", { directory_id: directoryId, changed_fields: changedFields });
      }
      setMsg("Settings saved. Republish for changes to appear on the live site.");
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
      title="General settings"
      footer={canManage ? (
        <Button type="submit" form={formId} variant="primary" loading={saving} loadingLabel="Saving…">Save settings</Button>
      ) : null}
    >
      <form id={formId} onSubmit={handleSave} className="b1-form">
        <Field label="Directory title">
          <TextInput value={name} onChange={(e) => { setName(e.target.value); setMsg(""); }} disabled={disabled} />
        </Field>
        <Field
          label="Home navigation label"
          hint="Label for the directory landing page in the site header, mobile menu, breadcrumbs, and footer. Leave blank to use “Home”."
        >
          <TextInput
            value={homeNavLabel}
            onChange={(e) => { setHomeNavLabel(e.target.value); setMsg(""); }}
            disabled={disabled}
            placeholder="Home"
          />
        </Field>
        {err ? <Callout tone="danger">{err}</Callout> : null}
        {msg ? <Callout tone="ok">{msg}</Callout> : null}
      </form>
    </Section>
  );
}

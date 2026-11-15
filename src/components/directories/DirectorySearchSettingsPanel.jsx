import React, { useEffect, useId, useState } from "react";
import { updateDirectory } from "../../lib/directories.js";
import { Button, Callout, Checkbox, Section } from "../ui/index.js";
import "../../styles/wave-a/batch-1.css";

/**
 * Directory Settings tab — Location search.
 * Off by default. Takes effect on the published homepage after the next Publish.
 */
export default function DirectorySearchSettingsPanel({ directory, directoryId, canManage, recordEvent, onSaved }) {
  const formId = useId();
  const [enabled, setEnabled] = useState(!!directory?.location_search_enabled);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setEnabled(!!directory?.location_search_enabled);
  }, [directory?.location_search_enabled]);

  async function handleSave(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    try {
      setSaving(true);
      const prev = !!directory?.location_search_enabled;
      await updateDirectory(directoryId, { location_search_enabled: enabled });
      if (enabled !== prev) {
        recordEvent?.("directory_settings_updated", {
          directory_id: directoryId,
          changed_fields: ["location_search_enabled"],
        });
      }
      setMsg(enabled
        ? "Location search saved. Publish the directory for Distance from to appear on the live site."
        : "Location search saved. Publish the directory to remove Distance from from the live site.");
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
      title="Search"
      description={(
        <>
          Keyword search is always on. Location search adds a <strong>Distance from</strong> filter on the published homepage, and lets a search such as “ultimate frisbee near Stroud” fill that filter. It applies after you Publish.
        </>
      )}
      footer={canManage ? (
        <Button type="submit" form={formId} variant="primary" loading={saving} loadingLabel="Saving…">Save search settings</Button>
      ) : null}
    >
      <form id={formId} onSubmit={handleSave} className="b1-form">
        {err ? <Callout tone="danger">{err}</Callout> : null}
        {msg ? <Callout tone="ok">{msg}</Callout> : null}

        <Checkbox
          label="Location search"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            setMsg("");
            setErr("");
          }}
          disabled={disabled}
        />

        {!canManage ? <Callout tone="info">Only an Owner or Manager can change search settings.</Callout> : null}
      </form>
    </Section>
  );
}

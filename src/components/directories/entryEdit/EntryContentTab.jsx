import React, { useState } from "react";
import { Alert, Button, Group, Text } from "@mantine/core";
import { updateDirectoryEntry } from "../../../lib/directories.js";
import EvidenceItemsEditor from "../EvidenceItemsEditor.jsx";
import MediaAssetsEditor from "../MediaAssetsEditor.jsx";
import AccreditationsEditor from "../AccreditationsEditor.jsx";
import ProminentLinksEditor from "../ProminentLinksEditor.jsx";
import ProductTilesEditor from "../ProductTilesEditor.jsx";

const notesStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid var(--lc-border)",
  fontSize: 13,
  resize: "vertical",
};

/**
 * Content tab — notes plus the entry's existing sub-editors (evidence, media,
 * accreditations, links, product tiles), relocated from the old edit modal.
 * Notes is a plain HTML textarea for now; a WYSIWYG (and eventually a block
 * editor) replaces it in a later phase.
 */
export default function EntryContentTab({ directoryId, entryId, clientId, entry, canEdit, recordEvent, onSaved }) {
  const [notesHtml, setNotesHtml] = useState(entry?.notes_html || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function handleSaveNotes() {
    setErr("");
    try {
      setSaving(true);
      await updateDirectoryEntry(entryId, { notes_html: notesHtml, allow_html: true });
      recordEvent?.("directory_entry_updated", { directory_id: directoryId, entry_id: entryId });
      onSaved?.();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="admin-card" style={{ padding: 20 }}>
        <Text size="sm" fw={600} mb={4}>Notes</Text>
        <Text size="xs" c="dimmed" mb={10}>
          Plain HTML editor for now — a rich text (WYSIWYG) editor is coming in a later phase.
        </Text>
        <textarea value={notesHtml} onChange={(e) => setNotesHtml(e.target.value)} rows={8} disabled={!canEdit} style={notesStyle} />
        {err && <Alert color="red" variant="light" mt="xs">{err}</Alert>}
        {canEdit && (
          <Group justify="flex-end" mt="xs">
            <Button size="sm" onClick={handleSaveNotes} loading={saving}>Save notes</Button>
          </Group>
        )}
      </div>

      <EvidenceItemsEditor directoryId={directoryId} entryId={entryId} recordEvent={recordEvent} />
      <MediaAssetsEditor directoryId={directoryId} entryId={entryId} recordEvent={recordEvent} />
      {clientId && <AccreditationsEditor directoryId={directoryId} entryId={entryId} recordEvent={recordEvent} />}
      <ProminentLinksEditor entryId={entryId} recordEvent={recordEvent} title="Prominent links (this entry)" />
      <ProductTilesEditor directoryId={directoryId} entryId={entryId} recordEvent={recordEvent} />
    </div>
  );
}

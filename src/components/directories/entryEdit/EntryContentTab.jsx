import React, { useState } from "react";
import { Alert, Button, Group, Text } from "@mantine/core";
import { updateDirectoryEntry } from "../../../lib/directories.js";
import RichTextEditor from "./RichTextEditor.jsx";
import EvidenceItemsEditor from "../EvidenceItemsEditor.jsx";
import MediaAssetsEditor from "../MediaAssetsEditor.jsx";
import AccreditationsEditor from "../AccreditationsEditor.jsx";
import ProminentLinksEditor from "../ProminentLinksEditor.jsx";
import ProductTilesEditor from "../ProductTilesEditor.jsx";

/**
 * Content tab — notes plus the entry's existing sub-editors (evidence, media,
 * accreditations, links, product tiles), relocated from the old edit modal.
 * Notes uses a WYSIWYG editor (TipTap) whose formatting options are
 * restricted to exactly what sanitizeNotesHtml allows through on save.
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
        <Text size="sm" fw={600} mb={10}>Notes</Text>
        <RichTextEditor value={notesHtml} onChange={setNotesHtml} editable={canEdit} />
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

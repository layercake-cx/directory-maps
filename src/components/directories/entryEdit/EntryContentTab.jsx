import React, { useCallback, useEffect, useState } from "react";
import { Alert, Button, Group, Text } from "@mantine/core";
import {
  updateDirectoryEntry,
  generateEntryContent,
  listEntryContentVersions,
} from "../../../lib/directories.js";
import RichTextEditor from "./RichTextEditor.jsx";
import EvidenceItemsEditor from "../EvidenceItemsEditor.jsx";
import MediaAssetsEditor from "../MediaAssetsEditor.jsx";
import AccreditationsEditor from "../AccreditationsEditor.jsx";
import ProminentLinksEditor from "../ProminentLinksEditor.jsx";
import ProductTilesEditor from "../ProductTilesEditor.jsx";

const SOURCE_LABELS = {
  manual: "Manual edit",
  ai_manual: "AI-generated",
  ai_auto: "AI-generated (automatic)",
  ai_bulk: "AI-generated (bulk run)",
};

/**
 * Content tab — notes plus the entry's existing sub-editors (evidence, media,
 * accreditations, links, product tiles), relocated from the old edit modal.
 * Notes uses a WYSIWYG editor (TipTap) whose formatting options are
 * restricted to exactly what sanitizeNotesHtml allows through on save.
 *
 * AI content generation (docs/FEATURES.md §4.4g): "Generate with AI" calls
 * generate_entry_content directly — an explicit, single-entry request always
 * overwrites, unlike the automatic/bulk paths which respect the empty-content
 * rule. Every save (this button or "Save notes") is recoverable via the
 * version history list below, fetched from directory_entry_versions.
 */
export default function EntryContentTab({ directoryId, entryId, clientId, entry, canEdit, aiContentEnabled, recordEvent, onSaved }) {
  const [notesHtml, setNotesHtml] = useState(entry?.notes_html || "");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState("");

  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(true);

  const refreshVersions = useCallback(async () => {
    try {
      setVersionsLoading(true);
      setVersions(await listEntryContentVersions(entryId));
    } catch {
      /* non-fatal: history list just stays empty/stale */
    } finally {
      setVersionsLoading(false);
    }
  }, [entryId]);

  useEffect(() => { void refreshVersions(); }, [refreshVersions]);

  async function handleSaveNotes() {
    setErr("");
    try {
      setSaving(true);
      await updateDirectoryEntry(entryId, { notes_html: notesHtml, allow_html: true });
      recordEvent?.("directory_entry_updated", { directory_id: directoryId, entry_id: entryId });
      onSaved?.();
      await refreshVersions();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerate() {
    if (notesHtml.trim() && !window.confirm("This entry already has content — generating with AI will overwrite it. The current content stays recoverable in the version history below. Continue?")) {
      return;
    }
    setErr("");
    try {
      setGenerating(true);
      recordEvent?.("directory_ai_content_requested", { directory_id: directoryId, entry_id: entryId, source: clientId ? "client_portal" : "admin_dashboard" });
      const result = await generateEntryContent(entryId);
      setNotesHtml(result?.notes_html ?? "");
      recordEvent?.("directory_ai_content_generated", { directory_id: directoryId, entry_id: entryId });
      onSaved?.();
      await refreshVersions();
    } catch (e) {
      recordEvent?.("directory_ai_content_failed", { directory_id: directoryId, entry_id: entryId, error: e?.message ?? String(e) });
      setErr(e?.message ?? String(e));
    } finally {
      setGenerating(false);
    }
  }

  function handleRestore(version) {
    setNotesHtml(version.notes_html || "");
    recordEvent?.("directory_entry_content_restored", { directory_id: directoryId, entry_id: entryId, version_id: version.id });
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="admin-card" style={{ padding: 20 }}>
        <Group justify="space-between" mb={10}>
          <Text size="sm" fw={600}>Notes</Text>
          {canEdit && aiContentEnabled && (
            <Button size="xs" variant="light" onClick={handleGenerate} loading={generating}>Generate with AI</Button>
          )}
        </Group>
        <RichTextEditor value={notesHtml} onChange={setNotesHtml} editable={canEdit} />
        {err && <Alert color="red" variant="light" mt="xs">{err}</Alert>}
        {canEdit && (
          <Group justify="flex-end" mt="xs">
            <Button size="sm" onClick={handleSaveNotes} loading={saving}>Save notes</Button>
          </Group>
        )}

        {!versionsLoading && versions.length > 0 && (
          <div style={{ marginTop: 16, borderTop: "1px solid var(--lc-border)", paddingTop: 12 }}>
            <Text size="xs" fw={600} c="dimmed" mb={6}>Version history</Text>
            <div style={{ display: "grid", gap: 4, maxHeight: 180, overflowY: "auto" }}>
              {versions.map((v) => (
                <div key={v.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                  <span style={{ opacity: 0.75 }}>
                    {new Date(v.created_at).toLocaleString()} — {SOURCE_LABELS[v.source] ?? v.source}
                  </span>
                  <button
                    type="button"
                    className="btn"
                    style={{ fontSize: 11, padding: "2px 8px" }}
                    onClick={() => handleRestore(v)}
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          </div>
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

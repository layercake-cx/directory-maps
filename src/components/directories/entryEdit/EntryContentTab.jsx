import AIButton from "../../ai/AIButton.jsx";
import AiProvenanceNote from "../../ai/AiProvenanceNote.jsx";
import React, { useCallback, useEffect, useState } from "react";
import { Button, Callout, Section, useConfirm } from "../../ui/index.js";
import "../../../styles/wave-a/batch-2.css";
import { useAiFeature } from "../../../hooks/useAiFeature.js";
import AiUnavailableNotice from "../../../components/ai/AiUnavailableNotice.jsx";
import {
  updateDirectoryEntry,
  generateEntryContent,
  getDirectoryAiContentPrompt,
  listEntryContentVersions,
} from "../../../lib/directories.js";
import RichTextEditor from "./RichTextEditor.jsx";
import EvidenceItemsEditor from "../EvidenceItemsEditor.jsx";
import MediaAssetsEditor from "../MediaAssetsEditor.jsx";
import TeamMembersEditor from "../TeamMembersEditor.jsx";
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
  const ai = useAiFeature("content_generation");
  const confirm = useConfirm();
  const loadPrompt = useCallback(async () => ({ text: await getDirectoryAiContentPrompt(directoryId) }), [directoryId]);
  const [notesHtml, setNotesHtml] = useState(entry?.notes_html || "");
  const [saving, setSaving] = useState(false);
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
    if (notesHtml.trim() && !(await confirm({
      title: "Replace the current content?",
      body: "This entry already has content. Generating with AI will overwrite it. The current content stays recoverable in the version history below.",
      confirmLabel: "Generate and replace",
      tone: "danger",
    }))) {
      return false;
    }
    setErr("");
    try {
      recordEvent?.("directory_ai_content_requested", { directory_id: directoryId, entry_id: entryId, source: clientId ? "client_portal" : "admin_dashboard" });
      const result = await generateEntryContent(entryId);
      setNotesHtml(result?.notes_html ?? "");
      recordEvent?.("directory_ai_content_generated", { directory_id: directoryId, entry_id: entryId });
      onSaved?.();
      await refreshVersions();
    } catch (e) {
      recordEvent?.("directory_ai_content_failed", { directory_id: directoryId, entry_id: entryId, error: e?.message ?? String(e) });
      setErr(e?.message ?? String(e));
      return false;
    }
  }

  function handleRestore(version) {
    setNotesHtml(version.notes_html || "");
    recordEvent?.("directory_entry_content_restored", { directory_id: directoryId, entry_id: entryId, version_id: version.id });
  }

  return (
    <div className="editor-stack">
      <Section
        title="Notes"
        actions={canEdit && aiContentEnabled ? <AIButton compact onGenerate={handleGenerate} disabled={!ai.available} /> : null}
        footer={canEdit ? (
          <Button variant="primary" onClick={handleSaveNotes} loading={saving} loadingLabel="Saving…">Save notes</Button>
        ) : null}
      >
        {canEdit && aiContentEnabled && (
          <AiProvenanceNote entityName="entry" compact loadPrompt={loadPrompt} onGenerateFromModal={handleGenerate} canGenerate={ai.available}>
            AI drafts this from the details held for this entry, following a drafting prompt set by the directory's administrators. Generating replaces the text below, and the previous version stays in the history.{" "}
          </AiProvenanceNote>
        )}
        {canEdit && aiContentEnabled && !ai.available && <AiUnavailableNotice message={ai.message} href={ai.integrationsHref} />}
        <RichTextEditor value={notesHtml} onChange={setNotesHtml} editable={canEdit} />
        {err && <Callout tone="danger">{err}</Callout>}

        {!versionsLoading && versions.length > 0 && (
          <div className="version-list">
            <h3 className="preview-caption">Version history</h3>
            <div className="version-list-items">
              {versions.map((v) => (
                <div key={v.id} className="version-row">
                  <span>
                    {new Date(v.created_at).toLocaleString()} — {SOURCE_LABELS[v.source] ?? v.source}
                  </span>
                  <Button size="sm" onClick={() => handleRestore(v)}>Restore</Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      <EvidenceItemsEditor directoryId={directoryId} entryId={entryId} recordEvent={recordEvent} />
      <MediaAssetsEditor directoryId={directoryId} entryId={entryId} recordEvent={recordEvent} />
      <TeamMembersEditor directoryId={directoryId} entryId={entryId} recordEvent={recordEvent} />
      {clientId && <AccreditationsEditor directoryId={directoryId} entryId={entryId} recordEvent={recordEvent} />}
      <ProminentLinksEditor entryId={entryId} recordEvent={recordEvent} title="Prominent links (this entry)" />
      <ProductTilesEditor directoryId={directoryId} entryId={entryId} recordEvent={recordEvent} />
    </div>
  );
}

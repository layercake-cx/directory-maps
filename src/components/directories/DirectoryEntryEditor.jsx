import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getDirectoryEntry } from "../../lib/directories.js";
import EntryEditSubNav from "./entryEdit/EntryEditSubNav.jsx";
import EntryBasicInfoTab from "./entryEdit/EntryBasicInfoTab.jsx";
import EntryCategoriesTab from "./entryEdit/EntryCategoriesTab.jsx";
import EntryContentTab from "./entryEdit/EntryContentTab.jsx";
import EntrySeoTab from "./entryEdit/EntrySeoTab.jsx";
import EntryPanelTab from "./entryEdit/EntryPanelTab.jsx";
import EntryPreviewPublishTab from "./entryEdit/EntryPreviewPublishTab.jsx";

/**
 * Full-page tabbed directory entry editor — replaces the old entry edit
 * modal. Shared between admin and client portal (DirectoryEntriesPanel is
 * the peer list view that now navigates here instead of opening a modal).
 *
 * entryId === "new" renders just the Basic Info tab as a create form; other
 * tabs stay disabled until the entry exists (they operate on entryId).
 */
export default function DirectoryEntryEditor({
  clientId,
  directoryId,
  entryId,
  tab = "basic",
  canEdit = true,
  recordEvent,
  basePath,
  backPath,
  backLabel = "Back to entries",
}) {
  const navigate = useNavigate();
  const isNew = entryId === "new";
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [err, setErr] = useState("");

  const reload = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    try {
      setEntry(await getDirectoryEntry(entryId));
      setErr("");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [entryId, isNew]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const entryBasePath = `${basePath}/entries/${encodeURIComponent(entryId)}`;

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Link to={backPath}>← {backLabel}</Link>
      </div>

      <h2 style={{ margin: "0 0 4px" }}>
        {isNew ? "New entry" : loading ? "Loading…" : entry?.name || "Entry"}
      </h2>
      {!isNew && entry && (
        <p style={{ margin: "0 0 16px", fontSize: 13, opacity: 0.7 }}>
          {entry.is_active ? "Active" : "Hidden"}{entry.address ? ` · ${entry.address}` : ""}
        </p>
      )}
      {isNew && (
        <p style={{ margin: "0 0 16px", fontSize: 13, opacity: 0.7 }}>
          Save the basic info to unlock categories, content, search metadata, panel style and preview.
        </p>
      )}

      <EntryEditSubNav basePath={entryBasePath} activeTab={isNew ? "basic" : tab} disabled={isNew} />

      {!isNew && loading ? (
        <p>Loading…</p>
      ) : !isNew && err ? (
        <p style={{ color: "#b91c1c" }}>{err}</p>
      ) : !isNew && !entry ? (
        <p>Entry not found.</p>
      ) : (
        <>
          {(isNew || tab === "basic") && (
            <EntryBasicInfoTab
              directoryId={directoryId}
              entryId={entryId}
              entry={entry}
              isNew={isNew}
              canEdit={canEdit}
              recordEvent={recordEvent}
              onSaved={reload}
              onCreated={(newId) => navigate(`${basePath}/entries/${newId}`)}
            />
          )}
          {!isNew && tab === "categories" && clientId && (
            <EntryCategoriesTab clientId={clientId} directoryId={directoryId} entryId={entryId} canEdit={canEdit} recordEvent={recordEvent} />
          )}
          {!isNew && tab === "content" && (
            <EntryContentTab directoryId={directoryId} entryId={entryId} clientId={clientId} entry={entry} canEdit={canEdit} recordEvent={recordEvent} onSaved={reload} />
          )}
          {!isNew && tab === "seo" && (
            <EntrySeoTab directoryId={directoryId} entryId={entryId} entry={entry} canEdit={canEdit} recordEvent={recordEvent} onSaved={reload} />
          )}
          {!isNew && tab === "panel" && <EntryPanelTab />}
          {!isNew && tab === "preview" && <EntryPreviewPublishTab backPath={backPath} />}
        </>
      )}
    </div>
  );
}

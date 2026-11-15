import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getDirectoryEntry, isDirectoryAiContentEnabled } from "../../lib/directories.js";
import { entryEditTabs } from "./entryEdit/EntryEditSubNav.jsx";
import { Button, EmptyState, ErrorState, Pill, RecordLayout, Skeleton } from "../ui/index.js";
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
  const [aiContentEnabled, setAiContentEnabled] = useState(false);

  useEffect(() => {
    isDirectoryAiContentEnabled(directoryId).then(setAiContentEnabled).catch(() => {});
  }, [directoryId]);

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

  const title = isNew ? "New entry" : loading ? "Loading…" : entry?.name || "Entry";
  const subtitle = isNew
    ? "Save the basic info to unlock categories, content, search metadata, panel style and preview."
    : entry?.address || undefined;
  const status = !isNew && entry ? <Pill tone={entry.is_active ? "ok" : "neutral"}>{entry.is_active ? "Active" : "Hidden"}</Pill> : null;
  const head = {
    title,
    subtitle,
    status,
    breadcrumb: [{ label: backLabel, to: backPath }, { label: title }],
  };
  const tabs = isNew ? undefined : { tabs: entryEditTabs(entryBasePath), current: tab, label: "Entry sections" };

  return (
    <RecordLayout head={head} tabs={tabs}>
      {!isNew && loading ? (
        <Skeleton variant="form" rows={5} label="Loading entry" />
      ) : !isNew && err ? (
        <ErrorState title="We couldn't load this entry" body={`${err} Nothing has been lost.`} onRetry={reload} />
      ) : !isNew && !entry ? (
        <EmptyState
          art="searching"
          title="Entry not found"
          body="It may have been deleted, or the link may be out of date."
          actions={<Button as={Link} to={backPath} variant="primary">{backLabel}</Button>}
        />
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
            <EntryContentTab
              directoryId={directoryId}
              entryId={entryId}
              clientId={clientId}
              entry={entry}
              canEdit={canEdit}
              aiContentEnabled={aiContentEnabled}
              recordEvent={recordEvent}
              onSaved={reload}
            />
          )}
          {!isNew && tab === "seo" && (
            <EntrySeoTab directoryId={directoryId} entryId={entryId} entry={entry} canEdit={canEdit} recordEvent={recordEvent} onSaved={reload} />
          )}
          {!isNew && tab === "panel" && (
            <EntryPanelTab directoryId={directoryId} entryId={entryId} entry={entry} canEdit={canEdit} recordEvent={recordEvent} onSaved={reload} />
          )}
          {!isNew && tab === "preview" && (
            <EntryPreviewPublishTab directoryId={directoryId} entryId={entryId} entry={entry} canEdit={canEdit} recordEvent={recordEvent} />
          )}
        </>
      )}
    </RecordLayout>
  );
}

import React from "react";
import { useParams } from "react-router-dom";
import { useDirectory } from "../../hooks/useDirectory.js";
import FocusedBlockEditor from "../blockEditor/FocusedBlockEditor.jsx";

/**
 * /…/directories/:directoryId/edit/entry/:id and /edit/page/:id — the focused editor. The layouts above this route
 * render it with no app navigation (see AdminDirectoryPanelLayout and ClientLayout); the directory context still
 * provides the directory, the signed-in user's rights and the admin-event recorder.
 */
export default function DirectoryFocusedEditorRoute() {
  const { kind, id } = useParams();
  const { directoryId, basePath, canEditEntries, canManage, recordEvent } = useDirectory();
  const isEntry = kind === "entry";
  const pageKind = isEntry ? "entry" : kind === "page" ? "content_page" : null;
  if (!pageKind) return <p>Unknown page type.</p>;
  const backHref = isEntry ? `${basePath}/entries/${encodeURIComponent(id)}/content` : `${basePath}/pages`;
  return (
    <FocusedBlockEditor
      key={`${pageKind}:${id}`}
      kind={pageKind}
      id={id}
      directoryId={directoryId}
      backHref={backHref}
      canEdit={isEntry ? canEditEntries : canManage}
      recordEvent={recordEvent}
    />
  );
}

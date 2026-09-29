import React from "react";
import { useParams } from "react-router-dom";
import { useDirectory } from "../../hooks/useDirectory.js";
import DirectoryEntryEditor from "../../components/directories/DirectoryEntryEditor.jsx";

/**
 * Renders inside AdminDirectoryPanelLayout's <AdminLayout>/<DirectoryAccessGuard> (Phase 2) —
 * no longer wraps its own <AdminLayout> (that produced a duplicate shell once this became a
 * child of the shared directory-panel route). Directory/client data now come from
 * DirectoryContext instead of a second, duplicate fetch.
 */
export default function AdminDirectoryEntryEdit({ tab = "basic" }) {
  const { entryId } = useParams();
  const { directoryId, clientId, basePath, recordEvent } = useDirectory();

  return (
    <DirectoryEntryEditor
      clientId={clientId}
      directoryId={directoryId}
      entryId={entryId}
      tab={tab}
      canEdit
      recordEvent={recordEvent}
      basePath={basePath}
      backPath={basePath}
      backLabel="Back to directory"
    />
  );
}

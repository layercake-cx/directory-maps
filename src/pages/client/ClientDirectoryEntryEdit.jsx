import React from "react";
import { useParams } from "react-router-dom";
import { useDirectory } from "../../hooks/useDirectory.js";
import DirectoryEntryEditor from "../../components/directories/DirectoryEntryEditor.jsx";

/**
 * Renders inside ClientLayout's shared AppShell/DirectoryAccessGuard (Phase 2) — permission
 * checking and directory fetch now come from DirectoryContext instead of this component's own
 * duplicate getContactDirectoryPermission call.
 */
export default function ClientDirectoryEntryEdit({ tab = "basic" }) {
  const { entryId } = useParams();
  const { directoryId, clientId, basePath, canEditEntries, recordEvent } = useDirectory();

  return (
    <DirectoryEntryEditor
      clientId={clientId}
      directoryId={directoryId}
      entryId={entryId}
      tab={tab}
      canEdit={canEditEntries}
      recordEvent={recordEvent}
      basePath={basePath}
      backPath={basePath}
      backLabel="Back to directory"
    />
  );
}

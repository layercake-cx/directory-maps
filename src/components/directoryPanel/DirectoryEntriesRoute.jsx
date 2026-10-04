import React from "react";
import { useDirectory } from "../../hooks/useDirectory.js";
import DirectoryEntriesPanel from "../directories/DirectoryEntriesPanel.jsx";

/** Content › Entries. AI content generation lives separately under Content › AI enrichment. */
export default function DirectoryEntriesRoute() {
  const { directoryId, clientId, basePath, canEditEntries, recordEvent } = useDirectory();
  return (
    <DirectoryEntriesPanel
      directoryId={directoryId}
      directoryBasePath={basePath}
      clientId={clientId}
      canEdit={canEditEntries}
      recordEvent={recordEvent}
    />
  );
}

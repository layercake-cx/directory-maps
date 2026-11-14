import React from "react";
import { useDirectory } from "../../hooks/useDirectory.js";
import DirectoryAiContentPanel from "../directories/DirectoryAiContentPanel.jsx";
import RequireManage from "./RequireManage.jsx";
import { AskPipLink } from "../ui/index.js";

/**
 * Content › AI enrichment. Claude-written entry content (prompt + bulk generate), split out of the
 * Entries page so Entries is only the entries table. Owner/manager-only, as it was on Entries.
 */
export default function DirectoryAiEnrichmentRoute() {
  const { directory, directoryId, canManage, recordEvent, refetch } = useDirectory();
  return (
    <RequireManage>
      <div className="card card-pad">
        <p className="card-title">AI enrichment</p>
        <AskPipLink question="Can you write summaries for entries that don't have one?" context="AI enrichment" />
        <DirectoryAiContentPanel
          directory={directory}
          directoryId={directoryId}
          canManage={canManage}
          recordEvent={recordEvent}
          onSaved={refetch}
        />
      </div>
    </RequireManage>
  );
}

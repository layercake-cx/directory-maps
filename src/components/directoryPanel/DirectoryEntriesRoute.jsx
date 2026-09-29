import React from "react";
import { useDirectory } from "../../hooks/useDirectory.js";
import DirectoryEntriesPanel from "../directories/DirectoryEntriesPanel.jsx";
import DirectoryAiContentPanel from "../directories/DirectoryAiContentPanel.jsx";

/**
 * Content › Entries. `DirectoryAiContentPanel` ("AI content generation") is stacked above the
 * entries table rather than literally an in-page action/drawer inside `DirectoryEntriesPanel`
 * itself (IA §6 describes it as "an 'AI content' action/drawer on this page") — keeps the
 * 790-line `DirectoryEntriesPanel` a true unmodified move, per the brief's "move, don't rewrite"
 * rule, while still surfacing AI content generation from this page. Kept manager-only, matching
 * its old placement inside the canManage-only "ai_content" tab.
 */
export default function DirectoryEntriesRoute() {
  const { directory, directoryId, clientId, basePath, canManage, canEditEntries, recordEvent, refetch } = useDirectory();
  return (
    <>
      {canManage && (
        <div className="admin-card" style={{ marginBottom: 16 }}>
          <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>AI content generation</p>
          <DirectoryAiContentPanel
            directory={directory}
            directoryId={directoryId}
            canManage={canManage}
            recordEvent={recordEvent}
            onSaved={refetch}
          />
        </div>
      )}
      <DirectoryEntriesPanel
        directoryId={directoryId}
        directoryBasePath={basePath}
        clientId={clientId}
        canEdit={canEditEntries}
        recordEvent={recordEvent}
      />
    </>
  );
}

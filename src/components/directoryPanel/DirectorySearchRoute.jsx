import React from "react";
import { useDirectory } from "../../hooks/useDirectory.js";
import DirectorySearchSettingsPanel from "../directories/DirectorySearchSettingsPanel.jsx";
import DirectoryAiSearchPanel from "../directories/DirectoryAiSearchPanel.jsx";

/**
 * Experience › Search & Discovery — location-search toggle (visible to any user with access,
 * matching its old placement inside the always-visible "settings" tab) + "Help me choose" AI
 * search config (kept manager-only, matching its old placement inside the canManage-only
 * "ai_content" tab — see the Phase 2 plan's permission matrix).
 */
export default function DirectorySearchRoute() {
  const { directory, directoryId, canManage, recordEvent, refetch } = useDirectory();

  return (
    <>
      <div className="admin-card" style={{ marginBottom: 16 }}>
        <DirectorySearchSettingsPanel
          directory={directory}
          directoryId={directoryId}
          canManage={canManage}
          recordEvent={recordEvent}
          onSaved={refetch}
        />
      </div>

      {canManage && (
        <div className="admin-card">
          <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Help me choose</p>
          <DirectoryAiSearchPanel
            directory={directory}
            directoryId={directoryId}
            canManage={canManage}
            recordEvent={recordEvent}
            onSaved={refetch}
          />
        </div>
      )}
    </>
  );
}

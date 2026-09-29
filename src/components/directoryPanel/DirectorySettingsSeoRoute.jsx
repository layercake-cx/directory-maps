import React from "react";
import { useDirectory } from "../../hooks/useDirectory.js";
import DirectorySeoSettingsPanel from "../directories/DirectorySeoSettingsPanel.jsx";
import DirectoryAiSeoMetadataPanel from "../directories/DirectoryAiSeoMetadataPanel.jsx";

/**
 * Settings › SEO. The AI backfill section keeps its own `canManage` guard even though this route
 * itself is visible to any user with access (matching the always-visible SEO fields) — it was
 * hidden entirely from non-managers before Phase 2 (inside the canManage-only "ai_content" tab),
 * so it stays hidden here too, just relocated.
 */
export default function DirectorySettingsSeoRoute() {
  const { directory, directoryId, canManage, recordEvent, refetch } = useDirectory();
  return (
    <>
      <div className="admin-card" style={{ marginBottom: 16 }}>
        <DirectorySeoSettingsPanel
          directory={directory}
          directoryId={directoryId}
          canManage={canManage}
          recordEvent={recordEvent}
          onSaved={refetch}
        />
      </div>

      {canManage && (
        <div className="admin-card">
          <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>SEO metadata backfill</p>
          <DirectoryAiSeoMetadataPanel directoryId={directoryId} canManage={canManage} recordEvent={recordEvent} />
        </div>
      )}
    </>
  );
}

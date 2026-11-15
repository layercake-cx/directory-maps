import React from "react";
import { useDirectory } from "../../hooks/useDirectory.js";
import DirectorySearchSettingsPanel from "../directories/DirectorySearchSettingsPanel.jsx";
import DirectoryAiSearchPanel from "../directories/DirectoryAiSearchPanel.jsx";
import { AskPipLink, SettingsLayout } from "../ui/index.js";

/**
 * Experience › Search & Discovery — location-search toggle (visible to any user with access,
 * matching its old placement inside the always-visible "settings" tab) + "Help me choose" AI
 * search config (kept manager-only, matching its old placement inside the canManage-only
 * "ai_content" tab — see the Phase 2 plan's permission matrix).
 */
export default function DirectorySearchRoute() {
  const { directory, directoryId, canManage, recordEvent, refetch } = useDirectory();

  return (
    <SettingsLayout
      head={{
        title: "Search & Discovery",
        actions: <AskPipLink question="How does plain-English search work?" context="Search" />,
      }}
    >
      <DirectorySearchSettingsPanel
        directory={directory}
        directoryId={directoryId}
        canManage={canManage}
        recordEvent={recordEvent}
        onSaved={refetch}
      />

      {canManage && (
        <DirectoryAiSearchPanel
          directory={directory}
          directoryId={directoryId}
          canManage={canManage}
          recordEvent={recordEvent}
          onSaved={refetch}
        />
      )}
    </SettingsLayout>
  );
}

import React from "react";
import { useDirectory } from "../../hooks/useDirectory.js";
import DirectoryAnalyticsPanel from "../directories/DirectoryAnalyticsPanel.jsx";

/** Settings › Integrations — GA4/GTM tracking config (do not confuse with Insights). */
export default function DirectoryIntegrationsRoute() {
  const { directory, directoryId, canManage, recordEvent, refetch } = useDirectory();
  return (
    <div className="card card-pad">
      <DirectoryAnalyticsPanel
        directory={directory}
        directoryId={directoryId}
        canManage={canManage}
        recordEvent={recordEvent}
        onSaved={refetch}
      />
    </div>
  );
}

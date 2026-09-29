import React from "react";
import { useDirectory } from "../../hooks/useDirectory.js";
import DirectoryBrandingPanel from "../directories/DirectoryBrandingPanel.jsx";
import EntryLayoutDesigner from "../directories/EntryLayoutDesigner.jsx";
import RequireManage from "./RequireManage.jsx";

/** Experience › Design — Branding + Entry layout, stacked as two sections (IA §6). */
export default function DirectoryDesignRoute() {
  const { directory, directoryId, clientId, canManage, recordEvent, refetch } = useDirectory();

  return (
    <RequireManage>
      <div className="admin-card" style={{ marginBottom: 16 }}>
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Branding</p>
        <DirectoryBrandingPanel
          directory={directory}
          directoryId={directoryId}
          clientId={clientId}
          canManage={canManage}
          recordEvent={recordEvent}
          onSaved={refetch}
        />
      </div>

      <div className="admin-card">
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Entry layout</p>
        <EntryLayoutDesigner directoryId={directoryId} canManage={canManage} recordEvent={recordEvent} />
      </div>
    </RequireManage>
  );
}

import React from "react";
import { useDirectory } from "../../hooks/useDirectory.js";
import DirectoryClaimsPanel from "../directories/DirectoryClaimsPanel.jsx";
import RequireManage from "./RequireManage.jsx";

export default function DirectoryClaimsRoute() {
  const { directoryId, clientId, canManage, recordEvent, isAdminView } = useDirectory();
  return (
    <RequireManage>
      <DirectoryClaimsPanel
        directoryId={directoryId}
        clientId={clientId}
        canManage={canManage}
        recordEvent={recordEvent}
        eventSource={isAdminView ? "admin_dashboard" : "client_portal"}
      />
    </RequireManage>
  );
}

import React from "react";
import { useDirectory } from "../../hooks/useDirectory.js";
import DirectoryEnquiryPanel from "../directories/DirectoryEnquiryPanel.jsx";
import RequireManage from "./RequireManage.jsx";

export default function DirectoryEnquiriesRoute() {
  const { directory, directoryId, clientId, client, canManage, recordEvent, refetch, isAdminView } = useDirectory();
  return (
    <RequireManage>
      <DirectoryEnquiryPanel
        directory={directory}
        directoryId={directoryId}
        clientId={clientId}
        clientName={client?.name}
        canManage={canManage}
        recordEvent={recordEvent}
        eventSource={isAdminView ? "admin_dashboard" : "client_portal"}
        onSaved={refetch}
      />
    </RequireManage>
  );
}

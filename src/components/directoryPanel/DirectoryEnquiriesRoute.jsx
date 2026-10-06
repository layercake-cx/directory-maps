import React from "react";
import { useDirectory } from "../../hooks/useDirectory.js";
import DirectoryEnquiryPanel from "../directories/DirectoryEnquiryPanel.jsx";
import RequireManage from "./RequireManage.jsx";

/** Emails › Email settings (`section="settings"`) and Emails › Email log (`section="log"`). */
export default function DirectoryEnquiriesRoute({ section = "settings" }) {
  const { directory, directoryId, clientId, client, canManage, recordEvent, refetch, isAdminView } = useDirectory();
  return (
    <RequireManage>
      <DirectoryEnquiryPanel
        directory={directory}
        directoryId={directoryId}
        clientId={clientId}
        clientName={client?.name}
        section={section}
        canManage={canManage}
        recordEvent={recordEvent}
        eventSource={isAdminView ? "admin_dashboard" : "client_portal"}
        onSaved={refetch}
      />
    </RequireManage>
  );
}

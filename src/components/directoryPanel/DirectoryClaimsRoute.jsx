import React from "react";
import { useDirectory } from "../../hooks/useDirectory.js";
import DirectoryClaimsPanel from "../directories/DirectoryClaimsPanel.jsx";
import RequireManage from "./RequireManage.jsx";
import { PageLayout } from "../ui/index.js";

export default function DirectoryClaimsRoute() {
  const { directoryId, clientId, canManage, recordEvent, isAdminView } = useDirectory();
  return (
    <PageLayout head={{ title: "Claims" }}>
      <RequireManage>
        <DirectoryClaimsPanel
          directoryId={directoryId}
          clientId={clientId}
          canManage={canManage}
          recordEvent={recordEvent}
          eventSource={isAdminView ? "admin_dashboard" : "client_portal"}
        />
      </RequireManage>
    </PageLayout>
  );
}

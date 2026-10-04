import React from "react";
import { useDirectory } from "../../hooks/useDirectory.js";
import DomainSettings from "../DomainSettings.jsx";
import RequireManage from "./RequireManage.jsx";

/** Settings › Domain — this directory's custom domains (DomainSettings scoped to the directory). */
export default function DirectoryDomainRoute() {
  const { directoryId, clientId, client, isAdminView } = useDirectory();
  return (
    <RequireManage>
      <div className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Domain</h1>
        </div>
      </div>
      <DomainSettings
        clientId={clientId}
        clientName={client?.name}
        eventSource={isAdminView ? "admin_dashboard" : "client_portal"}
        directoryId={directoryId}
      />
    </RequireManage>
  );
}

import React from "react";
import { useDirectory } from "../../hooks/useDirectory.js";
import DomainSettings from "../DomainSettings.jsx";
import RequireManage from "./RequireManage.jsx";
import { SettingsLayout } from "../ui/index.js";

/** Settings › Domain — this directory's custom domains (DomainSettings scoped to the directory). */
export default function DirectoryDomainRoute() {
  const { directoryId, clientId, client, isAdminView } = useDirectory();
  return (
    <RequireManage>
      <SettingsLayout head={{ title: "Domain" }}>
        <DomainSettings
          clientId={clientId}
          clientName={client?.name}
          eventSource={isAdminView ? "admin_dashboard" : "client_portal"}
          directoryId={directoryId}
        />
      </SettingsLayout>
    </RequireManage>
  );
}

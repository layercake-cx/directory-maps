import React from "react";
import { useClient } from "../../hooks/useClient.js";
import { canManageOrg } from "../../lib/clientAuth.js";
import DirectoriesDashboard from "../../components/directories/DirectoriesDashboard.jsx";

export default function ClientDirectories() {
  const { client, contact } = useClient();
  return (
    <div className="page-main">
      <DirectoriesDashboard
        clientId={client?.id}
        canManage={canManageOrg(contact)}
        basePath="/client/directories"
        newHref="/client/directories/new"
      />
    </div>
  );
}

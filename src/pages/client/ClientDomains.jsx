import React from "react";
import { useClient } from "../../hooks/useClient.js";
import DomainSettings from "../../components/DomainSettings.jsx";

export default function ClientDomains() {
  const { client, contact } = useClient();
  const canManage = contact?.is_primary || contact?.can_manage_maps;

  if (!canManage) {
    return (
      <div className="card card-pad" style={{ marginTop: 16 }}>
        <p style={{ margin: 0 }}>
          You don&apos;t have permission to configure domains. Ask your account owner or someone with
          &quot;Manage maps&quot; access.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Domains</h1>
        </div>
      </div>
      <DomainSettings clientId={client.id} clientName={client?.name} eventSource="client_portal" />
    </>
  );
}

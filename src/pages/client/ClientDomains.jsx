import React from "react";
import { useClient } from "../../hooks/useClient.js";
import PageHead from "../../components/shell/PageHead.jsx";
import { DOMAINS_SUBTITLE } from "../../lib/clientDomains.js";
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
      <PageHead title="Domains" subtitle={DOMAINS_SUBTITLE} />
      <DomainSettings clientId={client.id} clientName={client?.name} eventSource="client_portal" />
    </>
  );
}

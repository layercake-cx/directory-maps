import React from "react";
import { useClient } from "../../hooks/useClient.js";
import { Callout, PageLayout } from "../../components/ui/index.js";
import { DOMAINS_SUBTITLE } from "../../lib/clientDomains.js";
import DomainSettings from "../../components/DomainSettings.jsx";

export default function ClientDomains() {
  const { client, contact } = useClient();
  const canManage = contact?.is_primary || contact?.can_manage_maps;

  if (!canManage) {
    return (
      <PageLayout head={{ title: "Domains" }}>
        <Callout tone="warn">
          You don&apos;t have permission to configure domains. Ask your account owner or someone with
          &quot;Manage maps&quot; access.
        </Callout>
      </PageLayout>
    );
  }

  return (
    <PageLayout head={{ title: "Domains", subtitle: DOMAINS_SUBTITLE }}>
      <DomainSettings clientId={client.id} clientName={client?.name} eventSource="client_portal" />
    </PageLayout>
  );
}

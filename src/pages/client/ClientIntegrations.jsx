import React from "react";
import { useClient } from "../../hooks/useClient.js";
import { Callout, PageLayout } from "../../components/ui/index.js";
import IntegrationsPanel from "../../components/integrations/IntegrationsPanel.jsx";

export default function ClientIntegrations() {
  const { client, contact } = useClient();
  const canManage = contact?.is_primary || contact?.can_manage_maps;

  if (!canManage) {
    return (
      <PageLayout head={{ title: "Integrations" }}>
        <Callout tone="warn">
          You don&apos;t have permission to manage integrations. Ask your account owner or someone with
          &quot;Manage maps&quot; access.
        </Callout>
      </PageLayout>
    );
  }

  return (
    <IntegrationsPanel
      clientId={client.id}
      clientName={client?.name}
      eventSource="client_portal"
    />
  );
}

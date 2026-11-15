import React from "react";
import { useClient } from "../../hooks/useClient.js";
import MessagingPanel from "../../components/MessagingPanel.jsx";
import { Callout, PageLayout } from "../../components/ui/index.js";
import "../../styles/wave-b/messaging.css";

export default function ClientEmail() {
  const { client, contact } = useClient();
  const canManage = contact?.is_primary || contact?.can_manage_maps;

  if (!canManage) {
    return (
      <PageLayout head={{ title: "Messaging" }}>
        <Callout tone="info">
          You don&apos;t have permission to configure messaging. Ask your account owner or someone with
          &quot;Manage maps&quot; access.
        </Callout>
      </PageLayout>
    );
  }

  return (
    <MessagingPanel
      clientId={client.id}
      clientName={client?.name}
      eventSource="client_portal"
    />
  );
}

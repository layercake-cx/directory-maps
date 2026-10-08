import React from "react";
import { useClient } from "../../hooks/useClient.js";
import MessagingPanel from "../../components/MessagingPanel.jsx";

export default function ClientEmail() {
  const { client, contact } = useClient();
  const canManage = contact?.is_primary || contact?.can_manage_maps;

  if (!canManage) {
    return (
      <div className="card card-pad" style={{ marginTop: 16 }}>
        <p style={{ margin: 0 }}>
          You don&apos;t have permission to configure messaging. Ask your account owner or someone with
          &quot;Manage maps&quot; access.
        </p>
      </div>
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

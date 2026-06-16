import React from "react";
import { useClient } from "../../hooks/useClient.js";
import MessagingPanel from "../../components/MessagingPanel.jsx";
import styles from "./ClientEmail.module.css";

export default function ClientEmail() {
  const { client, contact } = useClient();
  const canManage = contact?.is_primary || contact?.can_manage_maps;

  if (!canManage) {
    return (
      <div className="page-main">
        <div className="admin-card" style={{ marginTop: 16 }}>
          <p>
            You don&apos;t have permission to configure messaging. Ask your account owner or someone with
            &quot;Manage maps&quot; access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-main">
      <div className={`admin-card ${styles.card}`}>
        <MessagingPanel
          clientId={client.id}
          clientName={client?.name}
          eventSource="client_portal"
          showPageTitle
        />
      </div>
    </div>
  );
}

import React, { useState } from "react";
import AiProvidersTab from "./AiProvidersTab.jsx";
import AiFeaturesConfig from "./AiFeaturesConfig.jsx";
import AiUsageTab from "./AiUsageTab.jsx";
import styles from "../../pages/client/ClientEmail.module.css";

const COMING_SOON = ["Analytics", "Payments", "CRM", "Identity & SSO", "Data & webhooks"];

/**
 * Platform Integrations hub: the external services an organisation has connected to Layercake,
 * shared by every Layercake product (client portal and admin customer detail). Connection
 * management lives here; how each product uses a connection is configured in the product.
 */
export default function IntegrationsPanel({
  clientId,
  clientName = "",
  eventSource = "client_portal",
}) {
  const [tab, setTab] = useState("ai");
  // Bumped when a provider is connected/disconnected so the feature configuration reloads.
  const [connectionsVersion, setConnectionsVersion] = useState(0);

  return (
    <>
      <div className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Integrations</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--shell-text-muted)" }}>
            Connect external services once and use them across Layercake products. Layercake provides the
            capabilities; you pay your provider directly for what they use.
          </p>
        </div>
      </div>

      <div className={`admin-map-tabs ${styles.messagingTabs}`}>
        <button
          type="button"
          className={`admin-map-tabs__tab ${tab === "ai" ? "is-active" : ""}`}
          onClick={() => setTab("ai")}
        >
          AI providers
        </button>
        <button
          type="button"
          className={`admin-map-tabs__tab ${tab === "usage" ? "is-active" : ""}`}
          onClick={() => setTab("usage")}
        >
          AI usage
        </button>
      </div>

      {tab === "ai" ? (
        <>
          <AiProvidersTab
            clientId={clientId}
            eventSource={eventSource}
            onConnectionsChanged={() => setConnectionsVersion((v) => v + 1)}
          />
          <AiFeaturesConfig clientId={clientId} eventSource={eventSource} refreshKey={connectionsVersion} />
        </>
      ) : null}

      {tab === "usage" ? <AiUsageTab clientId={clientId} /> : null}

      <p className={styles.note} style={{ marginTop: 16 }}>
        Coming later: {COMING_SOON.join(", ")}.
      </p>
    </>
  );
}

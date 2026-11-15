import React, { useState } from "react";
import AiProvidersTab from "./AiProvidersTab.jsx";
import AiFeaturesConfig from "./AiFeaturesConfig.jsx";
import AiUsageTab from "./AiUsageTab.jsx";
import { PageLayout, Tabs } from "../ui/index.js";
import "../../styles/wave-a/batch-4.css";

const COMING_SOON = ["Analytics", "Payments", "CRM", "Identity & SSO", "Data & webhooks"];
const TABS = [
  { key: "ai", label: "AI providers" },
  { key: "usage", label: "AI usage" },
];

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
    <PageLayout
      head={{
        title: "Integrations",
        subtitle: "Connect external services once and use them across Layercake products. Layercake provides the capabilities; you pay your provider directly for what they use.",
      }}
    >
      <Tabs tabs={TABS} current={tab} onSelect={setTab} label="Integrations sections" />

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

      <p className="b4-note">Coming later: {COMING_SOON.join(", ")}.</p>
    </PageLayout>
  );
}

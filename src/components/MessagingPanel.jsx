import React, { useState } from "react";
import MessagingProfiles from "./MessagingProfiles.jsx";
import MessagingSentMessages from "./MessagingSentMessages.jsx";
import { PageLayout, Tabs } from "./ui/index.js";
import "../styles/wave-b/messaging.css";

const TABS = [
  { key: "profiles", label: "Sending profiles" },
  { key: "messages", label: "Sent messages" },
];

/**
 * Messaging hub: sending profiles + sent message log (client portal and admin customer detail).
 * Enabling messaging, test mode and the message text are set per map / directory.
 */
export default function MessagingPanel({
  clientId,
  clientName = "",
  eventSource = "client_portal",
}) {
  const [tab, setTab] = useState("profiles");

  return (
    <PageLayout
      head={{
        title: "Messaging",
        subtitle:
          "Create the sending profiles (From addresses and domains) your maps and directories send messages from, and review messages sent through them. Turn messaging on for each map or directory under its own Messaging tab.",
      }}
    >
      <Tabs tabs={TABS} current={tab} onSelect={setTab} label="Messaging sections" />

      <div className="wb5-tabbody">
        {tab === "profiles" ? (
          <MessagingProfiles
            clientId={clientId}
            clientName={clientName}
            eventSource={eventSource}
          />
        ) : (
          <MessagingSentMessages clientId={clientId} />
        )}
      </div>
    </PageLayout>
  );
}

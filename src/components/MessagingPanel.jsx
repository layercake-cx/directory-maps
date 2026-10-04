import React, { useState } from "react";
import MessagingProfiles from "./MessagingProfiles.jsx";
import MessagingSentMessages from "./MessagingSentMessages.jsx";
import styles from "../pages/client/ClientEmail.module.css";

/**
 * Messaging hub: sending profiles + sent message log (client portal and admin customer detail).
 * Enabling messaging, test mode and the message text are set per map / directory.
 */
export default function MessagingPanel({
  clientId,
  clientName = "",
  eventSource = "client_portal",
  showPageTitle = true,
}) {
  const [tab, setTab] = useState("profiles");

  return (
    <>
      {showPageTitle ? (
        <div className="page-head" style={{ marginBottom: 16 }}>
          <div>
            <h1 className="page-title">Messaging</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--shell-text-muted)" }}>
              Create the sending profiles (From addresses and domains) your maps and directories send
              messages from, and review messages sent through them. Turn messaging on for each map or
              directory under its own Messaging tab.
            </p>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: "0 0 4px 0", fontSize: 18 }}>Messaging</h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--lc-muted)" }}>
            Manage sending profiles and review sent contact messages for this customer.
          </p>
        </div>
      )}

      <div className={`admin-map-tabs ${styles.messagingTabs}`}>
        <button
          type="button"
          className={`admin-map-tabs__tab ${tab === "profiles" ? "is-active" : ""}`}
          onClick={() => setTab("profiles")}
        >
          Sending profiles
        </button>
        <button
          type="button"
          className={`admin-map-tabs__tab ${tab === "messages" ? "is-active" : ""}`}
          onClick={() => setTab("messages")}
        >
          Sent messages
        </button>
      </div>

      {tab === "profiles" ? (
        <MessagingProfiles
          clientId={clientId}
          clientName={clientName}
          eventSource={eventSource}
        />
      ) : (
        <MessagingSentMessages clientId={clientId} />
      )}
    </>
  );
}

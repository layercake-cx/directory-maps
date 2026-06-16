import React, { useState } from "react";
import MessagingSettings from "./MessagingSettings.jsx";
import MessagingSentMessages from "./MessagingSentMessages.jsx";
import styles from "../pages/client/ClientEmail.module.css";

/**
 * Messaging hub: settings + sent message log (client portal and admin customer detail).
 */
export default function MessagingPanel({
  clientId,
  clientName = "",
  eventSource = "client_portal",
  showPageTitle = true,
}) {
  const [tab, setTab] = useState("settings");

  return (
    <>
      {showPageTitle ? (
        <>
          <h1 className={styles.title}>Messaging</h1>
          <p className={styles.lead}>
            Control whether visitors can send messages to directory listings, configure sending
            options, and review messages sent through your maps.
          </p>
        </>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: "0 0 4px 0", fontSize: 18 }}>Messaging</h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--lc-muted)" }}>
            Configure messaging and review sent contact messages for this customer.
          </p>
        </div>
      )}

      <div className={`admin-map-tabs ${styles.messagingTabs}`}>
        <button
          type="button"
          className={`admin-map-tabs__tab ${tab === "settings" ? "is-active" : ""}`}
          onClick={() => setTab("settings")}
        >
          Settings
        </button>
        <button
          type="button"
          className={`admin-map-tabs__tab ${tab === "messages" ? "is-active" : ""}`}
          onClick={() => setTab("messages")}
        >
          Sent messages
        </button>
      </div>

      {tab === "settings" ? (
        <MessagingSettings
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

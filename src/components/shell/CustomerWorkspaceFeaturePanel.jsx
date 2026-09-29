import React from "react";
import FeaturePanel from "./FeaturePanel.jsx";

/**
 * Staff "customer workspace" panel — the admin equivalent of the client portal's own black rail
 * (Home/My maps/Directories/Categorisations/Team/Messaging/Domains), plus the two staff-only
 * sections (Entitlements, Customer details) that used to live in their own narrower
 * CustomerAccountFeaturePanel. Replaces AdminClientDetail's horizontal tab bar so staff get the
 * same left-column nav pattern as the directory workspace (DirectoryFeaturePanel), per Damian's
 * "put the page navigation into the left hand column" feedback.
 */
export default function CustomerWorkspaceFeaturePanel({ clientId, clientName }) {
  const basePath = `/admin/clients/${encodeURIComponent(clientId)}`;
  return (
    <FeaturePanel
      title={clientName ?? "…"}
      backHref="/admin/clients"
      backLabel="Back to customers"
      groups={[
        {
          label: null,
          items: [
            { id: "maps", label: "Maps", route: basePath },
            { id: "directories", label: "Directories", route: `${basePath}/directories` },
            { id: "categorisations", label: "Categorisations", route: `${basePath}/categorisations` },
            { id: "entitlements", label: "Entitlements", route: `${basePath}/entitlements` },
            { id: "details", label: "Customer details", route: `${basePath}/details` },
            { id: "users", label: "Users", route: `${basePath}/users` },
            { id: "messaging", label: "Messaging", route: `${basePath}/messaging` },
            { id: "domains", label: "Domains", route: `${basePath}/domains` },
          ],
        },
      ]}
    />
  );
}

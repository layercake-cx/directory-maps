import React from "react";
import FeaturePanel from "./FeaturePanel.jsx";

/**
 * Staff-only "Customer account" panel (IA §7): Customer details, Entitlements. "Feature access
 * (beta)" stays a subsection of Customer details rather than a third nav item — it isn't its own
 * route today (see BACKLOG.md); splitting it out is a real but separate, deliberately deferred
 * piece of work.
 */
export default function CustomerAccountFeaturePanel({ clientId }) {
  const basePath = `/admin/clients/${clientId}`;
  return (
    <FeaturePanel
      title="Customer account"
      backHref={basePath}
      backLabel="Back to customer"
      groups={[
        {
          label: null,
          items: [
            { id: "details", label: "Customer details", route: `${basePath}/details` },
            { id: "entitlements", label: "Entitlements", route: `${basePath}/entitlements` },
          ],
        },
      ]}
    />
  );
}

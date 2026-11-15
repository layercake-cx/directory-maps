import React from "react";
import { Button, Callout, Dialog } from "../ui/index.js";

/**
 * Click-triggered companion to EntitlementGate/EntitlementUsageHint (the
 * "entitlement kit"): those two block or nudge *inline*, once a page is
 * already rendered. This one is for gating a button click *before*
 * navigation happens, e.g. admin's "New map", so the customer's plan
 * limit is enforced without ever landing on the create form. Renders in the
 * kit Dialog (Esc and backdrop click close it).
 */
export default function EntitlementLimitModal({ open, onClose, title = "Plan limit reached", message }) {
  if (!open) return null;

  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={<Button variant="primary" data-autofocus onClick={onClose}>Got it</Button>}
    >
      <Callout tone="warn">{message}</Callout>
    </Dialog>
  );
}

import React from "react";
import { getUsageLabel, getLimitReachedMessage } from "../lib/entitlementMessages.js";
import "../styles/wave-c/ops.css";

/**
 * Inline "soft" entitlement nudge: "X of Y <label> used", with an upgrade
 * note once at the limit. Companion to EntitlementGate (the "hard block"
 * pattern) — same kit, lighter touch, for volume/metered features that
 * should warn rather than fully disable the screen.
 */
export default function EntitlementUsageHint({ featureKey, used, limit, atLimit }) {
  if (used == null || limit == null) return null;

  return (
    <p className="ent-hint">
      {used} of {limit} {getUsageLabel(featureKey)} used
      {atLimit ? ` — ${getLimitReachedMessage(featureKey, used, limit)}` : ""}
    </p>
  );
}

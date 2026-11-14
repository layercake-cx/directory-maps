import React from "react";
import { Callout } from "./ui/index.js";
import "../styles/wave-c/ops.css";

/**
 * Generic entitlement gate: dims + disables its children and shows a
 * centered alert when `allowed` is false. Reused across client-portal and
 * admin surfaces so plan-gated screens look and behave the same way
 * everywhere, not just Messaging.
 */
export default function EntitlementGate({ allowed, loading, message, children }) {
  if (loading || allowed) return <>{children}</>;

  return (
    <div className="ent-gate">
      <div className="ent-gate-dim" aria-hidden="true" inert={true}>
        {children}
      </div>
      {/*
        The overlay is scoped to THIS component's own box only (see ops.css), so it can never
        cover nav or other page chrome. The alert is pinned 200px below the top of that box as
        the page scrolls, instead of being vertically centred in the viewport.
      */}
      <div className="ent-gate-overlay">
        <div className="ent-gate-pin">
          <Callout tone="warn" role="alert" className="ent-gate-card">
            {message}
          </Callout>
        </div>
      </div>
    </div>
  );
}

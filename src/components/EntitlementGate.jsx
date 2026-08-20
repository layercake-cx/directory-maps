import React from "react";

/**
 * Generic entitlement gate: dims + disables its children and shows a
 * centered alert when `allowed` is false. Reused across client-portal and
 * admin surfaces so plan-gated screens look and behave the same way
 * everywhere, not just Messaging.
 */
export default function EntitlementGate({ allowed, loading, message, children }) {
  if (loading || allowed) return <>{children}</>;

  return (
    <div style={{ position: "relative" }}>
      <div style={{ opacity: 0.35, filter: "grayscale(30%)" }} aria-hidden="true" inert={true}>
        {children}
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(255,255,255,0.55)",
          zIndex: 5,
        }}
      >
        <div
          role="alert"
          style={{
            background: "#fff",
            border: "1px solid #f59e0b",
            borderRadius: 10,
            padding: "20px 24px",
            maxWidth: 380,
            textAlign: "center",
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
          }}
        >
          <p style={{ margin: 0, fontWeight: 600, color: "#92400e" }}>{message}</p>
        </div>
      </div>
    </div>
  );
}

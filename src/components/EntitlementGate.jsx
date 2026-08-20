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
      {/*
        `absolute; inset: 0` scopes the dim/overlay to THIS component's own
        box only — it can never cover nav or other page chrome, since those
        live outside this wrapper in the DOM. The inner `sticky` layer is
        what keeps the alert centred in whatever part of the viewport is
        currently visible (rather than centred in the middle of a tall
        scrollable panel, which could sit off-screen) — full-viewport
        `position: fixed` would solve the centering but also cover the nav,
        which is exactly what we don't want.
      */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.55)", zIndex: 5 }}>
        <div
          style={{
            position: "sticky",
            top: 0,
            height: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
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
    </div>
  );
}

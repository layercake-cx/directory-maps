import React, { useEffect } from "react";

/**
 * Click-triggered companion to EntitlementGate/EntitlementUsageHint (the
 * "entitlement kit"): those two block or nudge *inline*, once a page is
 * already rendered. This one is for gating a button click *before*
 * navigation happens — e.g. admin's "New map" — so the customer's plan
 * limit is enforced without ever landing on the create form. Same amber
 * alert styling as EntitlementGate; shell reuses the admin-modal classes
 * (see admin.css) already used for the delete-user confirmation, plus
 * Escape/backdrop-to-close so it reads as a real dialog, not a blocking page.
 */
export default function EntitlementLimitModal({ open, onClose, title = "Plan limit reached", message }) {
  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="admin-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="entitlement-limit-modal-title"
      onClick={onClose}
    >
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <h2 id="entitlement-limit-modal-title" className="admin-modal__title">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: "none", fontSize: 22, lineHeight: 1, cursor: "pointer", color: "inherit", opacity: 0.6 }}
          >
            ×
          </button>
        </div>
        <p role="alert" style={{ margin: "0 0 16px 0", fontSize: 14, fontWeight: 600, color: "#92400e" }}>
          {message}
        </p>
        <div className="admin-modal__actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

import React from "react";

/**
 * The "Send message" drawer shown inside the map PREVIEW when a listing is selected. It imitates the published map's
 * own drawer (embed-message-drawer styles, the client's map rendering), so its markup and buttons are intentionally the
 * preview's, not the admin kit's. Submitting is the page's handler (`onSubmit`).
 * @param {object} props
 */
export default function MapMessageDrawer({
  open, onClose, onSentClose, listing, sent, form, onFormChange, testMode, testRecipient, submitting, error, onSubmit,
}) {
  const field = (key) => (e) => onFormChange((f) => ({ ...f, [key]: e.target.value }));
  return (
    <div className={`embed-message-drawer ${open ? "embed-message-drawer--open" : ""}`} aria-hidden={!open}>
      <div className="embed-message-drawer__backdrop" onClick={onClose} aria-label="Close" />
      <div className="embed-message-drawer__panel" role="dialog" aria-label="Send a message">
        <div className="embed-message-drawer__header">
          <h3 className="embed-message-drawer__title">Send message</h3>
          <button type="button" className="embed-message-drawer__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {listing ? <p className="embed-message-drawer__to">To: {listing.name || "—"}</p> : null}
        {sent ? (
          <div className="embed-message-drawer__success">
            <p>Your message has been sent. You have been CC&apos;d on the email.</p>
            <button type="button" className="btn btn-primary" onClick={onSentClose}>
              Close
            </button>
          </div>
        ) : (
          <form className="embed-message-drawer__form" onSubmit={onSubmit}>
            {testMode && (
              <div className="md-test-banner">
                <strong>Test mode:</strong> Messages will be sent to the test address below, not to the listing email.
              </div>
            )}
            {testMode && (
              <label className="embed-message-drawer__label">
                <span>Test recipient email</span>
                <input
                  type="email"
                  value={form.testToEmail}
                  onChange={field("testToEmail")}
                  placeholder={testRecipient || "test-recipient@example.com"}
                  required
                />
              </label>
            )}
            <label className="embed-message-drawer__label">
              <span>Name</span>
              <input type="text" value={form.name} onChange={field("name")} placeholder="Your name" />
            </label>
            <label className="embed-message-drawer__label">
              <span>Email</span>
              <input type="email" value={form.email} onChange={field("email")} placeholder="your@email.com" required />
            </label>
            <label className="embed-message-drawer__label">
              <span>Phone</span>
              <input type="tel" value={form.phone} onChange={field("phone")} placeholder="Optional" />
            </label>
            <label className="embed-message-drawer__label">
              <span>Message</span>
              <textarea value={form.message} onChange={field("message")} placeholder="Your message…" rows={4} required />
            </label>
            {error ? <p className="embed-message-drawer__error">{error}</p> : null}
            <button type="submit" className="btn btn-primary md-drawer-submit" disabled={submitting}>
              {submitting ? "Sending…" : "Send message"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

import React, { useEffect, useState } from "react";

/** Trash icon shared by the admin table row delete buttons. */
export const TrashIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

/**
 * A destructive-confirmation modal that requires the user to type a challenge
 * word (default "DELETE") before the confirm button is enabled. Uses the shared
 * `admin-modal-*` styles from admin.css (available in both the admin console and
 * the client portal, which imports admin.css).
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} props.title
 * @param {React.ReactNode} props.message
 * @param {string} [props.confirmWord="DELETE"]
 * @param {string} [props.confirmLabel="Delete permanently"]
 * @param {boolean} [props.busy=false]
 * @param {string} [props.error]
 * @param {() => void} props.onConfirm
 * @param {() => void} props.onCancel
 */
export default function ConfirmDeleteModal({
  open,
  title,
  message,
  confirmWord = "DELETE",
  confirmLabel = "Delete permanently",
  busy = false,
  error = "",
  onConfirm,
  onCancel,
}) {
  const [text, setText] = useState("");

  // Reset the typed text whenever the modal is (re)opened.
  useEffect(() => {
    if (open) setText("");
  }, [open]);

  if (!open) return null;

  const matches = text === confirmWord;

  function handleConfirm() {
    if (!matches || busy) return;
    onConfirm?.();
  }

  return (
    <div
      className="admin-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={() => (busy ? null : onCancel?.())}
    >
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="admin-modal__title">{title}</h2>
        <div className="admin-modal__message">{message}</div>
        <p className="admin-modal__hint">
          Type <strong>{confirmWord}</strong> below to confirm.
        </p>
        <input
          type="text"
          className="admin-modal__input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
          placeholder={confirmWord}
          autoComplete="off"
          autoFocus
          aria-label={`Type ${confirmWord} to confirm`}
        />
        {error ? (
          <p className="admin-modal__message" style={{ color: "#b91c1c", marginTop: 8 }}>{error}</p>
        ) : null}
        <div className="admin-modal__actions">
          <button type="button" className="btn" onClick={() => onCancel?.()} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={handleConfirm} disabled={!matches || busy}>
            {busy ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

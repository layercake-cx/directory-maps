import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { checkContrast, contrastLevel } from "../../lib/colorContrast.js";
import "./experience.css";

/** Accessible radio-group segmented control. Arrow keys move selection (native radio behaviour). */
export function SegmentedControl({ label, name, value, options, onChange }) {
  const autoName = useId();
  return (
    <div role="radiogroup" aria-label={label} className="xp-seg">
      {options.map((o) => (
        <label key={o.value} data-on={String(value === o.value)}>
          <input type="radio" name={name || autoName} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

/** WCAG readability badge. `contrast` is checkContrast()'s result; `base` renders the neutral "Base colour" badge. */
export function ContrastBadge({ contrast, base }) {
  if (base) return <span className="xp-badge" data-tone="neutral">Base colour</span>;
  if (!contrast) return null;
  const level = contrastLevel(contrast.ratio);
  return (
    <span className="xp-badge" data-tone={level.tone} title={`Contrast ${contrast.ratio.toFixed(2)}:1 against its background`}>
      {level.label} · {contrast.ratio.toFixed(1)}:1
    </span>
  );
}

/** Swatch + name + purpose + hex input + optional contrast badge. */
export function ColourField({ label, hint, value, onChange, contrast, base, disabled }) {
  const id = useId();
  const hexOk = /^#[0-9a-fA-F]{6}$/.test(value || "");
  return (
    <div className="xp-colour">
      <input
        type="color"
        className="xp-swatch"
        aria-label={`${label} colour picker`}
        value={hexOk ? value : "#000000"}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      <div>
        <label htmlFor={id} style={{ fontSize: 14, fontWeight: 600 }}>{label}</label>
        {hint ? <p className="xp-help">{hint}</p> : null}
      </div>
      <input id={id} className="xp-input" style={{ width: 110 }} value={value || ""} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      <ContrastBadge contrast={contrast} base={base} />
    </div>
  );
}

/** Contrast of `fg` against a hex colour or RegionBackground (gradients: worst stop wins). */
export function contrastOf(fg, bg, opts) {
  return checkContrast(fg, bg, opts);
}

export function Dialog({ title, children, onClose, labelledBy }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.querySelector("input, button, select, textarea")?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="xp-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="xp-dialog" role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={ref}>
        <h2 id={labelledBy}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger, onConfirm, onCancel }) {
  const id = useId();
  return (
    <Dialog title={title} onClose={onCancel} labelledBy={id}>
      <p className="xp-help" style={{ fontSize: 14, color: "#333a44" }}>{message}</p>
      <div className="xp-row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="xp-btn" onClick={onCancel}>Cancel</button>
        <button type="button" className={`xp-btn ${danger ? "xp-btn-danger" : "xp-btn-primary"}`} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Dialog>
  );
}

export function NameDialog({ title, label, initial = "", confirmLabel = "Save", busy, onSubmit, onCancel }) {
  const id = useId();
  const [name, setName] = useState(initial);
  return (
    <Dialog title={title} onClose={onCancel} labelledBy={id}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSubmit(name.trim());
        }}
        style={{ display: "grid", gap: 12 }}
      >
        <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600 }}>
          {label}
          <input className="xp-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
        </label>
        <div className="xp-row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="xp-btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="xp-btn xp-btn-primary" disabled={busy || !name.trim()}>{confirmLabel}</button>
        </div>
      </form>
    </Dialog>
  );
}

/** ⋯ overflow menu. `items`: [{label, onSelect, danger}] */
export function OverflowMenu({ label, items }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!wrap.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="xp-menu" ref={wrap}>
      <button type="button" className="xp-iconbtn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>⋯</button>
      {open && (
        <div className="xp-menu-list" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              style={it.danger ? { color: "#b91c1c" } : undefined}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Bottom save bar. There is no draft layer in this product: Save writes straight to the database
 * and Publishing (a separate page) regenerates the live site, so the bar offers Discard + Save and
 * links to Publishing when saved edits haven't gone live yet.
 */
export function SaveBar({ dirtyCount, saving, error, savedAt, onDiscard, onSave, publishHref, PublishLink }) {
  const dirty = dirtyCount > 0;
  const status = dirty
    ? `${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"}`
    : savedAt
      ? `All changes saved · ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      : "No unsaved changes";
  return (
    <div className="xp-savebar" role="region" aria-label="Save changes">
      <span className="xp-savebar-status" aria-live="polite">
        {error ? <span className="xp-savebar-err">{error}</span> : status}
        {!dirty && savedAt && publishHref && PublishLink ? (
          <>
            {" "}
            <PublishLink to={publishHref}>Review and publish →</PublishLink>
          </>
        ) : null}
      </span>
      <button type="button" className="xp-btn" disabled={!dirty || saving} onClick={onDiscard}>Discard</button>
      <button type="button" className="xp-btn xp-btn-primary" disabled={!dirty || saving} onClick={onSave}>
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

/**
 * Warns before leaving with unsaved changes. The app uses BrowserRouter (no data router), so
 * react-router's useBlocker is unavailable: guard tab close / reload with beforeunload, and
 * in-app link clicks with a capture-phase listener. Browser back/forward can't be intercepted
 * reliably without a data router; beforeunload still covers leaving the site.
 */
export function useUnsavedGuard(dirty) {
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!window.confirm("You have unsaved changes. Leave this page and discard them?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);
}

/** Arrow-key navigation for a tablist: returns an onKeyDown handler. */
export function useTabKeys(ids, active, setActive) {
  return useCallback(
    (e) => {
      const i = ids.indexOf(active);
      let next = null;
      if (e.key === "ArrowRight") next = ids[(i + 1) % ids.length];
      else if (e.key === "ArrowLeft") next = ids[(i - 1 + ids.length) % ids.length];
      else if (e.key === "Home") next = ids[0];
      else if (e.key === "End") next = ids[ids.length - 1];
      if (next) {
        e.preventDefault();
        setActive(next);
        requestAnimationFrame(() => document.getElementById(`xp-tab-${next}`)?.focus());
      }
    },
    [ids, active, setActive],
  );
}

import { Link } from "react-router-dom";
import React, { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import Button from "./Button.jsx";
import { TextInput, Field } from "./forms.jsx";
import { Callout } from "./feedback.jsx";
import { DotsIcon } from "./icons.jsx";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Dialog: modal with focus handling. Focus goes to [data-autofocus] or the first control, Tab is trapped,
 * Esc closes, focus returns to the trigger.
 * @param {{ title: string, onClose: () => void, labelledBy?: string, wide?: boolean, footer?: React.ReactNode }} props
 */
export function Dialog({ title, children, onClose, labelledBy, wide = false, footer }) {
  const ref = useRef(null);
  const auto = useId();
  const titleId = labelledBy || auto;
  // Read onClose through a ref so callers can pass an inline function: the effect below must run once per open,
  // otherwise every parent re-render (e.g. typing in a field) would re-focus the first control.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement;
    const el = ref.current;
    (el?.querySelector("[data-autofocus]") || el?.querySelector(FOCUSABLE))?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current?.();
      } else if (e.key === "Tab" && el) {
        const items = [...el.querySelectorAll(FOCUSABLE)];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, []);
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`dialog ${wide ? "dialog--wide" : ""}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <div className="dialog-head"><h2 id={titleId} className="dialog-title">{title}</h2></div>
        <div className="dialog-body">{children}</div>
        {footer ? <div className="dialog-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

/**
 * ConfirmDialog: the title is the question; the body says the consequence and how to undo it.
 * `danger` uses the solid red confirm and puts initial focus on Cancel.
 */
export function ConfirmDialog({ title, message, children, confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false, onConfirm, onCancel }) {
  return (
    <Dialog
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button data-autofocus onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={danger ? "danger-solid" : "primary"} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      {message ?? children}
    </Dialog>
  );
}

/**
 * ArchiveDialog: archiving needs the typed word ARCHIVE (exact, case-sensitive, spaces trimmed). Nothing is deleted,
 * so the dialog lists the real consequences and says so. Restore needs no typing, so there is no dialog for it.
 * @param {{ entityType: "directory"|"map"|"customer", name?: string, count?: number, consequences?: React.ReactNode[],
 *   onConfirm: () => Promise<void>, onClose: () => void }} props `onConfirm` may throw: the dialog stays open with the error.
 */
export function ArchiveDialog({ entityType, name, count = 1, consequences = [], onConfirm, onClose }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const formId = useId();
  const matches = text.trim() === "ARCHIVE";
  const plural = { directory: "directories", map: "maps", customer: "customers" }[entityType];
  const bulk = count > 1;
  const title = bulk ? `Archive ${count} ${plural}?` : `Archive ${name}?`;
  const confirmLabel = bulk ? `Archive ${count} ${plural}` : `Archive ${entityType}`;
  const hint = text.length > 0 && !matches ? "Type ARCHIVE in capitals" : undefined;

  async function submit(e) {
    e?.preventDefault();
    if (!matches || busy) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm();
    } catch (err) {
      setError(err?.message ?? String(err));
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={title}
      onClose={() => { if (!busy) onClose(); }}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" form={formId} variant="danger-solid" disabled={!matches} loading={busy} loadingLabel="Archiving…">
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="archive-dialog">
        {error ? <Callout tone="danger">{error}</Callout> : null}
        {consequences.length > 0 ? (
          <ul className="archive-dialog-list">
            {consequences.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        ) : null}
        <Callout tone="ok"><strong>Nothing is deleted.</strong> Restore it from Archived at any time and it comes back as it was.</Callout>
        <Field label="Type ARCHIVE to confirm" hint={hint}>
          <TextInput
            data-autofocus
            className="cell-mono"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoComplete="off"
            spellCheck="false"
            disabled={busy}
          />
        </Field>
      </form>
    </Dialog>
  );
}

export function NameDialog({ title, label, initial = "", confirmLabel = "Save", busy, onSubmit, onCancel }) {
  const [name, setName] = useState(initial);
  const formId = useId();
  return (
    <Dialog
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" form={formId} variant="primary" disabled={busy || !name.trim()}>{confirmLabel}</Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSubmit(name.trim()); }}>
        <Field label={label} required>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
      </form>
    </Dialog>
  );
}

/* -------- useConfirm: promise-based ConfirmDialog (replaces window.confirm) -------- */

const ConfirmContext = createContext(null);

/** Mounted once in AppShell. */
export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null);
  const confirm = useCallback((opts) => new Promise((resolve) => setReq({ ...opts, resolve })), []);
  const settle = (value) => {
    req?.resolve(value);
    setReq(null);
  };
  const value = useMemo(() => confirm, [confirm]);
  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {req ? (
        <ConfirmDialog
          title={req.title}
          message={req.body}
          confirmLabel={req.confirmLabel}
          cancelLabel={req.cancelLabel}
          danger={req.tone === "danger"}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      ) : null}
    </ConfirmContext.Provider>
  );
}

/**
 * `const confirm = useConfirm(); if (await confirm({title, body, confirmLabel, tone: "danger"})) …`
 * Falls back to window.confirm only when used outside a ConfirmProvider (e.g. out-of-shell pages).
 */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  return ctx || ((opts) => Promise.resolve(window.confirm(`${opts.title}${opts.body && typeof opts.body === "string" ? `\n\n${opts.body}` : ""}`)));
}

/**
 * OverflowMenu: ⋯ menu. Items: [{label, onSelect, danger?, disabled?, href?}] or {divider: true}. Destructive items go last and open ConfirmDialog.
 */
export function OverflowMenu({ label, items }) {
  const [open, setOpen] = useState(false);
  // Fixed position (set from the trigger's rect) so the list escapes scroll containers such as `.table-wrap`
  // instead of being clipped by them or making the table scroll.
  const [pos, setPos] = useState(null);
  const wrap = useRef(null);
  const trigger = useRef(null);
  const list = useRef(null);
  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }, []);
  useLayoutEffect(() => {
    if (!open || !trigger.current) { setPos(null); return; }
    const t = trigger.current.getBoundingClientRect();
    const h = list.current?.offsetHeight ?? 0;
    const below = t.bottom + 4;
    const top = below + h > window.innerHeight - 8 && t.top - 4 - h > 8 ? t.top - 4 - h : below;
    setPos({ top, right: Math.max(8, window.innerWidth - t.right) });
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    wrap.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus();
    const onDoc = (e) => { if (!wrap.current?.contains(e.target)) close(false); };
    const onMove = () => close(false); // a fixed menu would drift from its trigger
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, close, pos !== null]); // re-run once positioned: a hidden menu cannot take focus
  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); return; }
    if (e.key === "Tab") { close(false); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    const els = [...wrap.current.querySelectorAll('[role="menuitem"]:not([disabled])')];
    if (!els.length) return;
    e.preventDefault();
    const i = els.indexOf(document.activeElement);
    let next = i;
    if (e.key === "ArrowDown") next = (i + 1) % els.length;
    else if (e.key === "ArrowUp") next = (i - 1 + els.length) % els.length;
    else if (e.key === "Home") next = 0;
    else next = els.length - 1;
    els[next].focus();
  };
  return (
    <div className="avatar-menu" ref={wrap} onKeyDown={onKeyDown}>
      <Button ref={trigger} variant="ghost" iconOnly size="sm" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <DotsIcon />
      </Button>
      {open && (
        <div className="avatar-menu-list" role="menu" ref={list} style={pos ? { position: "fixed", top: pos.top, right: pos.right, left: "auto", bottom: "auto" } : { visibility: "hidden" }}>
          {items.map((it, idx) => {
            if (it.divider) return <div key={`sep-${idx}`} role="separator" className="avatar-menu-sep" />;
            const cls = `avatar-menu-item ${it.danger ? "avatar-menu-item--danger" : ""}`.trim();
            // Internal paths use the router (no full page reload); anything else is a plain link.
            return it.href ? (
              it.href.startsWith("/") ? (
                <Link key={it.label} role="menuitem" className={cls} to={it.href} onClick={() => close(false)}>{it.label}</Link>
              ) : (
                <a key={it.label} role="menuitem" className={cls} href={it.href} onClick={() => close(false)}>{it.label}</a>
              )
            ) : (
              <button key={it.label} type="button" role="menuitem" className={cls} disabled={it.disabled} onClick={() => { close(false); it.onSelect?.(); }}>
                {it.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Bottom save bar. There is no draft layer: Save writes straight to the database; Publishing (a separate page)
 * regenerates the live site, so the bar offers Discard + Save and links to Publishing when saved edits aren't live yet.
 */
export function SaveBar({ dirtyCount, saving, error, savedAt, onDiscard, onSave, publishHref, PublishLink }) {
  const dirty = dirtyCount > 0;
  const status = dirty
    ? `${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"}`
    : savedAt
      ? `All changes saved · ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      : "No unsaved changes";
  return (
    <div className="savebar" role="region" aria-label="Save changes">
      <span className="savebar-status" aria-live="polite">
        {error ? <span className="savebar-error">{error}</span> : status}
        {!dirty && savedAt && publishHref && PublishLink ? (
          <>
            {" "}
            <PublishLink to={publishHref}>Review and publish →</PublishLink>
          </>
        ) : null}
      </span>
      <Button disabled={!dirty || saving} onClick={onDiscard}>Discard</Button>
      <Button variant="primary" loading={saving} loadingLabel="Saving…" disabled={!dirty} onClick={onSave}>Save</Button>
    </div>
  );
}

/**
 * Warns before leaving with unsaved changes. The app uses BrowserRouter (no data router), so useBlocker is
 * unavailable: guard tab close / reload with beforeunload, and in-app link clicks with a capture-phase listener
 * that asks via ConfirmDialog (then replays the click). Browser back/forward can't be intercepted reliably.
 */
export function useUnsavedGuard(dirty) {
  const confirm = useConfirm();
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;
  useEffect(() => {
    if (!dirty) return undefined;
    let replaying = false;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e) => {
      if (replaying || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      Promise.resolve(confirmRef.current({
        title: "Leave this page?",
        body: "You have unsaved changes. If you leave now they will be lost.",
        confirmLabel: "Leave page",
        cancelLabel: "Stay",
        tone: "danger",
      })).then((ok) => {
        if (ok) {
          replaying = true;
          a.click();
          replaying = false;
        }
      });
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
        requestAnimationFrame(() => document.getElementById(`ui-tab-${next}`)?.focus());
      }
    },
    [ids, active, setActive],
  );
}

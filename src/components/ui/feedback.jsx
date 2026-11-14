import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AskPipLink } from "./layout.jsx";
import { AlertIcon, CheckCircleIcon, InfoIcon, SparkIcon } from "./icons.jsx";
import Button from "./Button.jsx";
import pipWelcome from "../../assets/pip/pip-welcome.svg";
import pipEncouraging from "../../assets/pip/pip-encouraging.svg";
import pipSearching from "../../assets/pip/pip-searching.svg";
import pipApology from "../../assets/pip/pip-apology.svg";

/**
 * Pill: status words. Always contains words, never colour alone.
 * @param {{ tone?: "ok"|"live"|"neutral"|"warn"|"danger"|"info"|"ai", dashed?: boolean }} props
 */
export function Pill({ tone = "neutral", dashed = false, className = "", children, ...rest }) {
  const cls = ["pill", `pill--${tone}`, dashed && "pill--dashed", className].filter(Boolean).join(" ");
  return <span className={cls} {...rest}>{children}</span>;
}

const CALLOUT_ROLE = { danger: "alert", ok: "status" };
const CALLOUT_ICON = { info: InfoIcon, ok: CheckCircleIcon, warn: AlertIcon, danger: AlertIcon };

/**
 * Callout: page-level messages. Field errors stay in Field.
 * @param {{ tone?: "info"|"ok"|"warn"|"danger"|"ai", title?: string, action?: React.ReactNode }} props
 */
export function Callout({ tone = "info", title, action, className = "", children, ...rest }) {
  const IconCmp = CALLOUT_ICON[tone];
  return (
    <div className={`callout callout--${tone} ${className}`.trim()} role={CALLOUT_ROLE[tone] || "note"} {...rest}>
      <span className="callout-icon" aria-hidden="true">
        {tone === "ai" ? <SparkIcon size={16} /> : IconCmp ? <IconCmp size={18} /> : null}
      </span>
      <div className="callout-body">
        {title ? <div className="callout-title">{title}</div> : null}
        <div>{children}</div>
      </div>
      {action ? <div className="callout-action">{action}</div> : null}
    </div>
  );
}

/* ---------------- Toast ---------------- */

const ToastContext = createContext(null);
const TOAST_MS = 6000;
const MAX_TOASTS = 3;

/** Mounted once in AppShell. Use `useToast()` to confirm something that already happened. */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const arm = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(() => dismiss(id), TOAST_MS));
  }, [dismiss]);

  const toast = useCallback((message, opts = {}) => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, message, action: opts.action }].slice(-MAX_TOASTS));
    arm(id);
    return id;
  }, [arm]);

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="toast"
            onMouseEnter={() => clearTimeout(timers.current.get(t.id))}
            onMouseLeave={() => arm(t.id)}
            onFocus={() => clearTimeout(timers.current.get(t.id))}
            onBlur={() => arm(t.id)}
          >
            <span>{t.message}</span>
            {t.action ? (
              <button type="button" onClick={() => { t.action.onClick(); dismiss(t.id); }}>{t.action.label}</button>
            ) : null}
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)}>Dismiss</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Returns `{ toast(message, {action?: {label, onClick}}), dismiss(id) }`. Safe (no-op) outside a provider. */
export function useToast() {
  return useContext(ToastContext) || { toast: () => 0, dismiss: () => {} };
}

/* ---------------- Empty / error / loading ---------------- */

const ART = { welcome: pipWelcome, encouraging: pipEncouraging, searching: pipSearching, apology: pipApology };

/**
 * EmptyState: states the situation in words, with the next action. Pip art only here and in ErrorState.
 * @param {{ art?: "welcome"|"encouraging"|"searching"|"none", title: string, body?: React.ReactNode,
 *   actions?: React.ReactNode, askPip?: {question: string} }} props
 */
export function EmptyState({ art = "welcome", title, body, actions, askPip, className = "", ...rest }) {
  return (
    <div className={`empty-state ${className}`.trim()} {...rest}>
      {art !== "none" && ART[art] ? <img className="empty-state-art" src={ART[art]} alt="" /> : null}
      <h3 className="empty-state-title">{title}</h3>
      {body ? <p className="empty-state-body">{body}</p> : null}
      {actions ? <div className="empty-state-actions">{actions}</div> : null}
      {askPip ? <AskPipLink question={askPip.question} context={title} trigger="empty_state" /> : null}
    </div>
  );
}

/**
 * ErrorState: role=alert. Body says what is safe ("Nothing has been lost").
 * @param {{ title: string, body?: React.ReactNode, onRetry?: () => void, askPip?: {question: string} }} props
 */
export function ErrorState({ title, body, onRetry, askPip, className = "", ...rest }) {
  return (
    <div className={`empty-state error-state ${className}`.trim()} role="alert" {...rest}>
      <img className="empty-state-art" src={pipApology} alt="" />
      <h3 className="empty-state-title">{title}</h3>
      {body ? <p className="empty-state-body">{body}</p> : null}
      {onRetry ? <div className="empty-state-actions"><Button onClick={onRetry}>Try again</Button></div> : null}
      {askPip ? <AskPipLink question={askPip.question} context={title} trigger="error_state" /> : null}
    </div>
  );
}

/**
 * Skeleton: the shape of the content being loaded.
 * @param {{ variant?: "table"|"list"|"tiles"|"form", rows?: number, label?: string }} props
 */
export function Skeleton({ variant = "table", rows = 5, label = "Loading", className = "", ...rest }) {
  const items = Array.from({ length: rows }, (_, i) => i);
  let body;
  if (variant === "tiles") {
    body = <div className="stat-grid">{items.slice(0, 4).map((i) => <div key={i} className="skeleton skeleton--tile" />)}</div>;
  } else if (variant === "form") {
    body = items.map((i) => (
      <div key={i} className="skeleton-field">
        <div className="skeleton skeleton--line skeleton--short" />
        <div className="skeleton skeleton--input" />
      </div>
    ));
  } else if (variant === "list") {
    body = items.map((i) => (
      <div key={i} className="skeleton-row">
        <div className="skeleton skeleton--chip" />
        <div className="skeleton skeleton--line" />
      </div>
    ));
  } else {
    body = items.map((i) => (
      <div key={i} className="skeleton-row">
        <div className="skeleton skeleton--chip" />
        <div className="skeleton skeleton--line" />
        <div className="skeleton skeleton--line skeleton--short" />
      </div>
    ));
  }
  return (
    <div className={`skeleton-region skeleton-region--${variant} ${className}`.trim()} aria-busy="true" aria-label={label} role="group" {...rest}>
      {body}
    </div>
  );
}

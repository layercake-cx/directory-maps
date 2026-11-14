import React, { createContext, useContext, useId } from "react";
import { Link } from "react-router-dom";
import { SparkIcon } from "./icons.jsx";

/** Phase 5 provides this (Ask Pip drawer). Until then it is null and askPip links render nothing. */
export const AskPipContext = createContext(null);
export function useAskPip() {
  return useContext(AskPipContext);
}

/** Ask Pip link used by Section / EmptyState / ErrorState. Renders nothing until the assistant exists. */
export function AskPipLink({ question, context }) {
  const pip = useAskPip();
  if (!pip?.open) return null;
  return (
    <button type="button" className="ask-pip-link" onClick={() => pip.open({ question, context })}>
      <SparkIcon size={14} />
      Ask Pip about this
    </button>
  );
}

/**
 * Section: the single in-page container. Replaces .admin-card, .panel-section, .xp-card, engagement Panel.
 * @param {{ title?: string, description?: React.ReactNode, actions?: React.ReactNode,
 *   askPip?: {question: string}, footer?: React.ReactNode, tone?: "default"|"danger",
 *   flush?: boolean, as?: "h2"|"h3" }} props
 */
export function Section({
  title, description, actions, askPip, footer, tone = "default", flush = false,
  as: Heading = "h2", className = "", children, ...rest
}) {
  const hasHead = title || description || actions || askPip;
  const cls = ["section", tone === "danger" && "section--danger", className].filter(Boolean).join(" ");
  return (
    <section className={cls} {...rest}>
      {hasHead ? (
        <div className="section-head">
          <div className="section-head-text">
            {title ? <Heading className="section-title">{title}</Heading> : null}
            {description ? <p className="section-desc">{description}</p> : null}
          </div>
          {actions || askPip ? (
            <div className="section-head-actions">
              {actions}
              {askPip ? <AskPipLink question={askPip.question} context={title} /> : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {flush ? <div className="section-flush">{children}</div> : <div className="section-body">{children}</div>}
      {footer ? <div className="section-foot">{footer}</div> : null}
    </section>
  );
}

export const SettingRowContext = createContext(null);
/** Switches inside a SettingRow read their accessible name and description from it. */
export function useSettingRow() {
  return useContext(SettingRowContext);
}

/**
 * SettingRow: label + description left, control right.
 * @param {{ label: string, description?: React.ReactNode, control: React.ReactNode, id?: string }} props
 */
export function SettingRow({ label, description, control, id, className = "", ...rest }) {
  const auto = useId();
  const base = id || auto;
  const ctx = { labelId: `${base}-label`, descId: description ? `${base}-desc` : undefined };
  return (
    <SettingRowContext.Provider value={ctx}>
      <div className={`setting-row ${className}`.trim()} {...rest}>
        <div className="setting-row-text">
          <span id={ctx.labelId} className="setting-row-label">{label}</span>
          {description ? <span id={ctx.descId} className="setting-row-desc">{description}</span> : null}
        </div>
        <div className="setting-row-control">{control}</div>
      </div>
    </SettingRowContext.Provider>
  );
}

/**
 * Tabs (level-4 record editors only). Route-driven links with aria-current="page"; or buttons with onSelect.
 * @param {{ tabs: {key: string, label: string, to?: string}[], current: string,
 *   onSelect?: (key: string) => void, label?: string }} props
 */
export function Tabs({ tabs, current, onSelect, label = "Sections", className = "" }) {
  return (
    <nav className={`tabs ${className}`.trim()} aria-label={label}>
      {tabs.map((t) => {
        const active = t.key === current;
        const aria = active ? { "aria-current": "page" } : {};
        return t.to ? (
          <Link key={t.key} to={t.to} className="tab" {...aria}>{t.label}</Link>
        ) : (
          <button key={t.key} type="button" className="tab" onClick={() => onSelect?.(t.key)} {...aria}>{t.label}</button>
        );
      })}
    </nav>
  );
}

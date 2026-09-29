import React from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRightIcon } from "../icons/shellIcons.jsx";

/**
 * Feature side panel: heading, optional back link/subtitle, optional primary action, grouped
 * nav items with optional counts, optional footer (plan box).
 *
 * Not wired into any page in Phase 1 — no call site passes `groups` yet (that's Phase 2, once
 * directory tabs move into this panel's routes). Renders null until a caller supplies content.
 */
export default function FeaturePanel({ title, backHref, backLabel, subtitle, primaryAction, groups, footer }) {
  const location = useLocation();
  const pathname = location.pathname || "/";

  if (!groups || groups.length === 0) return null;

  return (
    <nav className="panel" aria-label={title ? `${title} navigation` : "Feature navigation"}>
      {backHref && (
        <Link to={backHref} className="panel-back">
          <ChevronRightIcon size={14} style={{ transform: "rotate(180deg)" }} />
          {backLabel || "Back"}
        </Link>
      )}
      <div className="panel-head">
        <h2 className="panel-title">{title}</h2>
      </div>
      {subtitle}
      {primaryAction}
      <div className="panel-divider" />
      {groups.map((group, i) => (
        <div className="nav-group" key={group.label ?? i}>
          {group.label && <p className="nav-group-label">{group.label}</p>}
          {group.items.map((item) => {
            const active = pathname === item.route || pathname.startsWith(item.route + "/");
            return (
              <Link key={item.route} to={item.route} className="nav-item" aria-current={active ? "page" : undefined}>
                <span>{item.label}</span>
                {item.count != null && <span className="nav-count">{item.count}</span>}
              </Link>
            );
          })}
        </div>
      ))}
      {footer && <div className="plan-box">{footer}</div>}
    </nav>
  );
}

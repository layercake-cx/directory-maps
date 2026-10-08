import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRightIcon } from "../icons/shellIcons.jsx";

/**
 * Feature side panel: heading, optional back link/subtitle, optional primary action, grouped
 * nav items with optional counts, optional footer (plan box).
 *
 * Groups with a `label` render as collapsible sections (one open at a time, the one holding the
 * current route by default) so the panel stays short enough to fit a laptop screen and section
 * headers read as controls, not as nav items. Groups with no label render flat.
 *
 * Not wired into any page in Phase 1 — no call site passes `groups` yet (that's Phase 2, once
 * directory tabs move into this panel's routes). Renders null until a caller supplies content.
 */
export default function FeaturePanel({ title, backHref, backLabel, subtitle, primaryAction, groups, footer }) {
  const location = useLocation();
  const pathname = location.pathname || "/";

  const safeGroups = groups ?? [];
  const allRoutes = safeGroups.flatMap((g) => g.items.map((item) => item.route));
  function isItemActive(route) {
    if (pathname === route) return true;
    if (!pathname.startsWith(route + "/")) return false;
    // A shorter route (e.g. a group's base "Overview"/"Maps" item) is a path prefix of every
    // route nested under it — only treat it as active by prefix when no more specific sibling
    // route also matches, so the base item and the real active sub-item don't both light up.
    return !allRoutes.some(
      (other) => other !== route && other.length > route.length && (pathname === other || pathname.startsWith(other + "/"))
    );
  }

  const activeLabel = safeGroups.find((g) => g.label && g.items.some((item) => isItemActive(item.route)))?.label ?? null;
  const [openLabel, setOpenLabel] = useState(activeLabel);
  // Navigating (including via links elsewhere on the page) opens the section that now holds the page.
  useEffect(() => {
    if (activeLabel) setOpenLabel(activeLabel);
  }, [activeLabel]);

  if (safeGroups.length === 0) return null;

  function renderItem(item) {
    const active = isItemActive(item.route);
    return (
      <Link key={item.route} to={item.route} className="nav-item" aria-current={active ? "page" : undefined}>
        <span>{item.label}</span>
        {item.count != null && <span className="nav-count">{item.count}</span>}
      </Link>
    );
  }

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
      {safeGroups.map((group, i) => {
        if (!group.label) {
          return (
            <div className="nav-group" key={i}>
              {group.items.map(renderItem)}
            </div>
          );
        }
        const open = openLabel === group.label;
        const hasActive = group.label === activeLabel;
        const bodyId = `nav-group-${group.label.toLowerCase().replace(/\W+/g, "-")}`;
        return (
          <div className="nav-group nav-section" key={group.label} data-open={open || undefined}>
            <button
              type="button"
              className="nav-section-toggle"
              aria-expanded={open}
              aria-controls={bodyId}
              data-has-active={hasActive || undefined}
              onClick={() => setOpenLabel(open ? null : group.label)}
            >
              <span>{group.label}</span>
              <ChevronRightIcon size={14} className="nav-section-chevron" />
            </button>
            {open && (
              <div className="nav-section-body" id={bodyId}>
                {group.items.map(renderItem)}
              </div>
            )}
          </div>
        );
      })}
      {footer && <div className="plan-box">{footer}</div>}
    </nav>
  );
}

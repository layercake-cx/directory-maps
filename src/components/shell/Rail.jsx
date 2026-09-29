import React from "react";
import { Link, useLocation } from "react-router-dom";
import { NAV_CONFIG } from "../../config/navConfig.js";
import { useFeatureFlags } from "../../hooks/useFeatureFlags.js";
import { RAIL_ICONS } from "../icons/shellIcons.jsx";

const CLIENT_HOME_EXCLUDED_PREFIXES = [
  "/client/team",
  "/client/email",
  "/client/domains",
  "/client/maps/",
  "/client/directories",
  "/client/categorisations",
];

// Same "Home"/"My maps" collapse-to-one-href pattern as the real client rail (see plan doc),
// now that staff-in-customer-workspace routes exist too (Phase 3) — these are the OTHER
// staffRoute suffixes (relative to /admin/clients/:clientId) plus the map-detail pattern, whose
// own sub-nav (MapEditSubNav) should take over instead of Home/My maps showing active.
const STAFF_HOME_EXCLUDED_SUFFIXES = ["/details", "/entitlements", "/categorisations", "/users", "/messaging", "/domains", "/directories", "/maps/"];

function isRailItemActive(route, pathname, isCollapsedHome) {
  if (isCollapsedHome) {
    const excluded = route.startsWith("/client") ? CLIENT_HOME_EXCLUDED_PREFIXES : STAFF_HOME_EXCLUDED_SUFFIXES.map((s) => route + s);
    return (
      pathname === route ||
      pathname === route + "/" ||
      (pathname.startsWith(route + "/") && !excluded.some((prefix) => pathname.startsWith(prefix)))
    );
  }
  return pathname === route || pathname.startsWith(route + "/");
}

/**
 * Global icon rail for the current context (client|platform), driven by navConfig.js.
 * `contact` is only used by client-context items' `permissionCheck` — real client users only;
 * staff always pass (an admin isn't subject to a customer's owner/manager permission model).
 */
export default function Rail({ context, isStaff, contact, clientId }) {
  const location = useLocation();
  const pathname = location.pathname || "/";
  const { flags, loading: flagsLoading } = useFeatureFlags();

  const items = (NAV_CONFIG[context]?.rail ?? []).filter((item) => {
    if (item.staffOnly && !isStaff) return false;
    if (item.flag) {
      if (flagsLoading) return false;
      if (!flags?.[item.flag]) return false;
    }
    if (item.permissionCheck && !isStaff && !item.permissionCheck(contact)) return false;
    return true;
  });

  const topItems = items.filter((item) => item.position !== "bottom");
  const bottomItems = items.filter((item) => item.position === "bottom");

  function renderItem(item) {
    const IconComponent = RAIL_ICONS[item.icon];
    const href = isStaff && clientId && item.staffRoute ? item.staffRoute(clientId) : item.route;
    const isCollapsedHome = item.id === "home" || item.id === "maps";
    const active = isRailItemActive(href, pathname, isCollapsedHome);
    return (
      <Link
        key={item.id}
        to={href}
        aria-label={item.label}
        title={item.label}
        aria-current={active ? "page" : undefined}
        className={`rail-item${item.staffOnly ? " rail-item--staff" : ""}`}
      >
        {IconComponent ? <IconComponent /> : null}
      </Link>
    );
  }

  return (
    <nav className="rail" aria-label={context === "platform" ? "Platform sections" : "Client sections"}>
      {topItems.map(renderItem)}
      {bottomItems.length > 0 && <div className="rail-spacer" />}
      {bottomItems.map(renderItem)}
    </nav>
  );
}

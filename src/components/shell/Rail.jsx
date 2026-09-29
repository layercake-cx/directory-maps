import React from "react";
import { Link, useLocation } from "react-router-dom";
import { NAV_CONFIG } from "../../config/navConfig.js";
import { useFeatureFlags } from "../../hooks/useFeatureFlags.js";
import { RAIL_ICONS } from "../icons/shellIcons.jsx";

// "/client" is a literal prefix of every other client route, so Home needs an explicit exclusion
// list (every sibling rail item's own href) or it would show active everywhere. "My maps" got its
// own distinct route in Phase 4 (previously collapsed with Home — see BACKLOG.md, now resolved),
// so it's included here too.
const CLIENT_HOME_EXCLUDED_PREFIXES = [
  "/client/maps",
  "/client/team",
  "/client/email",
  "/client/domains",
  "/client/directories",
  "/client/categorisations",
];

// Same idea for staff-in-customer-workspace routes (Phase 3): Home's href
// (/admin/clients/:clientId) is a prefix of every other rail item's staffRoute.
const STAFF_HOME_EXCLUDED_SUFFIXES = ["/details", "/entitlements", "/categorisations", "/users", "/messaging", "/domains", "/directories", "/maps"];

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
    const isCollapsedHome = item.id === "home";
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

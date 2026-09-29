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

function isRailItemActive(route, pathname) {
  if (route === "/client") {
    return (
      pathname === "/client" ||
      pathname === "/client/" ||
      (pathname.startsWith("/client/") &&
        !CLIENT_HOME_EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix)))
    );
  }
  return pathname === route || pathname.startsWith(route + "/");
}

/**
 * Global icon rail for the current context (client|platform), driven by navConfig.js.
 * `contact` is only used by client-context items' `permissionCheck`.
 */
export default function Rail({ context, isStaff, contact }) {
  const location = useLocation();
  const pathname = location.pathname || "/";
  const { flags, loading: flagsLoading } = useFeatureFlags();

  const items = (NAV_CONFIG[context]?.rail ?? []).filter((item) => {
    if (item.staffOnly && !isStaff) return false;
    if (item.flag) {
      if (flagsLoading) return false;
      if (!flags?.[item.flag]) return false;
    }
    if (item.permissionCheck && !item.permissionCheck(contact)) return false;
    return true;
  });

  const topItems = items.filter((item) => item.position !== "bottom");
  const bottomItems = items.filter((item) => item.position === "bottom");

  function renderItem(item) {
    const IconComponent = RAIL_ICONS[item.icon];
    const active = isRailItemActive(item.route, pathname);
    return (
      <Link
        key={item.id}
        to={item.route}
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

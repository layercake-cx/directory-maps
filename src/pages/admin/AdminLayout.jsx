import React from "react";
import { Link, useLocation } from "react-router-dom";
import MapEditSubNav from "../../components/MapEditSubNav.jsx";
import AppShell from "../../components/shell/AppShell.jsx";
import "./admin.css";

/** Admin routes editing a specific client's map (Design / Data / Listings). */
function isAdminClientMapRoute(pathname) {
  return /^\/admin\/clients\/[^/]+\/maps\/[^/]+/.test(pathname || "");
}

/**
 * Every admin page still imports and wraps its content in this component (there is no
 * route-level admin layout yet — see BUILD plan §3 for why that restructuring was skipped
 * in Phase 1). What changed: the old bespoke header + ADMIN_NAV bar is now the shared
 * AppShell/TopBar/Rail (platform context — the brief's "staff client workspace renders
 * inside the client shell" treatment for /admin/clients/:clientId/... is explicitly Phase 3
 * work, not attempted here). breadcrumbs/clientNavItems/rightActions keep their exact old
 * markup and classes, just relocated inside the new shell's <main>.
 *
 * @param {{
 *   rightActions?: React.ReactNode,
 *   children: React.ReactNode,
 *   mainClassName?: string,
 *   breadcrumbs?: {label: string, path?: string}[],
 *   clientNavItems?: {label: string, value: string}[],
 *   activeClientTab?: string,
 *   onClientTabChange?: (value: string) => void,
 * }} props
 */
export default function AdminLayout({
  rightActions,
  children,
  mainClassName = "",
  breadcrumbs = [],
  clientNavItems,
  activeClientTab,
  onClientTabChange,
}) {
  const location = useLocation();
  const pathname = location.pathname || "/";
  const showMapSubNav = isAdminClientMapRoute(pathname);

  return (
    <AppShell context="platform" isStaff homeHref="/admin/clients">
      <div className={`admin-main ${mainClassName}`.trim()}>
        {rightActions && <div className="admin-actions">{rightActions}</div>}

        {breadcrumbs.length > 0 && (
          <div className="admin-breadcrumbs">
            <div className="admin-breadcrumbs__inner">
              {breadcrumbs.map((item, i) => (
                <span key={i} className="admin-breadcrumbs__item">
                  {i > 0 && <span className="admin-breadcrumbs__sep" aria-hidden> / </span>}
                  {item.path ? (
                    <Link to={item.path} className="admin-breadcrumbs__link">{item.label}</Link>
                  ) : (
                    <span className="admin-breadcrumbs__current">{item.label}</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {clientNavItems && clientNavItems.length > 0 && (
          <nav className="admin-client-nav" aria-label="Client sections">
            <div className="admin-client-nav__inner">
              {clientNavItems.map(({ label, value }) => (
                <button
                  key={value}
                  type="button"
                  className={`admin-client-nav__tab${activeClientTab === value ? " admin-client-nav__tab--active" : ""}`}
                  onClick={() => onClientTabChange?.(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </nav>
        )}

        {showMapSubNav && <MapEditSubNav standalone />}

        {children}
      </div>
    </AppShell>
  );
}

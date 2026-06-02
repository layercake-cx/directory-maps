import React from "react";
import { Link, useLocation } from "react-router-dom";
import BrandLogo from "../../components/BrandLogo.jsx";
import MapEditSubNav from "../../components/MapEditSubNav.jsx";
import "./admin.css";

const ADMIN_NAV = [
  { label: "Customers", path: "/admin/clients" },
  { label: "Maps", path: "/admin/maps" },
  { label: "Admin Users", path: "/admin/users" },
  { label: "User activity", path: "/admin/user-activity" },
  { label: "Error log", path: "/admin/error-log" },
  { label: "Sync log", path: "/admin/sync-log" },
  { label: "Deployments", path: "/admin/deployments", superadmin: true },
];

/**
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

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-header__inner">
          <BrandLogo to="/admin" className="admin-brand" />

          <div className="admin-actions">
            {rightActions}
          </div>
        </div>
      </header>

      <nav className="admin-nav" aria-label="Admin sections">
        <div className="admin-nav__inner">
          {ADMIN_NAV.map(({ label, path, superadmin }) => {
            const href = path.startsWith("/") ? path : `/admin${path === "/" ? "" : path}`;
            const isActive = pathname === href || (pathname.startsWith(href + "/"));
            return (
              <Link
                key={href}
                to={href}
                className={`admin-nav__link ${isActive ? "admin-nav__link--active" : ""} ${superadmin ? "admin-nav__link--superadmin" : ""}`}
              >
                {label}
              </Link>
            );
          })}
          <MapEditSubNav linkClassName="admin-nav__link" />
        </div>
      </nav>

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

      <main className={`admin-main ${mainClassName}`.trim()}>{children}</main>
    </div>
  );
}

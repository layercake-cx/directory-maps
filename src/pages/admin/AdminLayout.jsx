import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import BrandLogo from "../../components/BrandLogo.jsx";
import MapEditSubNav from "../../components/MapEditSubNav.jsx";
import "./admin.css";

const ADMIN_NAV = [
  { label: "Customers", path: "/admin/clients" },
  { label: "Maps", path: "/admin/maps" },
  { label: "Admin Users", path: "/admin/users" },
  { label: "Leads", path: "/admin/leads" },
  {
    label: "Logs",
    children: [
      { label: "User activity", path: "/admin/user-activity" },
      { label: "Error log", path: "/admin/error-log" },
      { label: "Sync log", path: "/admin/sync-log" },
    ],
  },
  { label: "Deployments", path: "/admin/deployments", superadmin: true },
];

function resolveHref(path) {
  return path.startsWith("/") ? path : `/admin${path === "/" ? "" : path}`;
}

function isPathActive(pathname, href) {
  return pathname === href || pathname.startsWith(href + "/");
}

/** Admin routes editing a specific client's map (Design / Data / Listings). */
function isAdminClientMapRoute(pathname) {
  return /^\/admin\/clients\/[^/]+\/maps\/[^/]+/.test(pathname || "");
}

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
  const showMapSubNav = isAdminClientMapRoute(pathname);

  const [openMenu, setOpenMenu] = useState(null);
  const navRef = useRef(null);

  useEffect(() => {
    setOpenMenu(null);
  }, [pathname]);

  useEffect(() => {
    function onDocClick(e) {
      if (navRef.current && !navRef.current.contains(e.target)) setOpenMenu(null);
    }
    function onKeyDown(e) {
      if (e.key === "Escape") setOpenMenu(null);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

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

      <nav className="admin-nav" aria-label="Admin sections" ref={navRef}>
        <div className="admin-nav__inner">
          {ADMIN_NAV.map((item) => {
            if (item.children) {
              const isOpen = openMenu === item.label;
              const isChildActive = item.children.some(({ path }) =>
                isPathActive(pathname, resolveHref(path))
              );
              return (
                <div className="admin-nav__dropdown" key={item.label}>
                  <button
                    type="button"
                    className={`admin-nav__link admin-nav__link--dropdown ${isChildActive ? "admin-nav__link--active" : ""}`}
                    aria-haspopup="true"
                    aria-expanded={isOpen}
                    onClick={() => setOpenMenu(isOpen ? null : item.label)}
                  >
                    {item.label}
                    <span className="admin-nav__caret" aria-hidden="true">▾</span>
                  </button>
                  {isOpen && (
                    <div className="admin-nav__menu" role="menu">
                      {item.children.map(({ label, path }) => {
                        const href = resolveHref(path);
                        const isActive = isPathActive(pathname, href);
                        return (
                          <Link
                            key={href}
                            to={href}
                            role="menuitem"
                            className={`admin-nav__menu-item ${isActive ? "admin-nav__menu-item--active" : ""}`}
                          >
                            {label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const { label, path, superadmin } = item;
            const href = resolveHref(path);
            const isActive = isPathActive(pathname, href);
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

      {showMapSubNav && <MapEditSubNav standalone />}

      <main className={`admin-main ${mainClassName}`.trim()}>{children}</main>
    </div>
  );
}

import React from "react";
import { Link, useLocation } from "react-router-dom";
import BrandLogo from "../../components/BrandLogo.jsx";
import "./admin.css";

const ADMIN_NAV = [
  { label: "Customers", path: "/admin/clients" },
  { label: "Maps", path: "/admin/maps" },
  { label: "Admin Users", path: "/admin/users" },
  { label: "Deployments", path: "/admin/deployments", superadmin: true },
];

export default function AdminLayout({ rightActions, children, mainClassName = "", breadcrumbs = [] }) {
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

      <main className={`admin-main ${mainClassName}`.trim()}>{children}</main>
    </div>
  );
}

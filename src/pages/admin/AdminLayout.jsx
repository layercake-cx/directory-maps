import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";
import MapEditSubNav from "../../components/MapEditSubNav.jsx";
import AppShell from "../../components/shell/AppShell.jsx";
import PageHead from "../../components/shell/PageHead.jsx";
import { recordCustomerVisit } from "../../lib/recentCustomers.js";
import "./admin.css";

/** Admin routes editing a specific client's map (Design / Data / Listings). */
function isAdminClientMapRoute(pathname) {
  return /^\/admin\/clients\/[^/]+\/maps\/[^/]+/.test(pathname || "");
}

/** /admin/clients/:clientId(/...) — staff viewing one customer's workspace, per IA §4. */
function clientWorkspaceIdFromPath(pathname) {
  const match = (pathname || "").match(/^\/admin\/clients\/([^/]+)/);
  return match && match[1] !== "new" ? match[1] : null;
}

/**
 * Every admin page still imports and wraps its content in this component (there is no
 * route-level admin layout yet — see BUILD plan §3 for why that restructuring was skipped
 * in Phase 1). What changed: the old bespoke header + ADMIN_NAV bar is now the shared
 * AppShell/TopBar/Rail (platform context — the brief's "staff client workspace renders
 * inside the client shell" treatment for /admin/clients/:clientId/... is explicitly Phase 3
 * work, not attempted here). A page under a client workspace that wants its own left-column
 * sub-nav (matching the client portal's own pattern) passes `panel` — see
 * CustomerWorkspaceFeaturePanel/DirectoryFeaturePanel — rather than a horizontal tab bar.
 *
 * @param {{
 *   rightActions?: React.ReactNode,
 *   subtitle?: React.ReactNode,
 *   children: React.ReactNode,
 *   mainClassName?: string,
 *   breadcrumbs?: {label: string, path?: string}[],
 *   panel?: React.ReactNode,
 * }} props
 */
export default function AdminLayout({
  rightActions,
  subtitle,
  children,
  mainClassName = "",
  breadcrumbs = [],
  panel,
}) {
  const location = useLocation();
  const pathname = location.pathname || "/";
  const showMapSubNav = isAdminClientMapRoute(pathname);
  const clientWorkspaceId = clientWorkspaceIdFromPath(pathname);
  // The map design page is edge-to-edge: no page title/padding; the sub-nav carries the actions instead.
  const flush = showMapSubNav && mainClassName.includes("admin-main--map-page");
  const context = clientWorkspaceId ? "client" : "platform";

  useEffect(() => {
    if (clientWorkspaceId) recordCustomerVisit(clientWorkspaceId);
  }, [clientWorkspaceId]);

  return (
    <AppShell
      context={context}
      isStaff
      homeHref={clientWorkspaceId ? `/admin/clients/${encodeURIComponent(clientWorkspaceId)}` : "/admin/clients"}
      activeClientId={clientWorkspaceId}
      panel={panel}
    >
      <div className={`admin-main ${mainClassName}`.trim()}>
        {!flush && (breadcrumbs.length > 0 || rightActions) && (
          breadcrumbs.length > 0 ? (
            <PageHead
              title={breadcrumbs[breadcrumbs.length - 1].label}
              breadcrumb={breadcrumbs.slice(0, -1).map((item) => ({ label: item.label, to: item.path }))}
              subtitle={subtitle}
              actions={rightActions}
            />
          ) : (
            // No title to show (actions only): keep the head row so the actions stay right-aligned.
            <div className="page-head">
              <div className="page-head-text">{subtitle ? <p className="page-subtitle">{subtitle}</p> : null}</div>
              <div className="page-head-actions">{rightActions}</div>
            </div>
          )
        )}

        {showMapSubNav && <MapEditSubNav standalone actions={flush ? rightActions : null} />}

        {children}
      </div>
    </AppShell>
  );
}

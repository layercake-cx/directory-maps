import React from "react";
import { Link } from "react-router-dom";

/**
 * Platform › Customers panel (IA §7). Views are client-side filters (not distinct routes — the
 * customer list itself doesn't change URL), so they're `<button>`s per the brief's own
 * "button for actions, `<a>`/`<Link>` for navigation" rule; "Recently viewed" links to a real
 * destination (a specific customer), so those are real `<Link>`s.
 */
export default function CustomersFeaturePanel({ activeView, onSelectView, planCounts, betaCount, allCount, recentClients }) {
  const views = [
    { key: "all", label: "All customers", count: allCount },
    ...planCounts,
    ...(betaCount > 0 ? [{ key: "beta", label: "With beta access", count: betaCount }] : []),
  ];

  return (
    <nav className="panel" aria-label="Customers navigation">
      <div className="panel-head">
        <h2 className="panel-title">Customers</h2>
      </div>
      <div className="panel-divider" />
      <div className="nav-group">
        <p className="nav-group-label">Views</p>
        {views.map((v) => (
          <button
            key={v.key}
            type="button"
            className="nav-item"
            aria-current={activeView === v.key ? "true" : undefined}
            onClick={() => onSelectView(v.key)}
            style={{ width: "100%", border: 0, background: activeView === v.key ? undefined : "transparent", cursor: "pointer" }}
          >
            <span>{v.label}</span>
            <span className="nav-count">{v.count}</span>
          </button>
        ))}
      </div>
      {recentClients.length > 0 && (
        <div className="nav-group">
          <p className="nav-group-label">Recently viewed</p>
          {recentClients.map((c) => (
            <Link key={c.id} to={`/admin/clients/${c.id}`} className="nav-item">
              <span>{c.name}</span>
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}

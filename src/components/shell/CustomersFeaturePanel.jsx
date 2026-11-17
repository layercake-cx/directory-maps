import React from "react";
import { Link } from "react-router-dom";

/**
 * Platform › Customers panel (IA §7). Status views and the Plan / Beta access filters live on the list
 * itself (ListPage), so the panel only keeps "Recently viewed" — real links to specific customers.
 */
export default function CustomersFeaturePanel({ recentClients }) {
  return (
    <nav className="panel" aria-label="Customers navigation">
      <div className="panel-head">
        <h2 className="panel-title">Customers</h2>
      </div>
      <div className="panel-divider" />
      {recentClients.length > 0 ? (
        <div className="nav-group">
          <p className="nav-group-label">Recently viewed</p>
          {recentClients.map((c) => (
            <Link key={c.id} to={`/admin/clients/${c.id}`} className="nav-item">
              <span>{c.name}</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="nav-group-label">Customers you open will appear here.</p>
      )}
    </nav>
  );
}

import React from "react";
import { Link } from "react-router-dom";
import "./admin.css";

import logo from "../../assets/layercake-logo.png"; // <- adjust filename if needed

export default function AdminLayout({ title, rightActions, children }) {
  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-header__inner">
          <div className="admin-brand">
            <img src={logo} alt="Layercake" />
            <div className="admin-title">{title}</div>
          </div>

          <div className="admin-actions">
            <Link to="/">Back to map</Link>
            {rightActions}
          </div>
        </div>
      </header>

      <main className="admin-main">{children}</main>
    </div>
  );
}
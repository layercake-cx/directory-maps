import React from "react";
import { signOut } from "../../lib/auth";
import AdminLayout from "./AdminLayout.jsx";

export default function AdminUsers() {
  return (
    <AdminLayout
      breadcrumbs={[{ label: "Admin Users" }]}
      rightActions={
        <button onClick={signOut} type="button">
          Sign out
        </button>
      }
    >
      <div className="admin-card">
        <h2 style={{ marginTop: 0 }}>Admin Users</h2>
        <p style={{ color: "var(--lc-muted)" }}>Manage admin users and permissions.</p>
      </div>
    </AdminLayout>
  );
}

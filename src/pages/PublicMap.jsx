import React from "react";
import { Link } from "react-router-dom";

export default function PublicMap() {
  return (
    <div style={{ padding: 32, maxWidth: 960, margin: "0 auto" }}>
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ margin: "0 0 12px 0" }}>Directory Maps</h1>
        <p style={{ margin: 0, opacity: 0.8 }}>
          Create interactive Google Maps-based directories and upload your own data.
        </p>
      </header>

      <section
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          padding: 24,
          borderRadius: 16,
          border: "1px solid #e5e7eb",
          background: "#f9fafb",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 20 }}>Client sign-up & login</h2>
        <p style={{ margin: 0, opacity: 0.85 }}>
          If you are a client, you can create an account, build maps, and upload your listings directly.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
          <Link
            to="/client"
            className="btn btn-primary"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            Open client portal
          </Link>
          <a
            href="mailto:support@example.com"
            className="btn"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            Contact us
          </a>
        </div>
      </section>

      <section style={{ marginTop: 32, fontSize: 13, opacity: 0.75 }}>
        <p style={{ margin: 0 }}>
          Admins can continue to use the{" "}
          <a href="#/admin/clients">admin interface</a> to manage all client maps.
        </p>
      </section>
    </div>
  );
}

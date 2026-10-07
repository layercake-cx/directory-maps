import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import AdminLayout from "./AdminLayout.jsx";

export default function AdminUsers() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr("");
        const [{ data: profiles, error: pErr }, { data: contacts, error: cErr }] = await Promise.all([
          supabase.from("profiles").select("user_id, role").eq("role", "admin"),
          supabase.from("contacts").select("user_id, name, email, is_primary, created_at"),
        ]);
        if (pErr) throw pErr;
        if (cErr) throw cErr;
        if (cancelled) return;

        const contactsByUserId = {};
        for (const c of contacts ?? []) {
          if (!c.user_id) continue;
          const existing = contactsByUserId[c.user_id];
          if (!existing) {
            contactsByUserId[c.user_id] = c;
            continue;
          }
          const existingScore = (existing.is_primary ? 10 : 0) + (existing.name ? 2 : 0);
          const nextScore = (c.is_primary ? 10 : 0) + (c.name ? 2 : 0);
          if (nextScore > existingScore) contactsByUserId[c.user_id] = c;
        }

        const merged = (profiles ?? []).map((p) => {
          const contact = contactsByUserId[p.user_id] ?? null;
          return {
            user_id: p.user_id,
            role: p.role ?? "admin",
            name: contact?.name ?? null,
            email: contact?.email ?? null,
          };
        });
        merged.sort((a, b) => String(a.name || a.email || a.user_id).localeCompare(String(b.name || b.email || b.user_id)));
        setRows(merged);
      } catch (e) {
        if (!cancelled) setErr(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminLayout
      breadcrumbs={[{ label: "Admin Users" }]}
      subtitle="View admin user details and activity."
    >
      <div className="card card-pad">
        {err ? <p style={{ color: "#b91c1c" }}>{err}</p> : null}
        {loading ? (
          <p>Loading…</p>
        ) : rows.length === 0 ? (
          <p style={{ color: "var(--lc-muted)" }}>No admin users found.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>User ID</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user_id}>
                  <td>
                    <Link to={`/admin/users/${encodeURIComponent(r.user_id)}`}>
                      {r.name || r.email || `${r.user_id.slice(0, 8)}…`}
                    </Link>
                  </td>
                  <td>{r.email || "—"}</td>
                  <td>{r.role || "admin"}</td>
                  <td style={{ fontSize: 12, opacity: 0.8 }}>{r.user_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminLayout>
  );
}

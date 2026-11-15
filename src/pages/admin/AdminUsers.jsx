import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import AdminLayout from "./AdminLayout.jsx";
import { Callout, DataTable, EmptyState, PageLayout, Section } from "../../components/ui/index.js";
import "../../styles/wave-b/map-pages.css";
import "../../styles/wave-c/maps-users.css";

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

  const columns = [
    { key: "name", label: "Name", render: (r) => r.name || r.email || `${r.user_id.slice(0, 8)}…` },
    { key: "email", label: "Email", render: (r) => r.email || "—" },
    { key: "role", label: "Role", render: (r) => r.role || "admin" },
    { key: "user_id", label: "User ID", render: (r) => <span className="mu-code">{r.user_id}</span> },
  ];

  return (
    <AdminLayout>
      <PageLayout head={{ title: "Admin users", subtitle: "View admin user details and activity." }}>
        <div className="mp-stack">
          {err ? <Callout tone="danger">{err}</Callout> : null}
          <Section flush>
            <DataTable
              columns={columns}
              rows={rows}
              getRowId={(r) => r.user_id}
              getRowLabel={(r) => r.name || r.email || r.user_id}
              rowLink={(r) => `/admin/users/${encodeURIComponent(r.user_id)}`}
              loading={loading}
              caption="Admin users"
              empty={<EmptyState art="searching" title="No admin users found" />}
            />
          </Section>
        </div>
      </PageLayout>
    </AdminLayout>
  );
}

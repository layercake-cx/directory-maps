import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { signOut } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import AdminLayout from "./AdminLayout.jsx";

function formatUtc(iso) {
  if (!iso) return "—";
  return iso.replace("T", " ").replace(/\.\d{3}Z?$/, "Z");
}

export default function AdminUserDetail() {
  const { userId } = useParams();
  const [activeTab, setActiveTab] = useState("details");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [adminProfile, setAdminProfile] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [activities, setActivities] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr("");
        const [{ data: profile, error: pErr }, { data: userContacts, error: cErr }, { data: acts, error: aErr }] =
          await Promise.all([
            supabase.from("profiles").select("user_id, role").eq("user_id", userId).maybeSingle(),
            supabase
              .from("contacts")
              .select("id, client_id, name, email, is_primary, role, can_manage_maps, can_manage_users, created_at")
              .eq("user_id", userId)
              .order("created_at", { ascending: true }),
            supabase
              .from("admin_events")
              .select("id, occurred_at, event_type, event_subtype, client_id, map_id, actor_user_id, meta")
              .or(`actor_user_id.eq.${userId},meta->>actor_user_id.eq.${userId}`)
              .order("occurred_at", { ascending: false })
              .limit(200),
          ]);
        if (pErr) throw pErr;
        if (cErr) throw cErr;
        if (aErr) throw aErr;
        if (cancelled) return;
        setAdminProfile(profile ?? null);
        setContacts(userContacts ?? []);
        setActivities(acts ?? []);
      } catch (e) {
        if (!cancelled) setErr(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const displayName = useMemo(() => {
    const c = contacts.find((row) => row.name) || contacts[0];
    return c?.name || c?.email || userId;
  }, [contacts, userId]);

  return (
    <AdminLayout
      breadcrumbs={[
        { label: "Admin Users", path: "/admin/users" },
        { label: displayName || "User" },
      ]}
      rightActions={
        <button onClick={signOut} type="button">
          Sign out
        </button>
      }
    >
      <div className="admin-card">
        <div style={{ marginBottom: 12 }}>
          <Link to="/admin/users">← Back to admin users</Link>
        </div>
        <h2 style={{ marginTop: 0 }}>{displayName}</h2>
        <div className="admin-map-tabs" style={{ marginBottom: 16 }}>
          <button
            type="button"
            className={`admin-map-tabs__tab ${activeTab === "details" ? "is-active" : ""}`}
            onClick={() => setActiveTab("details")}
          >
            Details
          </button>
          <button
            type="button"
            className={`admin-map-tabs__tab ${activeTab === "activities" ? "is-active" : ""}`}
            onClick={() => setActiveTab("activities")}
          >
            Activities
          </button>
        </div>

        {loading ? <p>Loading…</p> : null}
        {err ? <p style={{ color: "#b91c1c" }}>{err}</p> : null}

        {!loading && !err && activeTab === "details" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div><strong>User ID:</strong> {userId}</div>
            <div><strong>Admin role:</strong> {adminProfile?.role || "—"}</div>
            <h3 style={{ margin: "8px 0 0", fontSize: 16 }}>Contact links</h3>
            {contacts.length === 0 ? (
              <p style={{ color: "var(--lc-muted)" }}>No linked contacts found.</p>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Primary</th>
                    <th>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link to={`/admin/clients/${encodeURIComponent(c.client_id)}`}>{c.client_id}</Link>
                      </td>
                      <td>{c.name || "—"}</td>
                      <td>{c.email || "—"}</td>
                      <td>{c.is_primary ? "Yes" : "—"}</td>
                      <td>{c.role || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}

        {!loading && !err && activeTab === "activities" ? (
          activities.length === 0 ? (
            <p style={{ color: "var(--lc-muted)" }}>No activity recorded for this user yet.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Time (UTC)</th>
                  <th>Event</th>
                  <th>Subtype</th>
                  <th>Client</th>
                  <th>Meta</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((a) => (
                  <tr key={a.id}>
                    <td>{formatUtc(a.occurred_at)}</td>
                    <td><code>{a.event_type}</code></td>
                    <td>{a.event_subtype || "—"}</td>
                    <td>{a.client_id ? <Link to={`/admin/clients/${encodeURIComponent(a.client_id)}`}>{a.client_id}</Link> : "—"}</td>
                    <td style={{ maxWidth: 420 }}>
                      <pre style={{ margin: 0, fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {JSON.stringify(a.meta ?? {}, null, 2)}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : null}
      </div>
    </AdminLayout>
  );
}

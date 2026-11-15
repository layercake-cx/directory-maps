import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import AdminLayout from "./AdminLayout.jsx";
import { Callout, DataTable, EmptyState, RecordLayout, Section, Skeleton } from "../../components/ui/index.js";
import "../../styles/wave-b/map-pages.css";
import "../../styles/wave-c/maps-users.css";

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

  const contactColumns = [
    {
      key: "client",
      label: "Client",
      render: (c) => <Link to={`/admin/clients/${encodeURIComponent(c.client_id)}`}>{c.client_id}</Link>,
    },
    { key: "name", label: "Name", render: (c) => c.name || "—" },
    { key: "email", label: "Email", render: (c) => c.email || "—" },
    { key: "primary", label: "Primary", render: (c) => (c.is_primary ? "Yes" : "—") },
    { key: "role", label: "Role", render: (c) => c.role || "—" },
  ];

  const activityColumns = [
    { key: "time", label: "Time (UTC)", className: "mu-nowrap", render: (a) => formatUtc(a.occurred_at) },
    { key: "event", label: "Event", render: (a) => <code>{a.event_type}</code> },
    { key: "subtype", label: "Subtype", render: (a) => a.event_subtype || "—" },
    {
      key: "client",
      label: "Client",
      render: (a) => (a.client_id ? <Link to={`/admin/clients/${encodeURIComponent(a.client_id)}`}>{a.client_id}</Link> : "—"),
    },
    { key: "meta", label: "Meta", render: (a) => <pre className="mu-meta">{JSON.stringify(a.meta ?? {}, null, 2)}</pre> },
  ];

  const ready = !loading && !err;

  return (
    <AdminLayout>
      <RecordLayout
        head={{
          title: displayName || "User",
          breadcrumb: [{ label: "Admin users", to: "/admin/users" }, { label: displayName || "User" }],
        }}
        tabs={{
          tabs: [
            { key: "details", label: "Details" },
            { key: "activities", label: "Activities" },
          ],
          current: activeTab,
          onSelect: setActiveTab,
          label: "User sections",
        }}
      >
        {loading ? <Skeleton variant="form" rows={3} label="Loading user" /> : null}
        {err ? <Callout tone="danger">{err}</Callout> : null}

        {ready && activeTab === "details" ? (
          <>
            <Section title="Admin user">
              <dl className="mu-detail-list">
                <dt>User ID</dt>
                <dd>{userId}</dd>
                <dt>Admin role</dt>
                <dd>{adminProfile?.role || "—"}</dd>
              </dl>
            </Section>
            <Section title="Contact links" flush>
              <DataTable
                columns={contactColumns}
                rows={contacts}
                getRowId={(c) => c.id}
                getRowLabel={(c) => c.name || c.email || c.client_id}
                caption="Contact links"
                empty={<EmptyState art="searching" title="No linked contacts found" />}
              />
            </Section>
          </>
        ) : null}

        {ready && activeTab === "activities" ? (
          <Section title="Activities" flush>
            <DataTable
              columns={activityColumns}
              rows={activities}
              getRowId={(a) => a.id}
              getRowLabel={(a) => a.event_type}
              caption="Activities"
              empty={<EmptyState art="searching" title="No activity recorded for this user yet" />}
            />
          </Section>
        ) : null}
      </RecordLayout>
    </AdminLayout>
  );
}

import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { signOut } from "../../lib/auth";
import AdminLayout from "./AdminLayout.jsx";

export default function AdminContactDetail() {
  const { clientId, contactId } = useParams();
  const [contact, setContact] = useState(null);
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editName, setEditName] = useState("");
  const [editIsPrimary, setEditIsPrimary] = useState(false);
  const [editCanManageMaps, setEditCanManageMaps] = useState(false);
  const [editCanManageUsers, setEditCanManageUsers] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setErr("");

        const { data: c, error: ce } = await supabase
          .from("contacts")
          .select("id, client_id, user_id, email, name, is_primary, can_manage_maps, can_manage_users, created_at, updated_at")
          .eq("id", contactId)
          .eq("client_id", clientId)
          .maybeSingle();

        if (!mounted) return;
        if (ce) throw ce;
        if (!c) {
          setErr("Contact not found.");
          setLoading(false);
          return;
        }

        setContact(c);
        setEditEmail(c.email ?? "");
        setEditName(c.name ?? "");
        setEditIsPrimary(!!c.is_primary);
        setEditCanManageMaps(!!c.can_manage_maps);
        setEditCanManageUsers(!!c.can_manage_users);

        const { data: clientData, error: clientError } = await supabase
          .from("clients")
          .select("id, name, slug")
          .eq("id", clientId)
          .single();

        if (!mounted) return;
        if (clientError) throw clientError;
        setClient(clientData ?? null);
      } catch (e) {
        if (mounted) setErr(e?.message ?? String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [clientId, contactId]);

  async function handleSave(e) {
    e.preventDefault();
    if (!contact) return;
    setErr("");
    setSaving(true);
    try {
      const { error } = await supabase
        .from("contacts")
        .update({
          email: editEmail.trim(),
          name: editName.trim() || null,
          is_primary: editIsPrimary,
          can_manage_maps: editCanManageMaps,
          can_manage_users: editCanManageUsers,
          updated_at: new Date().toISOString(),
        })
        .eq("id", contactId)
        .eq("client_id", clientId);
      if (error) throw error;
      setContact((prev) =>
        prev
          ? {
              ...prev,
              email: editEmail.trim(),
              name: editName.trim() || null,
              is_primary: editIsPrimary,
              can_manage_maps: editCanManageMaps,
              can_manage_users: editCanManageUsers,
            }
          : null
      );
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout
      breadcrumbs={[
        { label: "Customers", path: "/admin/clients" },
        { label: client?.name ?? "…", path: `/admin/clients/${encodeURIComponent(clientId)}` },
        { label: "Contact" },
      ]}
      rightActions={
        <button onClick={signOut} type="button">
          Sign out
        </button>
      }
    >
      <div className="admin-card">
        <div style={{ marginBottom: 12 }}>
          <Link to={`/admin/clients/${encodeURIComponent(clientId)}`}>← Back to customer</Link>
        </div>

        {loading ? <p>Loading…</p> : null}
        {err ? <p>{err}</p> : null}

        {contact && client && !loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <h2 style={{ margin: "0 0 8px 0" }}>Edit contact</h2>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              <strong>Customer:</strong>{" "}
              <Link to={`/admin/clients/${encodeURIComponent(clientId)}`}>{client.name}</Link>
              {client.slug ? ` (${client.slug})` : ""}
              {" · "}
              <span style={{ opacity: 0.75 }}>Has login: {contact.user_id ? "Yes" : "No"}</span>
              {contact.user_id ? ` · User ID: ${contact.user_id}` : ""}
            </div>

            <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 480 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, marginBottom: 4, color: "var(--lc-muted)" }}>Email</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  required
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--lc-border)", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, marginBottom: 4, color: "var(--lc-muted)" }}>Name (optional)</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--lc-border)", boxSizing: "border-box" }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={editIsPrimary} onChange={(e) => setEditIsPrimary(e.target.checked)} />
                  Primary contact
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={editCanManageMaps} onChange={(e) => setEditCanManageMaps(e.target.checked)} />
                  Manage maps
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={editCanManageUsers} onChange={(e) => setEditCanManageUsers(e.target.checked)} />
                  Manage users
                </label>
              </div>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            </form>

            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Contact ID: {contact.id}
            </div>
          </div>
        ) : null}
      </div>
    </AdminLayout>
  );
}

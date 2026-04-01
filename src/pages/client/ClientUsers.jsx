import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useClient } from "../../context/ClientContext.jsx";

export default function ClientUsers() {
  const { client, contact, refetch } = useClient();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addCanManageMaps, setAddCanManageMaps] = useState(false);
  const [addCanManageUsers, setAddCanManageUsers] = useState(false);
  const [adding, setAdding] = useState(false);

  const canManageUsers = contact?.is_primary || contact?.can_manage_users;

  useEffect(() => {
    if (!client?.id) return;

    (async () => {
      try {
        setLoading(true);
        setErr("");

        const { data, error } = await supabase
          .from("contacts")
          .select("id, email, name, is_primary, can_manage_maps, can_manage_users, user_id")
          .eq("client_id", client.id)
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: true });

        if (error) throw error;
        setContacts(data ?? []);
      } catch (e) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [client?.id]);

  async function handleAddUser(e) {
    e.preventDefault();
    const email = addEmail.trim();
    const name = addName.trim() || null;
    if (!email) {
      setErr("Email is required.");
      return;
    }
    if (!client?.id) return;

    setErr("");
    setAdding(true);
    try {
      const { error } = await supabase.from("contacts").insert({
        client_id: client.id,
        email,
        name,
        is_primary: false,
        can_manage_maps: addCanManageMaps,
        can_manage_users: addCanManageUsers,
      });
      if (error) throw error;
      setAddEmail("");
      setAddName("");
      setAddCanManageMaps(false);
      setAddCanManageUsers(false);
      const { data } = await supabase
        .from("contacts")
        .select("id, email, name, is_primary, can_manage_maps, can_manage_users, user_id")
        .eq("client_id", client.id)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });
      setContacts(data ?? []);
      refetch?.();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setAdding(false);
    }
  }

  async function updatePermissions(contactId, can_manage_maps, can_manage_users) {
    setErr("");
    try {
      const { error } = await supabase
        .from("contacts")
        .update({ can_manage_maps, can_manage_users, updated_at: new Date().toISOString() })
        .eq("id", contactId)
        .eq("client_id", client.id);
      if (error) throw error;
      setContacts((prev) =>
        prev.map((c) =>
          c.id === contactId ? { ...c, can_manage_maps, can_manage_users } : c
        )
      );
      refetch?.();
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }

  if (!canManageUsers) {
    return (
      <div className="admin-card" style={{ marginTop: 16 }}>
        <p>You don't have permission to manage users. Only the primary contact or users with "Manage users" can access this page.</p>
      </div>
    );
  }

  return (
    <div className="admin-card" style={{ marginTop: 16 }}>
      <h2 style={{ margin: "0 0 16px 0", fontSize: 18 }}>Users</h2>
      <p style={{ margin: "0 0 16px 0", fontSize: 14, color: "var(--lc-muted)" }}>
        Add users to your organisation and assign permissions. Users can be given "Manage maps" and/or "Manage users".
      </p>

      {err ? <p style={{ color: "#b91c1c", marginBottom: 12 }}>{err}</p> : null}

      <form onSubmit={handleAddUser} style={{ marginBottom: 24, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <div>
          <label style={{ display: "block", fontSize: 12, marginBottom: 4, color: "var(--lc-muted)" }}>Email</label>
          <input
            type="email"
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
            placeholder="user@example.com"
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--lc-border)", minWidth: 200 }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, marginBottom: 4, color: "var(--lc-muted)" }}>Name (optional)</label>
          <input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Jane Smith"
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--lc-border)", minWidth: 160 }}
          />
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={addCanManageMaps}
              onChange={(e) => setAddCanManageMaps(e.target.checked)}
            />
            Manage maps
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={addCanManageUsers}
              onChange={(e) => setAddCanManageUsers(e.target.checked)}
            />
            Manage users
          </label>
        </div>
        <button type="submit" className="btn btn-primary" disabled={adding}>
          {adding ? "Adding…" : "Add user"}
        </button>
      </form>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table className="admin-table" style={{ marginTop: 0 }}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Primary</th>
              <th>Manage maps</th>
              <th>Manage users</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id}>
                <td>{c.email}</td>
                <td>{c.name || "—"}</td>
                <td>{c.is_primary ? "Yes" : "—"}</td>
                <td>
                  {c.is_primary ? (
                    <span className="badge">Yes (primary)</span>
                  ) : (
                    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={!!c.can_manage_maps}
                        onChange={(e) => updatePermissions(c.id, e.target.checked, c.can_manage_users)}
                      />
                      {c.can_manage_maps ? "Yes" : "No"}
                    </label>
                  )}
                </td>
                <td>
                  {c.is_primary ? (
                    <span className="badge">Yes (primary)</span>
                  ) : (
                    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={!!c.can_manage_users}
                        onChange={(e) => updatePermissions(c.id, c.can_manage_maps, e.target.checked)}
                      />
                      {c.can_manage_users ? "Yes" : "No"}
                    </label>
                  )}
                </td>
                <td>
                  {c.user_id ? (
                    <span style={{ fontSize: 12, color: "var(--lc-muted)" }}>Has login</span>
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--lc-muted)" }}>Pending invite</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && contacts.length === 0 ? (
        <p style={{ marginTop: 12, color: "var(--lc-muted)" }}>No users yet. Add one above.</p>
      ) : null}
    </div>
  );
}

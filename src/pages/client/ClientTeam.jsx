import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { getContactForCurrentUser, canManageOrg } from "../../lib/clientAuth";
import { sendInvitation } from "../../lib/inviteHelpers";

const ROLE_LABELS = { owner: "Owner", manager: "Manager", member: "Member" };

export default function ClientTeam() {
  const navigate = useNavigate();

  const [myContact, setMyContact] = useState(null);
  const [client, setClient] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [maps, setMaps] = useState([]);
  // { [contactId]: Set<mapId> }
  const [mapPerms, setMapPerms] = useState({});

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteMapIds, setInviteMapIds] = useState(new Set());

  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [msg, setMsg] = useState({ text: "", error: false });

  const isOwner = myContact?.role === "owner";

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);

      const ct = await getContactForCurrentUser();
      if (!ct || !canManageOrg(ct)) {
        navigate("/client", { replace: true });
        return;
      }
      setMyContact(ct);

      const { data: clientData } = await supabase
        .from("clients")
        .select("id, name, slug")
        .eq("id", ct.client_id)
        .single();
      setClient(clientData);

      const [{ data: contactsData }, { data: mapsData }] = await Promise.all([
        supabase
          .from("contacts")
          .select("id, email, name, role, is_primary")
          .eq("client_id", ct.client_id)
          .order("role", { ascending: true }),
        supabase
          .from("maps")
          .select("id, name")
          .eq("client_id", ct.client_id)
          .order("name", { ascending: true }),
      ]);

      setContacts(contactsData ?? []);
      setMaps(mapsData ?? []);

      // Load map permissions for all member contacts
      const memberIds = (contactsData ?? [])
        .filter((c) => c.role === "member")
        .map((c) => c.id);

      if (memberIds.length) {
        const { data: perms } = await supabase
          .from("contact_map_permissions")
          .select("contact_id, map_id")
          .in("contact_id", memberIds);

        const byContact = {};
        for (const p of perms ?? []) {
          if (!byContact[p.contact_id]) byContact[p.contact_id] = new Set();
          byContact[p.contact_id].add(p.map_id);
        }
        setMapPerms(byContact);
      }
    } catch (e) {
      setMsg({ text: e?.message ?? String(e), error: true });
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite(e) {
    e.preventDefault();
    setMsg({ text: "", error: false });
    setInviting(true);
    try {
      await sendInvitation({
        clientId: client.id,
        email: inviteEmail,
        role: inviteRole,
        invitedByContactId: myContact.id,
        mapIds: inviteRole === "member" ? Array.from(inviteMapIds) : [],
      });
      setMsg({ text: `Invitation sent to ${inviteEmail}.`, error: false });
      setInviteEmail("");
      setInviteRole("member");
      setInviteMapIds(new Set());
    } catch (e) {
      setMsg({ text: e?.message ?? String(e), error: true });
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(contactId, newRole) {
    try {
      await supabase.from("contacts").update({ role: newRole }).eq("id", contactId);
      setContacts((prev) =>
        prev.map((c) => (c.id === contactId ? { ...c, role: newRole } : c))
      );
    } catch (e) {
      setMsg({ text: e?.message ?? String(e), error: true });
    }
  }

  async function handleRemove(contactId) {
    if (!window.confirm("Remove this team member? They will lose access immediately.")) return;
    try {
      await supabase.from("contacts").delete().eq("id", contactId);
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
      setMapPerms((prev) => {
        const next = { ...prev };
        delete next[contactId];
        return next;
      });
    } catch (e) {
      setMsg({ text: e?.message ?? String(e), error: true });
    }
  }

  async function handleMapPermToggle(contactId, mapId, currentlyGranted) {
    try {
      if (currentlyGranted) {
        await supabase
          .from("contact_map_permissions")
          .delete()
          .eq("contact_id", contactId)
          .eq("map_id", mapId);
        setMapPerms((prev) => {
          const next = { ...prev, [contactId]: new Set(prev[contactId]) };
          next[contactId].delete(mapId);
          return next;
        });
      } else {
        await supabase
          .from("contact_map_permissions")
          .insert({ contact_id: contactId, map_id: mapId });
        setMapPerms((prev) => {
          const next = { ...prev, [contactId]: new Set(prev[contactId] ?? []) };
          next[contactId].add(mapId);
          return next;
        });
      }
    } catch (e) {
      setMsg({ text: e?.message ?? String(e), error: true });
    }
  }

  function toggleInviteMapId(mapId) {
    setInviteMapIds((prev) => {
      const next = new Set(prev);
      if (next.has(mapId)) next.delete(mapId);
      else next.add(mapId);
      return next;
    });
  }

  if (loading) return <div className="page-main"><p>Loading…</p></div>;

  return (
    <div className="page-main">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: "0 0 4px 0" }}>Team — {client?.name}</h1>
          <div style={{ fontSize: 13, opacity: 0.75 }}>Manage team members and their map access</div>
        </div>
        <button type="button" className="btn" onClick={() => navigate("/client")}>
          ← Back
        </button>
      </header>

      {msg.text ? (
        <p style={{ color: msg.error ? "var(--color-error, #c00)" : "inherit", marginBottom: 12 }}>
          {msg.text}
        </p>
      ) : null}

      {/* Team list */}
      <div className="admin-card" style={{ marginBottom: 24 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Team members</h2>
        {contacts.length === 0 ? (
          <p style={{ margin: 0, opacity: 0.8 }}>No team members yet.</p>
        ) : (
          <table className="admin-table" style={{ marginTop: 0 }}>
            <thead>
              <tr>
                <th>Email / Name</th>
                <th>Role</th>
                <th>Map access</th>
                {isOwner && <th></th>}
              </tr>
            </thead>
            <tbody>
              {contacts.map((ct) => {
                const isSelf = ct.id === myContact.id;
                const perms = mapPerms[ct.id] ?? new Set();
                const isPrivileged = ct.role === "owner" || ct.role === "manager";

                return (
                  <tr key={ct.id}>
                    <td>
                      <div>{ct.email}</div>
                      {ct.name && <div style={{ fontSize: 12, opacity: 0.7 }}>{ct.name}</div>}
                    </td>
                    <td>
                      {isOwner && !isSelf && ct.role !== "owner" ? (
                        <select
                          value={ct.role}
                          onChange={(e) => handleRoleChange(ct.id, e.target.value)}
                          className="auth-form__input"
                          style={{ padding: "2px 6px", width: "auto" }}
                        >
                          <option value="manager">Manager</option>
                          <option value="member">Member</option>
                        </select>
                      ) : (
                        <span className="badge">{ROLE_LABELS[ct.role] ?? ct.role}</span>
                      )}
                    </td>
                    <td>
                      {isPrivileged ? (
                        <span style={{ opacity: 0.6, fontSize: 13 }}>All maps</span>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {maps.map((m) => {
                            const granted = perms.has(m.id);
                            return (
                              <label
                                key={m.id}
                                style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, cursor: "pointer" }}
                              >
                                <input
                                  type="checkbox"
                                  checked={granted}
                                  onChange={() => handleMapPermToggle(ct.id, m.id, granted)}
                                />
                                {m.name}
                              </label>
                            );
                          })}
                          {maps.length === 0 && <span style={{ opacity: 0.6 }}>No maps</span>}
                        </div>
                      )}
                    </td>
                    {isOwner && (
                      <td>
                        {!isSelf && ct.role !== "owner" ? (
                          <button
                            type="button"
                            className="btn"
                            style={{ fontSize: 12, padding: "2px 8px" }}
                            onClick={() => handleRemove(ct.id)}
                          >
                            Remove
                          </button>
                        ) : null}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Invite form */}
      {isOwner && (
        <div className="admin-card">
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Invite a team member</h2>
          <p style={{ opacity: 0.8, marginTop: 0 }}>
            They'll receive a magic link to join. No password required.
          </p>
          <form onSubmit={handleInvite} style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 }}>
            <div>
              <label className="auth-form__label">Email address</label>
              <input
                type="email"
                className="auth-form__input"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                placeholder="colleague@example.com"
              />
            </div>
            <div>
              <label className="auth-form__label">Role</label>
              <select
                className="auth-form__input"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                <option value="manager">Manager — can edit org details, access all maps</option>
                <option value="member">Member — access only to selected maps</option>
              </select>
            </div>
            {inviteRole === "member" && maps.length > 0 && (
              <div>
                <label className="auth-form__label">Map access</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                  {maps.map((m) => (
                    <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={inviteMapIds.has(m.id)}
                        onChange={() => toggleInviteMapId(m.id)}
                      />
                      {m.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div>
              <button type="submit" className="btn btn-primary" disabled={inviting}>
                {inviting ? "Sending…" : "Send invitation"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

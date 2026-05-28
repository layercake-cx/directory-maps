import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { getContactForCurrentUser, canManageOrg } from "../../lib/clientAuth";
import { sendInvitation } from "../../lib/inviteHelpers";
import {
  formatLastLoggedIn,
  getTeamStatus,
  inviteMapNames,
  sortTeamRows,
} from "../../lib/teamDirectory.js";

const ROLE_LABELS = { owner: "Owner", manager: "Manager", member: "Member" };

const STATUS_STYLES = {
  active: { background: "#ecfdf5", color: "#065f46" },
  pending: { background: "#fffbeb", color: "#92400e" },
  warning: { background: "#eff6ff", color: "#1e40af" },
  muted: { background: "#f3f4f6", color: "#4b5563" },
};

function StatusBadge({ row }) {
  const { label, tone } = getTeamStatus(row);
  const style = STATUS_STYLES[tone] ?? STATUS_STYLES.muted;
  return (
    <span
      className="badge"
      style={{
        ...style,
        fontWeight: 600,
        fontSize: 12,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

export default function ClientTeam() {
  const navigate = useNavigate();

  const [myContact, setMyContact] = useState(null);
  const [client, setClient] = useState(null);
  const [teamRows, setTeamRows] = useState([]);
  const [maps, setMaps] = useState([]);
  const [mapPerms, setMapPerms] = useState({});

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteMapIds, setInviteMapIds] = useState(new Set());

  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [msg, setMsg] = useState({ text: "", error: false });

  const isOwner = myContact?.role === "owner" || myContact?.is_primary === true;

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

      const [{ data: directory, error: dirErr }, { data: mapsData }] = await Promise.all([
        supabase.rpc("list_client_team_directory", { p_client_id: ct.client_id }),
        supabase
          .from("maps")
          .select("id, name")
          .eq("client_id", ct.client_id)
          .order("name", { ascending: true }),
      ]);

      if (dirErr) throw dirErr;

      const rows = sortTeamRows(directory ?? []);
      setTeamRows(rows);
      setMaps(mapsData ?? []);

      const memberContactIds = rows
        .filter((r) => r.row_kind === "member" && r.role === "member")
        .map((r) => r.row_id);

      if (memberContactIds.length) {
        const { data: perms } = await supabase
          .from("contact_map_permissions")
          .select("contact_id, map_id")
          .in("contact_id", memberContactIds);

        const byContact = {};
        for (const p of perms ?? []) {
          if (!byContact[p.contact_id]) byContact[p.contact_id] = new Set();
          byContact[p.contact_id].add(p.map_id);
        }
        setMapPerms(byContact);
      } else {
        setMapPerms({});
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
      const { invitation } = await sendInvitation({
        clientId: client.id,
        email: inviteEmail,
        role: inviteRole,
        mapIds: inviteRole === "member" ? Array.from(inviteMapIds) : [],
      });
      setMsg({
        text: `Invitation email sent to ${invitation.email}. They can set a password and join your team.`,
        error: false,
      });
      setInviteEmail("");
      setInviteRole("member");
      setInviteMapIds(new Set());
      await load();
    } catch (e) {
      setMsg({ text: e?.message ?? String(e), error: true });
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(contactId, newRole) {
    try {
      await supabase.from("contacts").update({ role: newRole }).eq("id", contactId);
      setTeamRows((prev) =>
        prev.map((r) =>
          r.row_kind === "member" && r.row_id === contactId ? { ...r, role: newRole } : r
        )
      );
    } catch (e) {
      setMsg({ text: e?.message ?? String(e), error: true });
    }
  }

  async function handleRemove(contactId) {
    if (!window.confirm("Remove this team member? They will lose access immediately.")) return;
    try {
      await supabase.from("contacts").delete().eq("id", contactId);
      setTeamRows((prev) => prev.filter((r) => !(r.row_kind === "member" && r.row_id === contactId)));
      setMapPerms((prev) => {
        const next = { ...prev };
        delete next[contactId];
        return next;
      });
    } catch (e) {
      setMsg({ text: e?.message ?? String(e), error: true });
    }
  }

  async function handleCancelInvite(invitationId) {
    if (!window.confirm("Cancel this invitation? They will no longer be able to use the invite link.")) return;
    try {
      const { error } = await supabase.from("invitations").delete().eq("id", invitationId);
      if (error) throw error;
      setTeamRows((prev) => prev.filter((r) => !(r.row_kind === "invite_pending" && r.row_id === invitationId)));
      setMsg({ text: "Invitation cancelled.", error: false });
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
        await supabase.from("contact_map_permissions").insert({ contact_id: contactId, map_id: mapId });
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

  const hasRows = teamRows.length > 0;

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

      <div className="admin-card" style={{ marginBottom: 24 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Team members</h2>
        {!hasRows ? (
          <p style={{ margin: 0, opacity: 0.8 }}>No team members yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table" style={{ marginTop: 0, minWidth: 720 }}>
              <thead>
                <tr>
                  <th>Email / Name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last logged in</th>
                  <th>Map access</th>
                  {isOwner && <th></th>}
                </tr>
              </thead>
              <tbody>
                {teamRows.map((row) => {
                  const isMember = row.row_kind === "member";
                  const isPending = row.row_kind === "invite_pending";
                  const isSelf = isMember && row.row_id === myContact?.id;
                  const perms = isMember ? mapPerms[row.row_id] ?? new Set() : new Set();
                  const isPrivileged = row.role === "owner" || row.role === "manager";
                  const rowKey = `${row.row_kind}-${row.row_id}`;

                  return (
                    <tr
                      key={rowKey}
                      style={isPending ? { background: "rgba(251, 191, 36, 0.06)" } : undefined}
                    >
                      <td>
                        <div>{row.email}</div>
                        {row.display_name ? (
                          <div style={{ fontSize: 12, opacity: 0.7 }}>{row.display_name}</div>
                        ) : null}
                        {isPending && row.invite_expires_at ? (
                          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4 }}>
                            Expires{" "}
                            {new Date(row.invite_expires_at).toLocaleDateString(undefined, {
                              dateStyle: "medium",
                            })}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {isMember && isOwner && !isSelf && row.role !== "owner" ? (
                          <select
                            value={row.role}
                            onChange={(e) => handleRoleChange(row.row_id, e.target.value)}
                            className="auth-form__input"
                            style={{ padding: "2px 6px", width: "auto" }}
                          >
                            <option value="manager">Manager</option>
                            <option value="member">Member</option>
                          </select>
                        ) : (
                          <span className="badge">{ROLE_LABELS[row.role] ?? row.role}</span>
                        )}
                      </td>
                      <td>
                        <StatusBadge row={row} />
                      </td>
                      <td style={{ fontSize: 13, whiteSpace: "nowrap" }}>{formatLastLoggedIn(row)}</td>
                      <td>
                        {isPending ? (
                          <span style={{ opacity: 0.75, fontSize: 13 }}>
                            {row.role === "member"
                              ? inviteMapNames(row.invite_map_ids, maps)
                              : "All maps (when joined)"}
                          </span>
                        ) : isPrivileged ? (
                          <span style={{ opacity: 0.6, fontSize: 13 }}>All maps</span>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {maps.map((m) => {
                              const granted = perms.has(m.id);
                              return (
                                <label
                                  key={m.id}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                    fontSize: 13,
                                    cursor: "pointer",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={granted}
                                    onChange={() => handleMapPermToggle(row.row_id, m.id, granted)}
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
                          {isPending ? (
                            <button
                              type="button"
                              className="btn"
                              style={{ fontSize: 12, padding: "2px 8px" }}
                              onClick={() => handleCancelInvite(row.row_id)}
                            >
                              Cancel invite
                            </button>
                          ) : !isSelf && row.role !== "owner" ? (
                            <button
                              type="button"
                              className="btn"
                              style={{ fontSize: 12, padding: "2px 8px" }}
                              onClick={() => handleRemove(row.row_id)}
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
          </div>
        )}
      </div>

      {isOwner && (
        <div className="admin-card">
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Invite a team member</h2>
          <p style={{ opacity: 0.8, marginTop: 0 }}>
            We&rsquo;ll email them a link to set a password and join your organisation. Each person can only belong to
            one organisation—if they already have an account, you&rsquo;ll see an error instead.
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
                    <label
                      key={m.id}
                      style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, cursor: "pointer" }}
                    >
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
                {inviting ? "Sending…" : "Send invitation email"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

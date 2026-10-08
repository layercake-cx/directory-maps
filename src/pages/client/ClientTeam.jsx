import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { getContactForCurrentUser, canManageOrg } from "../../lib/clientAuth";
import { sendInvitation } from "../../lib/inviteHelpers";
import {
  formatLastLoggedIn,
  getTeamStatus,
  sortTeamRows,
} from "../../lib/teamDirectory.js";

const ROLE_LABELS = { owner: "Owner", manager: "Manager", member: "Member" };

const ACCESS_LEVELS = [
  { value: "member", label: "Member — can use all maps and directories" },
  { value: "manager", label: "Manager — also manages the team and organisation settings" },
  { value: "primary", label: "Primary contact — manager, plus listed as a primary contact" },
];

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
  const [directories, setDirectories] = useState([]);
  const [dirPerms, setDirPerms] = useState({});

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [allAccess, setAllAccess] = useState({});
  const [invitePrimary, setInvitePrimary] = useState({});

  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [msg, setMsg] = useState({ text: "", error: false });

  const isOwner = myContact?.role === "owner" || myContact?.is_primary === true;
  const accessLevels = isOwner ? ACCESS_LEVELS : ACCESS_LEVELS.filter((l) => l.value !== "primary");

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

      const [
        { data: directory, error: dirErr },
        { data: mapsData },
        { data: directoriesData },
        { data: accessRows },
        { data: pendingInvites },
      ] = await Promise.all([
        supabase.rpc("list_client_team_directory", { p_client_id: ct.client_id }),
        supabase
          .from("maps")
          .select("id, name")
          .eq("client_id", ct.client_id)
          .order("name", { ascending: true }),
        supabase
          .from("directories")
          .select("id, name")
          .eq("client_id", ct.client_id)
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase.from("contacts").select("id, has_all_access").eq("client_id", ct.client_id),
        supabase.from("invitations").select("id, is_primary").eq("client_id", ct.client_id).is("accepted_at", null),
      ]);

      if (dirErr) throw dirErr;

      const rows = sortTeamRows(directory ?? []);
      setTeamRows(rows);
      setMaps(mapsData ?? []);
      setDirectories(directoriesData ?? []);
      setAllAccess(Object.fromEntries((accessRows ?? []).map((r) => [r.id, !!r.has_all_access])));
      setInvitePrimary(Object.fromEntries((pendingInvites ?? []).map((r) => [r.id, !!r.is_primary])));

      const memberContactIds = rows
        .filter((r) => r.row_kind === "member" && r.role === "member")
        .map((r) => r.row_id);

      if (memberContactIds.length) {
        const [{ data: perms }, { data: dirGrants }] = await Promise.all([
          supabase
            .from("contact_map_permissions")
            .select("contact_id, map_id")
            .in("contact_id", memberContactIds),
          supabase
            .from("contact_directory_permissions")
            .select("contact_id, directory_id")
            .in("contact_id", memberContactIds),
        ]);

        const byContact = {};
        for (const p of perms ?? []) {
          if (!byContact[p.contact_id]) byContact[p.contact_id] = new Set();
          byContact[p.contact_id].add(p.map_id);
        }
        setMapPerms(byContact);

        const dirByContact = {};
        for (const g of dirGrants ?? []) {
          if (!dirByContact[g.contact_id]) dirByContact[g.contact_id] = new Set();
          dirByContact[g.contact_id].add(g.directory_id);
        }
        setDirPerms(dirByContact);
      } else {
        setMapPerms({});
        setDirPerms({});
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
        role: inviteRole === "primary" ? "manager" : inviteRole,
        isPrimary: inviteRole === "primary",
      });
      setMsg({
        text: `Invitation email sent to ${invitation.email}. They can set a password and join your team.`,
        error: false,
      });
      setInviteEmail("");
      setInviteRole("member");
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

  async function handlePrimaryToggle(contactId, makePrimary) {
    try {
      const { error } = await supabase.from("contacts").update({ is_primary: makePrimary }).eq("id", contactId);
      if (error) throw error;
      setTeamRows((prev) =>
        prev.map((r) => (r.row_kind === "member" && r.row_id === contactId ? { ...r, is_primary: makePrimary } : r))
      );
    } catch (e) {
      setMsg({ text: e?.message ?? String(e), error: true });
    }
  }

  async function handleAllAccessToggle(contactId, enabled) {
    try {
      const { error } = await supabase.from("contacts").update({ has_all_access: enabled }).eq("id", contactId);
      if (error) throw error;
      setAllAccess((prev) => ({ ...prev, [contactId]: enabled }));
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
      setDirPerms((prev) => {
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

  async function handleDirectoryPermToggle(contactId, directoryId, currentlyGranted) {
    try {
      if (currentlyGranted) {
        await supabase
          .from("contact_directory_permissions")
          .delete()
          .eq("contact_id", contactId)
          .eq("directory_id", directoryId);
        setDirPerms((prev) => {
          const next = { ...prev, [contactId]: new Set(prev[contactId]) };
          next[contactId].delete(directoryId);
          return next;
        });
      } else {
        // Explicit grants imply edit access (see DirectoryContext.jsx's canEditEntries) — there's
        // no separate view-only tier yet, matching how Map access works today.
        await supabase
          .from("contact_directory_permissions")
          .insert({ contact_id: contactId, directory_id: directoryId, can_edit_entries: true });
        setDirPerms((prev) => {
          const next = { ...prev, [contactId]: new Set(prev[contactId] ?? []) };
          next[contactId].add(directoryId);
          return next;
        });
      }
    } catch (e) {
      setMsg({ text: e?.message ?? String(e), error: true });
    }
  }

  if (loading) return <p>Loading…</p>;

  const hasRows = teamRows.length > 0;

  return (
    <>
      <div className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Team</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--shell-text-muted)" }}>
            Manage team members and their map access
          </p>
        </div>
        <button type="button" className="shell-btn" onClick={() => navigate("/client")}>
          ← Back
        </button>
      </div>

      {msg.text ? (
        <p style={{ color: msg.error ? "var(--shell-danger)" : "inherit", marginBottom: 12 }}>
          {msg.text}
        </p>
      ) : null}

      <div className="card card-pad" style={{ marginBottom: 24 }}>
        <p className="card-title">Team members</p>
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
                  <th>Directory access</th>
                  {isOwner && <th></th>}
                </tr>
              </thead>
              <tbody>
                {teamRows.map((row) => {
                  const isMember = row.row_kind === "member";
                  const isPending = row.row_kind === "invite_pending";
                  const isSelf = isMember && row.row_id === myContact?.id;
                  const perms = isMember ? mapPerms[row.row_id] ?? new Set() : new Set();
                  const dPerms = isMember ? dirPerms[row.row_id] ?? new Set() : new Set();
                  const isPrivileged = row.role === "owner" || row.role === "manager" || row.is_primary === true;
                  const hasAll = isMember && !!allAccess[row.row_id];
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
                        {(row.is_primary || (isPending && invitePrimary[row.row_id])) && (
                          <span className="badge" style={{ marginLeft: 6 }}>Primary</span>
                        )}
                      </td>
                      <td>
                        <StatusBadge row={row} />
                      </td>
                      <td style={{ fontSize: 13, whiteSpace: "nowrap" }}>{formatLastLoggedIn(row)}</td>
                      <td>
                        {isPending ? (
                          <span style={{ opacity: 0.75, fontSize: 13 }}>All maps (when joined)</span>
                        ) : isPrivileged || hasAll ? (
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
                      <td>
                        {isPending ? (
                          <span style={{ opacity: 0.75, fontSize: 13 }}>All directories (when joined)</span>
                        ) : isPrivileged || hasAll ? (
                          <span style={{ opacity: 0.6, fontSize: 13 }}>All directories</span>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {isOwner && (
                              <button
                                type="button"
                                className="shell-btn shell-btn--sm"
                                onClick={() => handleAllAccessToggle(row.row_id, true)}
                              >
                                Give access to all
                              </button>
                            )}
                            {directories.map((d) => {
                              const granted = dPerms.has(d.id);
                              return (
                                <label
                                  key={d.id}
                                  style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, cursor: "pointer" }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={granted}
                                    onChange={() => handleDirectoryPermToggle(row.row_id, d.id, granted)}
                                  />
                                  {d.name}
                                </label>
                              );
                            })}
                            {directories.length === 0 && <span style={{ opacity: 0.6 }}>No directories</span>}
                          </div>
                        )}
                      </td>
                      {isOwner && (
                        <td>
                          {isPending ? (
                            <button
                              type="button"
                              className="shell-btn shell-btn--sm"
                              onClick={() => handleCancelInvite(row.row_id)}
                            >
                              Cancel invite
                            </button>
                          ) : !isSelf && row.role !== "owner" ? (
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                className="shell-btn shell-btn--sm"
                                onClick={() => handlePrimaryToggle(row.row_id, !row.is_primary)}
                              >
                                {row.is_primary ? "Remove primary" : "Make primary"}
                              </button>
                              <button
                                type="button"
                                className="shell-btn shell-btn--sm"
                                onClick={() => handleRemove(row.row_id)}
                              >
                                Remove
                              </button>
                            </div>
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
        <div className="card card-pad">
          <p className="card-title">Invite a team member</p>
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
              <label className="auth-form__label">Access level</label>
              <select
                className="auth-form__input"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                {accessLevels.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <button type="submit" className="shell-btn shell-btn--primary" disabled={inviting}>
                {inviting ? "Sending…" : "Send invitation email"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

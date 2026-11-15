import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { getContactForCurrentUser, canManageOrg } from "../../lib/clientAuth";
import { sendInvitation } from "../../lib/inviteHelpers";
import {
  Button, Callout, Checkbox, DataTable, EmptyState, Field, PageLayout, Pill, Section, Select, Skeleton, TextInput, useConfirm,
} from "../../components/ui/index.js";
import "../../styles/wave-b/client-pages.css";
import {
  formatLastLoggedIn,
  getTeamStatus,
  sortTeamRows,
} from "../../lib/teamDirectory.js";

const ROLE_LABELS = { owner: "Owner", manager: "Manager", member: "Member" };

// Invite form's single access selector. "primary" is sent as a manager invitation with isPrimary.
const ACCESS_LEVELS = [
  { value: "member", label: "Member — can use all directories" },
  { value: "manager", label: "Manager — also manages the team and organisation settings" },
  { value: "primary", label: "Primary contact — manager, plus listed as a primary contact" },
];

// getTeamStatus tones (teamDirectory.js) mapped onto Pill tones.
const STATUS_TONES = { active: "ok", pending: "warn", warning: "info", muted: "neutral" };

function StatusBadge({ row }) {
  const { label, tone } = getTeamStatus(row);
  return <Pill tone={STATUS_TONES[tone] ?? "neutral"} className="cw-nowrap">{label}</Pill>;
}

export default function ClientTeam() {
  const navigate = useNavigate();
  const confirm = useConfirm();

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
  // Only owners and primary contacts can hand out the primary-contact level.
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
    const target = teamRows.find((r) => r.row_kind === "member" && r.row_id === contactId);
    const ok = await confirm({
      title: `Remove ${target?.email ?? "this team member"}?`,
      body: "They will lose access immediately.",
      confirmLabel: "Remove team member",
      tone: "danger",
    });
    if (!ok) return;
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
    const target = teamRows.find((r) => r.row_kind === "invite_pending" && r.row_id === invitationId);
    const ok = await confirm({
      title: `Cancel the invitation${target?.email ? ` to ${target.email}` : ""}?`,
      body: "They will no longer be able to use the invite link.",
      confirmLabel: "Cancel invitation",
      cancelLabel: "Keep invitation",
      tone: "danger",
    });
    if (!ok) return;
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

  if (loading) {
    return (
      <PageLayout head={{ title: "Team", subtitle: "Manage team members and their map access" }}>
        <Skeleton variant="table" label="Loading team" />
      </PageLayout>
    );
  }

  const checkList = (items, granted, onToggle, emptyText) => (
    <div className="cw-check-list">
      {items.map((it) => (
        <Checkbox key={it.id} label={it.name} checked={granted(it.id)} onChange={() => onToggle(it.id, granted(it.id))} />
      ))}
      {items.length === 0 && <span className="cw-muted">{emptyText}</span>}
    </div>
  );

  const columns = [
    {
      key: "email",
      label: "Email / Name",
      render: (row) => (
        <>
          <div>{row.email}</div>
          {row.display_name ? <span className="cw-cell-sub">{row.display_name}</span> : null}
          {row.row_kind === "invite_pending" && row.invite_expires_at ? (
            <span className="cw-cell-sub">
              Expires{" "}
              {new Date(row.invite_expires_at).toLocaleDateString("en-GB", {
                dateStyle: "medium",
              })}
            </span>
          ) : null}
        </>
      ),
    },
    {
      key: "role",
      label: "Role",
      render: (row) => {
        const isMember = row.row_kind === "member";
        const isSelf = isMember && row.row_id === myContact?.id;
        const roleControl = isMember && isOwner && !isSelf && row.role !== "owner" ? (
          <Select
            aria-label={`Role for ${row.email}`}
            value={row.role}
            onChange={(e) => handleRoleChange(row.row_id, e.target.value)}
            className="cw-role-select"
          >
            <option value="manager">Manager</option>
            <option value="member">Member</option>
          </Select>
        ) : (
          <Pill>{ROLE_LABELS[row.role] ?? row.role}</Pill>
        );
        const isPrimaryRow = row.is_primary || (row.row_kind === "invite_pending" && invitePrimary[row.row_id]);
        return (
          <div className="cw-row-actions">
            {roleControl}
            {isPrimaryRow ? <Pill tone="info" className="cw-nowrap">Primary</Pill> : null}
          </div>
        );
      },
    },
    { key: "status", label: "Status", render: (row) => <StatusBadge row={row} /> },
    { key: "last_login", label: "Last logged in", className: "cw-nowrap", render: (row) => formatLastLoggedIn(row) },
    {
      key: "map_access",
      label: "Map access",
      render: (row) => {
        const isMember = row.row_kind === "member";
        const perms = isMember ? mapPerms[row.row_id] ?? new Set() : new Set();
        if (row.row_kind === "invite_pending") {
          return (
            <span className="cw-muted">
              {row.role === "member" ? "Set after they join" : "All maps (when joined)"}
            </span>
          );
        }
        if (row.role === "owner" || row.role === "manager" || row.is_primary) {
          return <span className="cw-muted">All maps</span>;
        }
        return checkList(maps, (id) => perms.has(id), (id, granted) => handleMapPermToggle(row.row_id, id, granted), "No maps");
      },
    },
    {
      key: "directory_access",
      label: "Directory access",
      render: (row) => {
        const isMember = row.row_kind === "member";
        const dPerms = isMember ? dirPerms[row.row_id] ?? new Set() : new Set();
        if (row.row_kind === "invite_pending") {
          return <span className="cw-muted">All directories (when joined)</span>;
        }
        if (row.role === "owner" || row.role === "manager" || row.is_primary || allAccess[row.row_id]) {
          return <span className="cw-muted">All directories</span>;
        }
        return (
          <div className="cw-stack">
            {isOwner && (
              <div>
                <Button size="sm" onClick={() => handleAllAccessToggle(row.row_id, true)}>
                  Give access to all
                </Button>
              </div>
            )}
            {checkList(directories, (id) => dPerms.has(id), (id, granted) => handleDirectoryPermToggle(row.row_id, id, granted), "No directories")}
          </div>
        );
      },
    },
  ];

  if (isOwner) {
    columns.push({
      key: "actions",
      label: "Actions",
      render: (row) => {
        const isSelf = row.row_kind === "member" && row.row_id === myContact?.id;
        if (row.row_kind === "invite_pending") {
          return (
            <Button size="sm" onClick={() => handleCancelInvite(row.row_id)}>
              Cancel invite
            </Button>
          );
        }
        return !isSelf && row.role !== "owner" ? (
          <div className="cw-row-actions">
            <Button size="sm" onClick={() => handlePrimaryToggle(row.row_id, !row.is_primary)}>
              {row.is_primary ? "Remove primary" : "Make primary"}
            </Button>
            <Button size="sm" variant="danger" onClick={() => handleRemove(row.row_id)}>
              Remove
            </Button>
          </div>
        ) : null;
      },
    });
  }

  return (
    <PageLayout
      head={{
        title: "Team",
        subtitle: "Manage team members and their map access",
        actions: <Button onClick={() => navigate("/client")}>Back</Button>,
      }}
    >
      <div className="cw-stack">
        {msg.text ? <Callout tone={msg.error ? "danger" : "ok"}>{msg.text}</Callout> : null}

        <Section title="Team members" flush>
          <DataTable
            caption="Team members"
            columns={columns}
            rows={teamRows}
            getRowId={(row) => `${row.row_kind}-${row.row_id}`}
            getRowLabel={(row) => row.email}
            empty={<EmptyState art="none" title="No team members yet" />}
          />
        </Section>

        {isOwner && (
          <Section
            title="Invite a team member"
            description="We’ll email them a link to set a password and join your organisation. Each person can only belong to one organisation. If they already have an account, you’ll see an error instead."
          >
            <form onSubmit={handleInvite} className="cw-form">
              <Field label="Email address" required>
                <TextInput
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@example.com"
                />
              </Field>
              <Field label="Access level">
                <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                  {accessLevels.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <div>
                <Button variant="primary" type="submit" loading={inviting} loadingLabel="Sending…">
                  Send invitation email
                </Button>
              </div>
            </form>
          </Section>
        )}
      </div>
    </PageLayout>
  );
}

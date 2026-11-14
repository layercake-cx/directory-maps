import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useClient } from "../../hooks/useClient.js";
import { Button, Callout, Checkbox, DataTable, EmptyState, Field, FieldGrid, PageLayout, Pill, Section, TextInput } from "../../components/ui/index.js";
import "../../styles/wave-b/client-pages.css";

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

  async function handleAddMember(e) {
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
      <PageLayout head={{ title: "Team" }}>
        <Callout tone="warn">
          You don't have permission to manage your team. Only the primary contact or team members with "Manage team" access can view this page.
        </Callout>
      </PageLayout>
    );
  }

  const columns = [
    { key: "email", label: "Email" },
    { key: "name", label: "Name", render: (c) => c.name || "—" },
    { key: "owner", label: "Owner", render: (c) => (c.is_primary ? "Yes" : "—") },
    {
      key: "can_manage_maps",
      label: "Manage maps",
      render: (c) =>
        c.is_primary ? (
          <Pill>All access</Pill>
        ) : (
          <Checkbox
            label={c.can_manage_maps ? "Yes" : "No"}
            aria-label={`Manage maps for ${c.email}`}
            checked={!!c.can_manage_maps}
            onChange={(e) => updatePermissions(c.id, e.target.checked, c.can_manage_users)}
          />
        ),
    },
    {
      key: "can_manage_users",
      label: "Manage team",
      render: (c) =>
        c.is_primary ? (
          <Pill>All access</Pill>
        ) : (
          <Checkbox
            label={c.can_manage_users ? "Yes" : "No"}
            aria-label={`Manage team for ${c.email}`}
            checked={!!c.can_manage_users}
            onChange={(e) => updatePermissions(c.id, c.can_manage_maps, e.target.checked)}
          />
        ),
    },
    {
      key: "status",
      label: "Status",
      render: (c) => (c.user_id ? <Pill tone="ok">Active</Pill> : <Pill tone="warn">Invite pending</Pill>),
    },
  ];

  return (
    <PageLayout
      head={{
        title: "Team",
        subtitle: "Add team members and control what they can do. Members can be given access to manage maps and/or manage the team.",
      }}
    >
      <div className="cw-stack">
        {err ? <Callout tone="danger">{err}</Callout> : null}

        <Section title="Add a team member">
          <form onSubmit={handleAddMember} className="cw-add-form">
            <FieldGrid>
              <Field label="Email">
                <TextInput type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="colleague@example.com" />
              </Field>
              <Field label="Name (optional)">
                <TextInput value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Jane Smith" />
              </Field>
            </FieldGrid>
            <div className="cw-add-checks">
              <Checkbox label="Manage maps" checked={addCanManageMaps} onChange={(e) => setAddCanManageMaps(e.target.checked)} />
              <Checkbox label="Manage team" checked={addCanManageUsers} onChange={(e) => setAddCanManageUsers(e.target.checked)} />
            </div>
            <div>
              <Button variant="primary" type="submit" loading={adding} loadingLabel="Adding…">
                Add member
              </Button>
            </div>
          </form>
        </Section>

        <Section title="Team members" flush>
          <DataTable
            caption="Team members"
            columns={columns}
            rows={contacts}
            getRowId={(c) => c.id}
            getRowLabel={(c) => c.email}
            loading={loading}
            empty={<EmptyState art="none" title="No team members yet" body="Add one above." />}
          />
        </Section>
      </div>
    </PageLayout>
  );
}

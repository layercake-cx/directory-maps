import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import AdminLayout from "./AdminLayout.jsx";
import { Button, Callout, Checkbox, Field, Section, SettingsLayout, Skeleton, TextInput } from "../../components/ui/index.js";
import "../../styles/wave-c/clients.css";

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

  const clientHref = `/admin/clients/${encodeURIComponent(clientId)}`;

  return (
    <AdminLayout>
      <SettingsLayout
        head={{
          title: "Contact",
          breadcrumb: [
            { label: "Customers", to: "/admin/clients" },
            { label: client?.name ?? "…", to: clientHref },
            { label: "Contact" },
          ],
          actions: <Button as={Link} to={clientHref}>Back to customer</Button>,
        }}
      >
        {loading ? <Skeleton variant="form" label="Loading contact" /> : null}
        {err ? <Callout tone="danger">{err}</Callout> : null}

        {contact && client && !loading ? (
          <>
            <Section title="Customer">
              <p className="wc-muted">
                <strong>Customer:</strong> <Link to={clientHref}>{client.name}</Link>
                {client.slug ? ` (${client.slug})` : ""}
                {" · "}
                Has login: {contact.user_id ? "Yes" : "No"}
                {contact.user_id ? ` · User ID: ${contact.user_id}` : ""}
              </p>
            </Section>

            <Section title="Contact details">
              <form onSubmit={handleSave} className="wc-form">
                <Field label="Email">
                  <TextInput type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} required />
                </Field>
                <Field label="Name (optional)">
                  <TextInput value={editName} onChange={(e) => setEditName(e.target.value)} />
                </Field>
                <div className="wc-checks">
                  <Checkbox label="Primary contact" checked={editIsPrimary} onChange={(e) => setEditIsPrimary(e.target.checked)} />
                  <Checkbox label="Manage maps" checked={editCanManageMaps} onChange={(e) => setEditCanManageMaps(e.target.checked)} />
                  <Checkbox label="Manage users" checked={editCanManageUsers} onChange={(e) => setEditCanManageUsers(e.target.checked)} />
                </div>
                <div className="wc-actions">
                  <Button type="submit" variant="primary" loading={saving} loadingLabel="Saving…">
                    Save changes
                  </Button>
                </div>
              </form>
              <p className="wc-muted">Contact ID: {contact.id}</p>
            </Section>
          </>
        ) : null}
      </SettingsLayout>
    </AdminLayout>
  );
}

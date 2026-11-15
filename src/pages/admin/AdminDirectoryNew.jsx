import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import AdminLayout from "./AdminLayout.jsx";
import { createDirectory, slugify } from "../../lib/directories.js";
import { recordAdminEvent } from "../../lib/adminEvents.js";
import { Button, Callout, Field, Section, SettingsLayout, TextInput, Textarea } from "../../components/ui/index.js";
import "../../styles/wave-c/clients.css";

export default function AdminDirectoryNew() {
  const { clientId } = useParams();
  const navigate = useNavigate();

  const [client, setClient] = useState(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const suggestedSlug = useMemo(() => slugify(name), [name]);
  const finalSlug = (slug || suggestedSlug).trim();

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id,name,slug")
        .eq("id", clientId)
        .single();
      if (!error) setClient(data);
    })();
  }, [clientId]);

  async function handleCreate(e) {
    e.preventDefault();
    setErr("");
    try {
      setSaving(true);
      const id = await createDirectory({ clientId, name, slug: finalSlug, description });
      recordAdminEvent(supabase, {
        eventType: "directory_created",
        meta: { name, slug: finalSlug, directory_id: id },
        source: "admin_dashboard",
        clientId,
      });
      navigate(`/admin/clients/${encodeURIComponent(clientId)}/directories/${encodeURIComponent(id)}`);
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  const clientHref = `/admin/clients/${encodeURIComponent(clientId)}`;

  return (
    <AdminLayout>
      <SettingsLayout
        head={{
          title: "New directory",
          breadcrumb: [
            { label: "Customers", to: "/admin/clients" },
            { label: client?.name ?? "…", to: clientHref },
            { label: "New directory" },
          ],
        }}
      >
        <Section>
          <form onSubmit={handleCreate} className="wc-form">
            <Field label="Directory name">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Accredited Suppliers" />
            </Field>

            <Field
              label="Slug"
              hint={
                <>
                  Unique within this customer. Suggested: <strong>{suggestedSlug || "—"}</strong>
                </>
              }
            >
              <TextInput
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={suggestedSlug || "e.g. accredited-suppliers"}
              />
            </Field>

            <Field label="Description (optional)">
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </Field>

            {err ? <Callout tone="danger">{err}</Callout> : null}

            <div className="wc-actions">
              <Button type="submit" variant="primary" loading={saving} loadingLabel="Creating…">
                Create directory
              </Button>
              <Button as={Link} to={clientHref}>Cancel</Button>
            </div>
          </form>
        </Section>
      </SettingsLayout>
    </AdminLayout>
  );
}

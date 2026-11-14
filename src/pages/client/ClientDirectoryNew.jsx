import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useClient } from "../../hooks/useClient.js";
import { createDirectory, slugify } from "../../lib/directories.js";
import { recordAdminEvent } from "../../lib/adminEvents.js";
import { supabase } from "../../lib/supabase";
import { Button, Callout, Field, FieldGrid, Section, SettingsLayout, TextInput, Textarea } from "../../components/ui/index.js";
import "../../styles/wave-b/client-pages.css";

export default function ClientDirectoryNew() {
  const navigate = useNavigate();
  const { client } = useClient();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const suggestedSlug = useMemo(() => slugify(name), [name]);
  const finalSlug = (slug || suggestedSlug).trim();

  async function handleCreate(e) {
    e.preventDefault();
    setErr("");
    try {
      setSaving(true);
      const id = await createDirectory({ clientId: client?.id, name, slug: finalSlug, description });
      recordAdminEvent(supabase, {
        eventType: "directory_created",
        meta: { name, slug: finalSlug, directory_id: id },
        source: "client_portal",
        clientId: client?.id ?? null,
      });
      navigate(`/client/directories/${encodeURIComponent(id)}`);
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsLayout
      head={{
        title: "Create directory",
        breadcrumb: [{ label: "Directories", to: "/client/directories" }, { label: "Create directory" }],
      }}
    >
      <form onSubmit={handleCreate}>
        <Section
          footer={
            <>
              <Button variant="primary" type="submit" loading={saving} loadingLabel="Creating…">
                Create directory
              </Button>
              <Button as={Link} to="/client/directories">
                Cancel
              </Button>
            </>
          }
        >
          <div className="cw-add-form">
            <FieldGrid>
              <Field label="Directory name">
                <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Accredited Suppliers" />
              </Field>
              <Field
                label="Web address (short name)"
                hint={<>This becomes part of the directory's public URL. Suggested: <strong>{suggestedSlug || "—"}</strong></>}
              >
                <TextInput
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder={suggestedSlug || "e.g. accredited-suppliers"}
                />
              </Field>
            </FieldGrid>

            <Field label="Description (optional)">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Shown on the directory's public index page once published."
              />
            </Field>

            {err ? <Callout tone="danger">{err}</Callout> : null}
          </div>
        </Section>
      </form>
    </SettingsLayout>
  );
}

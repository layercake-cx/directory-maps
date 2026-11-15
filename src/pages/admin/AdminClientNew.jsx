import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import AdminLayout from "./AdminLayout.jsx";
import { Button, Callout, Field, Section, SettingsLayout, TextInput } from "../../components/ui/index.js";
import "../../styles/wave-c/clients.css";

function slugify(input) {
  return (input || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function AdminClientNew() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const suggestedSlug = useMemo(() => slugify(name), [name]);
  const finalSlug = slug || suggestedSlug;

  async function createClient(e) {
    e.preventDefault();
    setErr("");

    const cleanName = name.trim();
    const cleanSlug = finalSlug.trim();

    if (!cleanName) return setErr("Customer name is required.");
    if (!cleanSlug) return setErr("Slug is required.");

    try {
      setSaving(true);
      const { error } = await supabase.from("clients").insert({
        id: crypto.randomUUID(),
        name: cleanName,
        slug: cleanSlug,
      });
      if (error) throw error;

      navigate("/admin/clients");
    } catch (e2) {
      setErr(e2.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout>
      <SettingsLayout
        head={{
          title: "New customer",
          breadcrumb: [
            { label: "Customers", to: "/admin/clients" },
            { label: "New customer" },
          ],
        }}
      >
        <Section>
          <form onSubmit={createClient} className="wc-form">
            <Field label="Customer name">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. IoIC" />
            </Field>

            <Field
              label="Slug"
              hint={
                <>
                  Used in URLs. Leave blank to auto-suggest: <strong>{suggestedSlug || "—"}</strong>
                </>
              }
            >
              <TextInput
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={suggestedSlug || "e.g. ioic"}
              />
            </Field>

            {err ? <Callout tone="danger">{err}</Callout> : null}

            <div className="wc-actions">
              <Button type="submit" variant="primary" loading={saving} loadingLabel="Creating…">
                Create customer
              </Button>
              <Button as={Link} to="/admin/clients">Cancel</Button>
            </div>
          </form>
        </Section>
      </SettingsLayout>
    </AdminLayout>
  );
}

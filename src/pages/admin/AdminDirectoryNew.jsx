import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import AdminLayout from "./AdminLayout.jsx";
import { createDirectory, slugify } from "../../lib/directories.js";
import { recordAdminEvent } from "../../lib/adminEvents.js";

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

  return (
    <AdminLayout
      breadcrumbs={[
        { label: "Customers", path: "/admin/clients" },
        { label: client?.name ?? "…", path: `/admin/clients/${encodeURIComponent(clientId)}` },
        { label: "New directory" },
      ]}
    >
      <div className="card card-pad" style={{ maxWidth: 760 }}>
        <div style={{ marginBottom: 12 }}>
          <Link to={`/admin/clients/${encodeURIComponent(clientId)}`}>← Back to customer</Link>
        </div>

        <p className="card-title">
          Create directory {client?.name ? <span style={{ opacity: 0.7, fontWeight: 400 }}>for {client.name}</span> : null}
        </p>

        <form onSubmit={handleCreate}>
          <div style={{ display: "grid", gap: 14 }}>
            <Field label="Directory name">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Accredited Suppliers" />
            </Field>

            <Field label="Slug">
              <input
                className="input"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={suggestedSlug || "e.g. accredited-suppliers"}
              />
              <div className="field-hint">
                Unique within this customer. Suggested: <strong>{suggestedSlug || "—"}</strong>
              </div>
            </Field>

            <Field label="Description (optional)">
              <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </Field>

            {err ? <p style={{ margin: 0, color: "var(--shell-danger)" }}>{err}</p> : null}

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button className="shell-btn shell-btn--primary" type="submit" disabled={saving}>
                {saving ? "Creating…" : "Create directory"}
              </button>
              <Link className="shell-btn" to={`/admin/clients/${encodeURIComponent(clientId)}`}>
                Cancel
              </Link>
            </div>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}

function Field({ label, children }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import AdminLayout from "./AdminLayout.jsx";

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
    <AdminLayout
      breadcrumbs={[
        { label: "Customers", path: "/admin/clients" },
        { label: "New customer" },
      ]}
    >
      <div className="card card-pad" style={{ maxWidth: 720 }}>
        <div style={{ marginBottom: 12 }}>
          <Link to="/admin/clients">← Back to customers</Link>
        </div>

        <form onSubmit={createClient}>
          <div style={{ display: "grid", gap: 14 }}>
            <Field label="Customer name">
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. IoIC"
              />
            </Field>

            <Field label="Slug">
              <input
                className="input"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={suggestedSlug || "e.g. ioic"}
              />
              <div className="field-hint">
                Used in URLs. Leave blank to auto-suggest: <strong>{suggestedSlug || "—"}</strong>
              </div>
            </Field>

            {err ? <p style={{ margin: 0, color: "var(--shell-danger)" }}>{err}</p> : null}

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button className="shell-btn shell-btn--primary" type="submit" disabled={saving}>
                {saving ? "Creating…" : "Create customer"}
              </button>

              <Link className="shell-btn" to="/admin/clients">
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
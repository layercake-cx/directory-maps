import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { signOut } from "../../lib/auth.js";
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
  const [id, setId] = useState(() => crypto.randomUUID()); // stored as text
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const suggestedSlug = useMemo(() => slugify(name), [name]);
  const finalSlug = slug || suggestedSlug;

  async function createClient(e) {
    e.preventDefault();
    setErr("");

    const cleanName = name.trim();
    const cleanSlug = finalSlug.trim();
    const email = contactEmail.trim();
    const contactNameTrimmed = contactName.trim();

    if (!cleanName) return setErr("Client name is required.");
    if (!cleanSlug) return setErr("Slug is required.");
    if (!email) return setErr("Primary contact email is required.");

    try {
      setSaving(true);

      const { error } = await supabase.from("clients").insert({
        id,
        name: cleanName,
        slug: cleanSlug,
      });

      if (error) throw error;

      const { error: contactError } = await supabase.from("contacts").insert({
        client_id: id,
        email,
        name: contactNameTrimmed || null,
        is_primary: true,
      });

      if (contactError) throw contactError;

      navigate("/admin/clients");
    } catch (e2) {
      setErr(e2.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout
      title="Admin · New client"
      rightActions={
        <button onClick={signOut} type="button">
          Sign out
        </button>
      }
    >
      <div className="admin-card" style={{ maxWidth: 720 }}>
        <div style={{ marginBottom: 12 }}>
          <Link to="/admin/clients">← Back to clients</Link>
        </div>

        <h2 style={{ marginTop: 0 }}>Create client</h2>

        <form onSubmit={createClient}>
          <div style={{ display: "grid", gap: 14 }}>
            <Field label="Client name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. IoIC"
              />
            </Field>

            <Field label="Slug">
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={suggestedSlug || "e.g. ioic"}
              />
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                Used in URLs. Leave blank to auto-suggest: <strong>{suggestedSlug || "—"}</strong>
              </div>
            </Field>

            <Field label="ID">
              <input value={id} onChange={(e) => setId(e.target.value)} />
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                Internal identifier. Default is a random UUID string.
              </div>
            </Field>

            <h3 style={{ margin: "20px 0 8px 0", fontSize: 15 }}>Primary contact</h3>
            <Field label="Contact name">
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="e.g. Jane Smith"
              />
            </Field>
            <Field label="Contact email">
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="e.g. jane@example.com"
                required
              />
            </Field>

            {err ? <p style={{ margin: 0 }}>{err}</p> : null}

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? "Creating…" : "Create client"}
              </button>

              <Link className="btn" to="/admin/clients">
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
    <div>
      <div style={{ fontSize: 13, marginBottom: 6, opacity: 0.8 }}>{label}</div>
      <div className="admin-controls" style={{ marginTop: 0 }}>
        {/* reuse admin input styles */}
        {children}
      </div>
    </div>
  );
}
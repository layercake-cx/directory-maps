import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useClient } from "../../hooks/useClient.js";
import { createDirectory, slugify } from "../../lib/directories.js";
import { recordAdminEvent } from "../../lib/adminEvents.js";
import { supabase } from "../../lib/supabase";

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
    <div className="page-main">
      <div style={{ marginBottom: 12 }}>
        <Link to="/client/directories">← Back to directories</Link>
      </div>

      <h2 style={{ marginTop: 0 }}>Create directory</h2>

      <form onSubmit={handleCreate}>
        <div style={{ display: "grid", gap: 14, maxWidth: 640 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr", gap: 16 }}>
            <Field label="Directory name">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Accredited Suppliers" />
            </Field>
            <Field label="Web address (short name)">
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={suggestedSlug || "e.g. accredited-suppliers"}
              />
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                This becomes part of the directory's public URL. Suggested: <strong>{suggestedSlug || "—"}</strong>
              </div>
            </Field>
          </div>

          <Field label="Description (optional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Shown on the directory's public index page once published."
            />
          </Field>

          {err ? <p style={{ margin: 0, color: "#b91c1c" }}>{err}</p> : null}

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? "Creating…" : "Create directory"}
            </button>
            <Link className="btn" to="/client/directories">
              Cancel
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 13, marginBottom: 6, opacity: 0.8 }}>{label}</div>
      <div className="admin-controls" style={{ marginTop: 0 }}>
        {children}
      </div>
    </div>
  );
}

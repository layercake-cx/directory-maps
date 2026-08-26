import React, { useCallback, useEffect, useState } from "react";
import {
  createAccreditationScheme,
  deleteAccreditationSchemePermanently,
  listAccreditationSchemes,
  setAccreditationSchemeActive,
} from "../../lib/accreditations";

const emptyForm = { name: "", issuing_body: "", badge_image_url: "", description: "", verification_note: "" };
const inputStyle = { width: "100%", boxSizing: "border-box", padding: "6px 9px", borderRadius: 7, border: "1px solid var(--lc-border)", fontSize: 13 };

/**
 * Directory-level accreditation scheme definitions (build-scope §5.7) — "a
 * directory defines the schemes". Entries then hold them via
 * AccreditationsEditor. Modelled on the directory_groups inline-add pattern
 * in DirectoryEntriesPanel.jsx, since schemes are directory-scoped, not
 * client-wide like categorisations.
 */
export default function AccreditationSchemesPanel({ directoryId, recordEvent }) {
  const [schemes, setSchemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!directoryId) return;
    try {
      setLoading(true);
      setSchemes(await listAccreditationSchemes(directoryId, { includeArchived: true }));
      setErr("");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [directoryId]);

  useEffect(() => { void refresh(); }, [refresh]);

  function fSet(key, value) { setForm((f) => ({ ...f, [key]: value })); }

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) { setErr("Scheme name is required."); return; }
    try {
      setSaving(true);
      setErr("");
      const s = await createAccreditationScheme(directoryId, form);
      recordEvent?.("directory_accreditation_scheme_created", { directory_id: directoryId, scheme_id: s.id, name: s.name });
      setForm(emptyForm);
      setAddOpen(false);
      await refresh();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(scheme) {
    try {
      await setAccreditationSchemeActive(scheme.id, !scheme.is_active);
      recordEvent?.("directory_accreditation_scheme_archived", { directory_id: directoryId, scheme_id: scheme.id, is_active: !scheme.is_active });
      await refresh();
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }

  async function remove(scheme) {
    if (!window.confirm(`Delete accreditation scheme "${scheme.name}"? This removes it from every entry that holds it.`)) return;
    try {
      await deleteAccreditationSchemePermanently(scheme.id);
      recordEvent?.("directory_accreditation_scheme_deleted", { directory_id: directoryId, scheme_id: scheme.id, name: scheme.name });
      await refresh();
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Accreditation schemes</p>
        <button type="button" className="btn" style={{ fontSize: 12, padding: "3px 10px" }} onClick={() => setAddOpen((v) => !v)}>
          {addOpen ? "Cancel" : "+ Add scheme"}
        </button>
      </div>

      {err && <p style={{ color: "#b91c1c", fontSize: 12, margin: "0 0 8px" }}>{err}</p>}

      {addOpen && (
        <form onSubmit={save} style={{ display: "grid", gap: 8, marginBottom: 12, padding: 12, background: "#f9fafb", border: "1px solid var(--lc-border)", borderRadius: 8 }}>
          <input value={form.name} onChange={(e) => fSet("name", e.target.value)} placeholder="Scheme name" style={inputStyle} required />
          <input value={form.issuing_body} onChange={(e) => fSet("issuing_body", e.target.value)} placeholder="Issuing body (optional)" style={inputStyle} />
          <input value={form.badge_image_url} onChange={(e) => fSet("badge_image_url", e.target.value)} placeholder="Badge image URL (optional)" type="url" style={inputStyle} />
          <textarea value={form.description} onChange={(e) => fSet("description", e.target.value)} placeholder="Description (optional)" rows={2} style={{ ...inputStyle, resize: "vertical" }} />
          <input value={form.verification_note} onChange={(e) => fSet("verification_note", e.target.value)} placeholder="Verification note (optional)" style={inputStyle} />
          <div>
            <button type="submit" className="btn btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} disabled={saving}>
              {saving ? "Saving…" : "Add scheme"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p style={{ fontSize: 13, opacity: 0.6 }}>Loading…</p>
      ) : schemes.length === 0 ? (
        <p style={{ fontSize: 13, opacity: 0.6 }}>No accreditation schemes yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {schemes.map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 10px", border: "1px solid var(--lc-border)", borderRadius: 7, opacity: s.is_active ? 1 : 0.55 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{s.name}</div>
                {s.issuing_body && <div style={{ fontSize: 12, opacity: 0.7 }}>{s.issuing_body}</div>}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" className="btn" style={{ fontSize: 12, padding: "3px 8px" }} onClick={() => toggleActive(s)}>
                  {s.is_active ? "Archive" : "Restore"}
                </button>
                <button type="button" className="btn" style={{ fontSize: 12, padding: "3px 8px", color: "#b91c1c" }} onClick={() => remove(s)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

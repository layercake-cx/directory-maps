import React, { useCallback, useEffect, useState } from "react";
import { createProminentLink, deleteProminentLink, listProminentLinks } from "../../lib/prominentLinks";

const emptyForm = { label: "", url: "", icon: "", style: "secondary", open_in_new: true, tracking: false };
const inputStyle = { width: "100%", boxSizing: "border-box", padding: "6px 9px", borderRadius: 7, border: "1px solid var(--lc-border)", fontSize: 13 };

/**
 * Prominent link tiles (build-scope §5.8) — pass exactly one of
 * {directoryId, entryId}. Used both on a directory's homepage settings and
 * inside an entry's edit form.
 */
export default function ProminentLinksEditor({ directoryId, entryId, recordEvent, title = "Prominent links" }) {
  const owner = directoryId ? { directoryId } : { entryId };
  const ownerKey = directoryId || entryId;

  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!ownerKey) return;
    try {
      setLoading(true);
      setLinks(await listProminentLinks(owner));
      setErr("");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerKey]);

  useEffect(() => { void refresh(); }, [refresh]);

  function fSet(key, value) { setForm((f) => ({ ...f, [key]: value })); }

  async function save(e) {
    e.preventDefault();
    try {
      setSaving(true);
      setErr("");
      const link = await createProminentLink(owner, form);
      recordEvent?.("directory_prominent_link_added", { directory_id: directoryId ?? null, entry_id: entryId ?? null, link_id: link.id });
      setForm(emptyForm);
      setAddOpen(false);
      await refresh();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  async function remove(link) {
    try {
      await deleteProminentLink(link.id);
      recordEvent?.("directory_prominent_link_removed", { directory_id: directoryId ?? null, entry_id: entryId ?? null, link_id: link.id });
      await refresh();
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{title}</p>
        <button type="button" className="btn" style={{ fontSize: 12, padding: "3px 10px" }} onClick={() => setAddOpen((v) => !v)}>
          {addOpen ? "Cancel" : "+ Add link"}
        </button>
      </div>

      {err && <p style={{ color: "#b91c1c", fontSize: 12, margin: "0 0 8px" }}>{err}</p>}

      {addOpen && (
        <form onSubmit={save} style={{ display: "grid", gap: 8, marginBottom: 12, padding: 12, background: "#f9fafb", border: "1px solid var(--lc-border)", borderRadius: 8 }}>
          <input value={form.label} onChange={(e) => fSet("label", e.target.value)} placeholder="Label" style={inputStyle} required />
          <input value={form.url} onChange={(e) => fSet("url", e.target.value)} placeholder="https://…" type="url" style={inputStyle} required />
          <div style={{ display: "flex", gap: 8 }}>
            <select value={form.style} onChange={(e) => fSet("style", e.target.value)} style={inputStyle}>
              <option value="primary">Primary style</option>
              <option value="secondary">Secondary style</option>
            </select>
          </div>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
            <input type="checkbox" checked={form.open_in_new} onChange={(e) => fSet("open_in_new", e.target.checked)} />
            Open in a new tab
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
            <input type="checkbox" checked={form.tracking} onChange={(e) => fSet("tracking", e.target.checked)} />
            Sponsored / affiliate (adds rel="sponsored nofollow" when rendered)
          </label>
          <div>
            <button type="submit" className="btn btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} disabled={saving}>
              {saving ? "Saving…" : "Add link"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p style={{ fontSize: 13, opacity: 0.6 }}>Loading…</p>
      ) : links.length === 0 ? (
        <p style={{ fontSize: 13, opacity: 0.6 }}>No links yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {links.map((link) => (
            <div key={link.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 10px", border: "1px solid var(--lc-border)", borderRadius: 7 }}>
              <div style={{ fontSize: 12 }}>
                <div style={{ fontWeight: 500 }}>{link.label} <span style={{ opacity: 0.6, fontWeight: 400 }}>({link.style})</span></div>
                <div style={{ opacity: 0.7 }}>{link.url}</div>
              </div>
              <button type="button" className="btn" style={{ fontSize: 12, padding: "3px 8px", color: "#b91c1c", flexShrink: 0 }} onClick={() => remove(link)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

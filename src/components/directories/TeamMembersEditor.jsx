import React, { useCallback, useEffect, useState } from "react";
import { createTeamMember, deleteTeamMember, listTeamMembers, updateTeamMember } from "../../lib/directoryEntryTeamMembers";

const emptyForm = { name: "", role_title: "", photo_url: "", bio: "", is_visible: true };
const inputStyle = { width: "100%", boxSizing: "border-box", padding: "6px 9px", borderRadius: 7, border: "1px solid var(--lc-border)", fontSize: 13 };

/** People shown publicly on an entry (Claimed Directory Listings epic §10/§11). Saves immediately. */
export default function TeamMembersEditor({ directoryId, entryId, recordEvent }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!entryId) return;
    try {
      setLoading(true);
      setItems(await listTeamMembers(entryId));
      setErr("");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [entryId]);

  useEffect(() => { void refresh(); }, [refresh]);

  function fSet(key, value) { setForm((f) => ({ ...f, [key]: value })); }

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) { setErr("Name is required."); return; }
    try {
      setSaving(true);
      setErr("");
      const item = await createTeamMember(entryId, form);
      recordEvent?.("directory_entry_team_member_added", { directory_id: directoryId, entry_id: entryId, team_member_id: item.id });
      setForm(emptyForm);
      setAddOpen(false);
      await refresh();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  async function toggleVisible(item) {
    try {
      await updateTeamMember(item.id, { is_visible: !item.is_visible });
      await refresh();
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }

  async function remove(item) {
    try {
      await deleteTeamMember(item.id);
      recordEvent?.("directory_entry_team_member_removed", { directory_id: directoryId, entry_id: entryId, team_member_id: item.id });
      await refresh();
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Team</p>
        <button type="button" className="btn" style={{ fontSize: 12, padding: "3px 10px" }} onClick={() => setAddOpen((v) => !v)}>
          {addOpen ? "Cancel" : "+ Add team member"}
        </button>
      </div>

      {err && <p style={{ color: "#b91c1c", fontSize: 12, margin: "0 0 8px" }}>{err}</p>}

      {addOpen && (
        <form onSubmit={save} style={{ display: "grid", gap: 8, marginBottom: 12, padding: 12, background: "#f9fafb", border: "1px solid var(--lc-border)", borderRadius: 8 }}>
          <input value={form.name} onChange={(e) => fSet("name", e.target.value)} placeholder="Name" style={inputStyle} required />
          <input value={form.role_title} onChange={(e) => fSet("role_title", e.target.value)} placeholder="Role / title (optional)" style={inputStyle} />
          <input value={form.photo_url} onChange={(e) => fSet("photo_url", e.target.value)} placeholder="Photo URL (optional)" type="url" style={inputStyle} />
          <textarea value={form.bio} onChange={(e) => fSet("bio", e.target.value)} placeholder="Short bio (optional)" rows={2} style={{ ...inputStyle, resize: "vertical" }} />
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
            <input type="checkbox" checked={form.is_visible} onChange={(e) => fSet("is_visible", e.target.checked)} />
            Show publicly
          </label>
          <div>
            <button type="submit" className="btn btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} disabled={saving}>
              {saving ? "Saving…" : "Add team member"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p style={{ fontSize: 13, opacity: 0.6 }}>Loading…</p>
      ) : items.length === 0 ? (
        <p style={{ fontSize: 13, opacity: 0.6 }}>No team members yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {items.map((item) => (
            <div key={item.id} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, padding: "6px 10px", border: "1px solid var(--lc-border)", borderRadius: 7 }}>
              <div style={{ fontSize: 12 }}>
                <div style={{ fontWeight: 500 }}>
                  {item.name}
                  {!item.is_visible && <span style={{ marginLeft: 6, opacity: 0.65, fontWeight: 400 }}>(hidden)</span>}
                </div>
                {item.role_title && <div style={{ opacity: 0.8 }}>{item.role_title}</div>}
                {item.bio && <div style={{ opacity: 0.7, marginTop: 2 }}>{item.bio}</div>}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button type="button" className="btn" style={{ fontSize: 12, padding: "3px 8px" }} onClick={() => toggleVisible(item)}>
                  {item.is_visible ? "Hide" : "Show"}
                </button>
                <button type="button" className="btn" style={{ fontSize: 12, padding: "3px 8px", color: "#b91c1c" }} onClick={() => remove(item)}>
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

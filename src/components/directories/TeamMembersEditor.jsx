import React, { useCallback, useEffect, useState } from "react";
import { createTeamMember, deleteTeamMember, listTeamMembers, updateTeamMember } from "../../lib/directoryEntryTeamMembers";
import { Button, Callout, Checkbox, EmptyState, Field, Skeleton, Textarea, TextInput } from "../ui/index.js";
import "../../styles/wave-a/batch-3.css";

const emptyForm = { name: "", role_title: "", photo_url: "", bio: "", is_visible: true };

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
    <div className="b3-stack">
      <div className="b3-row b3-row--between">
        <h3 className="b3-subhead">Team</h3>
        <Button size="sm" onClick={() => setAddOpen((v) => !v)}>
          {addOpen ? "Cancel" : "Add team member"}
        </Button>
      </div>

      {err ? <Callout tone="danger">{err}</Callout> : null}

      {addOpen && (
        <form onSubmit={save} className="b3-form">
          <Field label="Name" required>
            <TextInput value={form.name} onChange={(e) => fSet("name", e.target.value)} />
          </Field>
          <Field label="Role or title" hint="Optional.">
            <TextInput value={form.role_title} onChange={(e) => fSet("role_title", e.target.value)} />
          </Field>
          <Field label="Photo URL" hint="Optional.">
            <TextInput type="url" value={form.photo_url} onChange={(e) => fSet("photo_url", e.target.value)} />
          </Field>
          <Field label="Short bio" hint="Optional.">
            <Textarea rows={2} value={form.bio} onChange={(e) => fSet("bio", e.target.value)} />
          </Field>
          <Checkbox label="Show publicly" checked={form.is_visible} onChange={(e) => fSet("is_visible", e.target.checked)} />
          <div className="b3-form-actions">
            <Button type="submit" variant="primary" loading={saving} loadingLabel="Saving…">Add team member</Button>
          </div>
        </form>
      )}

      {loading ? (
        <Skeleton variant="list" rows={2} label="Loading team members" />
      ) : items.length === 0 ? (
        <EmptyState art="none" title="No team members yet" body="Add the people you want shown publicly on this entry." />
      ) : (
        <ul className="b3-list">
          {items.map((item) => (
            <li key={item.id} className="b3-list-item b3-list-item--top">
              <div className="b3-list-main">
                <div className="b3-list-title">
                  {item.name}
                  {!item.is_visible && <span className="b3-muted">(hidden)</span>}
                </div>
                {item.role_title && <div className="b3-list-sub">{item.role_title}</div>}
                {item.bio && <div className="b3-list-sub">{item.bio}</div>}
              </div>
              <div className="b3-list-actions">
                <Button size="sm" onClick={() => toggleVisible(item)}>
                  {item.is_visible ? "Hide" : "Show"}
                </Button>
                <Button variant="danger" size="sm" aria-label={`Delete team member: ${item.name}`} onClick={() => remove(item)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

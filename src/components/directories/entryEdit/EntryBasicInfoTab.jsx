import React, { useEffect, useState } from "react";
import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { createDirectoryEntry, createDirectoryGroup, listDirectoryGroups, updateDirectoryEntry } from "../../../lib/directories.js";

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid var(--lc-border)",
  fontSize: 13,
};
const labelStyle = { fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 };

function buildForm(entry) {
  return {
    name: entry?.name || "",
    address: entry?.address || "",
    postcode: entry?.postcode || "",
    country: entry?.country || "",
    directory_group_id: entry?.directory_group_id || "",
    website_url: entry?.website_url || "",
    email: entry?.email || "",
    phone: entry?.phone || "",
    logo_url: entry?.logo_url || "",
    is_active: entry?.is_active !== false,
    show_phone: entry?.show_phone !== false,
    show_email: entry?.show_email !== false,
    show_website: entry?.show_website !== false,
    show_address: entry?.show_address !== false,
  };
}

/**
 * Core entry fields — the first tab of the full-page entry editor.
 * Deliberately excludes lat/lng: coordinates are auto-geocoded from
 * address/postcode/country, never hand-entered.
 */
export default function EntryBasicInfoTab({ directoryId, entryId, entry, isNew, canEdit, recordEvent, onSaved, onCreated }) {
  const [form, setForm] = useState(() => buildForm(entry));
  const [groups, setGroups] = useState([]);
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!directoryId) return;
    listDirectoryGroups(directoryId).then(setGroups).catch(() => {});
  }, [directoryId]);

  function fSet(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function saveNewGroup(e) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    try {
      setSavingGroup(true);
      const g = await createDirectoryGroup(directoryId, newGroupName);
      setGroups((gs) => [...gs, g]);
      fSet("directory_group_id", g.id);
      setAddGroupOpen(false);
      setNewGroupName("");
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSavingGroup(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    if (!form.name.trim()) {
      setErr("Name is required.");
      return;
    }
    try {
      setSaving(true);
      if (isNew) {
        const id = await createDirectoryEntry({ ...form, directory_id: directoryId });
        recordEvent?.("directory_entry_created", { directory_id: directoryId, entry_id: id, name: form.name });
        onCreated?.(id);
      } else {
        await updateDirectoryEntry(entryId, form);
        recordEvent?.("directory_entry_updated", { directory_id: directoryId, entry_id: entryId });
        onSaved?.();
      }
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="admin-card" style={{ padding: 20, maxWidth: 560 }}>
      <Stack gap="sm">
        <div>
          <label style={labelStyle}>Name <span style={{ color: "red" }}>*</span></label>
          <input value={form.name} onChange={(e) => fSet("name", e.target.value)} required disabled={!canEdit} placeholder="e.g. Bright Solutions Ltd" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Address</label>
          <input value={form.address} onChange={(e) => fSet("address", e.target.value)} disabled={!canEdit} placeholder="e.g. 1 Example Street, London" style={inputStyle} />
        </div>
        <Group gap="sm" grow>
          <div>
            <label style={labelStyle}>Postcode</label>
            <input value={form.postcode} onChange={(e) => fSet("postcode", e.target.value)} disabled={!canEdit} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Country</label>
            <input value={form.country} onChange={(e) => fSet("country", e.target.value)} disabled={!canEdit} style={inputStyle} />
          </div>
        </Group>

        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <label style={{ fontSize: 13, fontWeight: 500 }}>Group</label>
            {canEdit && (
              <button
                type="button"
                style={{ fontSize: 12, color: "var(--lc-brand, #4a9baa)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                onClick={() => { setAddGroupOpen(true); setNewGroupName(""); }}
              >
                + Add group
              </button>
            )}
          </div>
          <select value={form.directory_group_id} onChange={(e) => fSet("directory_group_id", e.target.value)} disabled={!canEdit} style={inputStyle}>
            <option value="">No group</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>

          {addGroupOpen && (
            <div style={{ marginTop: 8, padding: "12px 14px", background: "#f9fafb", border: "1px solid var(--lc-border)", borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>New group name</div>
              <form onSubmit={saveNewGroup} style={{ display: "flex", gap: 8 }}>
                <input
                  autoFocus
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Healthcare"
                  style={{ flex: 1, padding: "6px 10px", borderRadius: 7, border: "1px solid var(--lc-border)", fontSize: 13 }}
                  required
                />
                <button type="submit" className="btn btn-primary" style={{ fontSize: 13, padding: "6px 14px" }} disabled={savingGroup}>
                  {savingGroup ? "Saving…" : "Add"}
                </button>
                <button type="button" className="btn" style={{ fontSize: 13, padding: "6px 10px" }} onClick={() => setAddGroupOpen(false)}>
                  Cancel
                </button>
              </form>
            </div>
          )}
        </div>

        <div>
          <label style={labelStyle}>Website URL</label>
          <input value={form.website_url} onChange={(e) => fSet("website_url", e.target.value)} disabled={!canEdit} placeholder="https://…" type="url" style={inputStyle} />
        </div>
        <Group gap="sm" grow>
          <div>
            <label style={labelStyle}>Email</label>
            <input value={form.email} onChange={(e) => fSet("email", e.target.value)} disabled={!canEdit} placeholder="hello@…" type="email" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <input value={form.phone} onChange={(e) => fSet("phone", e.target.value)} disabled={!canEdit} placeholder="+44…" style={inputStyle} />
          </div>
        </Group>
        <div>
          <label style={labelStyle}>Logo URL</label>
          <input value={form.logo_url} onChange={(e) => fSet("logo_url", e.target.value)} disabled={!canEdit} placeholder="https://…/logo.png" type="url" style={inputStyle} />
          <Text size="xs" c="dimmed" mt={4}>Direct file upload is coming in a later phase — paste a hosted image URL for now.</Text>
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: canEdit ? "pointer" : "default" }}>
          <input type="checkbox" checked={form.is_active} onChange={(e) => fSet("is_active", e.target.checked)} disabled={!canEdit} />
          Active (visible)
        </label>

        <div>
          <label style={labelStyle}>Show publicly (once published)</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {[
              ["show_phone", "Phone"],
              ["show_email", "Email"],
              ["show_website", "Website"],
              ["show_address", "Address"],
            ].map(([key, label]) => (
              <label key={key} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: canEdit ? "pointer" : "default" }}>
                <input type="checkbox" checked={form[key]} onChange={(e) => fSet(key, e.target.checked)} disabled={!canEdit} />
                {label}
              </label>
            ))}
          </div>
        </div>

        {err && <Alert color="red" variant="light">{err}</Alert>}

        {canEdit && (
          <Group justify="flex-end" mt={4}>
            <Button size="sm" type="submit" loading={saving}>
              {isNew ? "Create entry" : "Save changes"}
            </Button>
          </Group>
        )}
      </Stack>
    </form>
  );
}

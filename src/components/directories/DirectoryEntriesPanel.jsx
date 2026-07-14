import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Group, Loader, Stack, Text } from "@mantine/core";
import {
  ENTRIES_PAGE_SIZE,
  createDirectoryEntry,
  createDirectoryGroup,
  deleteDirectoryEntry,
  listDirectoryEntries,
  listDirectoryGroups,
  updateDirectoryEntry,
} from "../../lib/directories";

const emptyForm = {
  name: "",
  address: "",
  postcode: "",
  country: "",
  city: "",
  directory_group_id: "",
  lat: "",
  lng: "",
  website_url: "",
  email: "",
  phone: "",
  logo_url: "",
  notes_html: "",
  allow_html: false,
  is_active: true,
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid var(--lc-border)",
  fontSize: 13,
};
const labelStyle = { fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 };

/**
 * Directory entries — search, paginate, create/edit, typed-confirm delete.
 * Shared between the client portal and the admin console (DIR-E1).
 *
 * @param {string} directoryId
 * @param {boolean} canEdit - Owner/Manager, or a Member explicitly granted access.
 * @param {(eventType: string, meta?: object) => void} [recordEvent] - admin-event emitter (see AGENTS.md), matches the recordFilterEvent convention used by FilterFieldsPanel.
 */
export default function DirectoryEntriesPanel({ directoryId, canEdit = true, recordEvent }) {
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const [groups, setGroups] = useState([]);
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);

  const [modal, setModal] = useState(null); // null | "new" | "edit"
  const [editingEntry, setEditingEntry] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const groupNameById = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const totalPages = Math.max(1, Math.ceil(count / ENTRIES_PAGE_SIZE));

  const refresh = useCallback(async () => {
    if (!directoryId) return;
    setLoading(true);
    try {
      const { rows: r, count: c } = await listDirectoryEntries(directoryId, { search, page });
      setRows(r);
      setCount(c);
      setErr("");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [directoryId, search, page]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!directoryId) return;
    listDirectoryGroups(directoryId).then(setGroups).catch(() => {});
  }, [directoryId]);

  // Debounce search input so it doesn't fire a query per keystroke.
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  function fSet(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function openCreate() {
    setEditingEntry(null);
    setForm(emptyForm);
    setFormErr("");
    setModal("new");
  }

  function openEdit(entry) {
    setEditingEntry(entry);
    setForm({
      name: entry.name || "",
      address: entry.address || "",
      postcode: entry.postcode || "",
      country: entry.country || "",
      city: entry.city || "",
      directory_group_id: entry.directory_group_id || "",
      lat: entry.lat ?? "",
      lng: entry.lng ?? "",
      website_url: entry.website_url || "",
      email: entry.email || "",
      phone: entry.phone || "",
      logo_url: entry.logo_url || "",
      notes_html: entry.notes_html || "",
      allow_html: !!entry.allow_html,
      is_active: entry.is_active !== false,
    });
    setFormErr("");
    setModal("edit");
  }

  function closeModal() {
    setModal(null);
    setEditingEntry(null);
  }

  async function saveEntry(e) {
    e.preventDefault();
    setFormErr("");
    if (!form.name.trim()) {
      setFormErr("Name is required.");
      return;
    }
    try {
      setSaving(true);
      if (modal === "new") {
        const id = await createDirectoryEntry({ ...form, directory_id: directoryId });
        recordEvent?.("directory_entry_created", { directory_id: directoryId, entry_id: id, name: form.name });
      } else if (editingEntry) {
        await updateDirectoryEntry(editingEntry.id, form);
        recordEvent?.("directory_entry_updated", { directory_id: directoryId, entry_id: editingEntry.id });
      }
      closeModal();
      await refresh();
    } catch (e2) {
      setFormErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
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
      setFormErr(e2?.message ?? String(e2));
    } finally {
      setSavingGroup(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleteText !== "DELETE") return;
    try {
      setDeleting(true);
      await deleteDirectoryEntry(deleteTarget.id);
      recordEvent?.("directory_entry_deleted", { directory_id: directoryId, entry_id: deleteTarget.id, name: deleteTarget.name });
      setDeleteTarget(null);
      setDeleteText("");
      await refresh();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <Text size="sm" fw={600}>Entries</Text>
          <Text size="xs" c="dimmed">{count} {count === 1 ? "entry" : "entries"} in this directory</Text>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openCreate}>
            + Add entry
          </Button>
        )}
      </div>

      <input
        type="text"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        placeholder="Search by name or address…"
        style={{ maxWidth: 380, ...inputStyle }}
      />

      {err && <Alert color="red" variant="light">{err}</Alert>}

      {loading ? (
        <Loader size="sm" />
      ) : (
        <>
          <div style={{ overflowX: "auto", border: "1px solid var(--lc-border)", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--lc-border)", background: "rgba(0,0,0,0.02)" }}>
                  <th style={{ padding: "9px 10px" }}>Name</th>
                  <th style={{ padding: "9px 10px" }}>Group</th>
                  <th style={{ padding: "9px 10px" }}>Address</th>
                  <th style={{ padding: "9px 10px" }}>Status</th>
                  <th style={{ padding: "9px 10px" }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <tr key={entry.id} style={{ borderBottom: "1px solid var(--lc-border)" }}>
                    <td style={{ padding: "8px 10px" }}>{entry.name}</td>
                    <td style={{ padding: "8px 10px" }}>{groupNameById.get(entry.directory_group_id) || "—"}</td>
                    <td style={{ padding: "8px 10px", opacity: 0.85 }}>{entry.address || "—"}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <Badge color={entry.is_active ? "green" : "gray"} variant="light" size="sm">
                        {entry.is_active ? "Active" : "Hidden"}
                      </Badge>
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {canEdit && (
                        <Group gap="xs" justify="flex-end">
                          <Button size="xs" variant="default" onClick={() => openEdit(entry)}>Edit</Button>
                          <Button size="xs" variant="subtle" color="red" onClick={() => { setDeleteTarget(entry); setDeleteText(""); }}>
                            Delete
                          </Button>
                        </Group>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: "16px 10px", opacity: 0.6, textAlign: "center" }}>
                      {search ? "No entries match your search." : "No entries yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <Text size="xs" c="dimmed">
              {count ? `Showing ${page * ENTRIES_PAGE_SIZE + 1}–${Math.min((page + 1) * ENTRIES_PAGE_SIZE, count)} of ${count}` : "No entries"}
            </Text>
            <Group gap="xs">
              <Button size="xs" variant="default" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page <= 0}>Prev</Button>
              <Button size="xs" variant="default" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>Next</Button>
            </Group>
          </div>
        </>
      )}

      {modal && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", padding: 16 }}
          onClick={closeModal}
        >
          <div className="admin-card" style={{ padding: 24, maxWidth: 520, width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.22)" }} onClick={(e) => e.stopPropagation()}>
            <Text fw={600} size="md" mb={16}>{modal === "new" ? "Add entry" : `Edit: ${editingEntry?.name || ""}`}</Text>
            <form onSubmit={saveEntry}>
              <Stack gap="sm">
                <div>
                  <label style={labelStyle}>Name <span style={{ color: "red" }}>*</span></label>
                  <input value={form.name} onChange={(e) => fSet("name", e.target.value)} required placeholder="e.g. Bright Solutions Ltd" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Address</label>
                  <input value={form.address} onChange={(e) => fSet("address", e.target.value)} placeholder="e.g. 1 Example Street, London" style={inputStyle} />
                </div>
                <Group gap="sm" grow>
                  <div>
                    <label style={labelStyle}>Postcode</label>
                    <input value={form.postcode} onChange={(e) => fSet("postcode", e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Country</label>
                    <input value={form.country} onChange={(e) => fSet("country", e.target.value)} style={inputStyle} />
                  </div>
                </Group>
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <label style={{ fontSize: 13, fontWeight: 500 }}>Group</label>
                    <button
                      type="button"
                      style={{ fontSize: 12, color: "var(--lc-brand, #4a9baa)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                      onClick={() => { setAddGroupOpen(true); setNewGroupName(""); }}
                    >
                      + Add group
                    </button>
                  </div>
                  <select value={form.directory_group_id} onChange={(e) => fSet("directory_group_id", e.target.value)} style={inputStyle}>
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
                <Group gap="sm" grow>
                  <div>
                    <label style={labelStyle}>Latitude</label>
                    <input value={form.lat} onChange={(e) => fSet("lat", e.target.value)} placeholder="e.g. 51.5074" inputMode="decimal" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Longitude</label>
                    <input value={form.lng} onChange={(e) => fSet("lng", e.target.value)} placeholder="e.g. -0.1278" inputMode="decimal" style={inputStyle} />
                  </div>
                </Group>
                <div>
                  <label style={labelStyle}>Website URL</label>
                  <input value={form.website_url} onChange={(e) => fSet("website_url", e.target.value)} placeholder="https://…" type="url" style={inputStyle} />
                </div>
                <Group gap="sm" grow>
                  <div>
                    <label style={labelStyle}>Email</label>
                    <input value={form.email} onChange={(e) => fSet("email", e.target.value)} placeholder="hello@…" type="email" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Phone</label>
                    <input value={form.phone} onChange={(e) => fSet("phone", e.target.value)} placeholder="+44…" style={inputStyle} />
                  </div>
                </Group>
                <div>
                  <label style={labelStyle}>Logo URL</label>
                  <input value={form.logo_url} onChange={(e) => fSet("logo_url", e.target.value)} placeholder="https://…/logo.png" type="url" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea value={form.notes_html} onChange={(e) => fSet("notes_html", e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
                </div>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.is_active} onChange={(e) => fSet("is_active", e.target.checked)} />
                  Active (visible)
                </label>

                {formErr && <Alert color="red" variant="light">{formErr}</Alert>}

                <Group gap="xs" justify="flex-end" mt={4}>
                  <Button variant="default" size="sm" type="button" onClick={closeModal}>Cancel</Button>
                  <Button size="sm" type="submit" loading={saving}>
                    {modal === "new" ? "Add entry" : "Save changes"}
                  </Button>
                </Group>
              </Stack>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1001, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: 16 }}
          onClick={() => setDeleteTarget(null)}
        >
          <div className="panel-section admin-card" style={{ border: "1px solid #b91c1c", maxWidth: 440, width: "100%" }} onClick={(e) => e.stopPropagation()}>
            <p className="panel-section__title" style={{ color: "#b91c1c" }}>Delete "{deleteTarget.name}" permanently?</p>
            <p style={{ margin: "0 0 8px", fontSize: 13 }}>
              This removes the entry and its category tags. This can't be undone.
            </p>
            <p style={{ margin: "0 0 6px", fontSize: 13 }}>Type <strong>DELETE</strong> to confirm:</p>
            <input value={deleteText} onChange={(e) => setDeleteText(e.target.value)} placeholder="DELETE" style={inputStyle} />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button type="button" className="btn" onClick={confirmDelete} disabled={deleting || deleteText !== "DELETE"} style={{ color: "#fff", background: "#b91c1c", borderColor: "#b91c1c" }}>
                {deleting ? "Deleting…" : "Delete permanently"}
              </button>
              <button type="button" className="btn" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

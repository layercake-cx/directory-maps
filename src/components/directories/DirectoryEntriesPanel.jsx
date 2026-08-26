import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Group, Loader, Stack, Text } from "@mantine/core";
import {
  ENTRIES_PAGE_SIZE,
  bulkSetDirectoryEntriesActive,
  createDirectoryEntry,
  createDirectoryGroup,
  deleteDirectoryEntry,
  listDirectoryEntries,
  listDirectoryGroups,
  updateDirectoryEntry,
  upsertDirectoryEntries,
} from "../../lib/directories";
import { appliesToEntries, listCategorisations, loadEntryTermIds, setEntryTerms } from "../../lib/categorisations";
import CategoryTagPicker from "./CategoryTagPicker.jsx";
import BulkCategoryEditModal from "./BulkCategoryEditModal.jsx";

// ─── CSV helpers (mirrors ClientMapData.jsx's parseCSV convention) ──────────

function parseCSV(text) {
  const rows = [];
  let cur = [], val = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (ch === '"' && inQuotes && next === '"') { val += '"'; i++; continue; }
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { cur.push(val); val = ""; continue; }
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      cur.push(val); val = "";
      if (cur.some((c) => String(c).trim() !== "")) rows.push(cur);
      cur = []; continue;
    }
    val += ch;
  }
  cur.push(val);
  if (cur.some((c) => String(c).trim() !== "")) rows.push(cur);
  return rows;
}

function boolish(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  return null;
}

function categoryColumnName(key) {
  return `category_${key}`;
}

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
 * @param {string} [clientId] - required to show the Categorisations tag picker (DIR-E5-S2); omit to hide it.
 * @param {boolean} canEdit - Owner/Manager, or a Member explicitly granted access.
 * @param {(eventType: string, meta?: object) => void} [recordEvent] - admin-event emitter (see AGENTS.md), matches the recordFilterEvent convention used by FilterFieldsPanel.
 */
export default function DirectoryEntriesPanel({ directoryId, clientId, canEdit = true, recordEvent }) {
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

  const [entryTermIds, setEntryTermIdsState] = useState([]);

  const [categorisations, setCategorisations] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [csvRows, setCsvRows] = useState([]);
  const [csvPreview, setCsvPreview] = useState([]);
  const [csvFileErr, setCsvFileErr] = useState("");
  const [csvMsg, setCsvMsg] = useState("");
  const [importing, setImporting] = useState(false);

  const groupNameById = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const totalPages = Math.max(1, Math.ceil(count / ENTRIES_PAGE_SIZE));
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));

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

  useEffect(() => {
    if (!clientId) return;
    listCategorisations(clientId)
      .then((all) => setCategorisations(all.filter((c) => appliesToEntries(c.applies_to))))
      .catch(() => {});
  }, [clientId]);

  // Selection is page-scoped (entry ids only exist once their page has loaded);
  // clear it whenever the underlying result set changes so stale ids can't linger.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [directoryId, search, page]);

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
    setEntryTermIdsState([]);
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
    setEntryTermIdsState([]);
    if (clientId) loadEntryTermIds(entry.id).then(setEntryTermIdsState).catch(() => {});
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
        if (clientId) await setEntryTerms(id, entryTermIds);
        recordEvent?.("directory_entry_created", { directory_id: directoryId, entry_id: id, name: form.name });
      } else if (editingEntry) {
        await updateDirectoryEntry(editingEntry.id, form);
        if (clientId) await setEntryTerms(editingEntry.id, entryTermIds);
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

  // ── Bulk selection + actions (DIR-E1-S4) ──────────────────────────────────

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAllOnPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) rows.forEach((r) => next.delete(r.id));
      else rows.forEach((r) => next.add(r.id));
      return next;
    });
  }

  async function bulkArchive(isActive) {
    const ids = [...selectedIds];
    if (!ids.length) return;
    try {
      setBulkBusy(true);
      setErr("");
      await bulkSetDirectoryEntriesActive(ids, isActive);
      recordEvent?.("directory_entry_bulk_archived", { directory_id: directoryId, entry_count: ids.length, is_active: isActive });
      setSelectedIds(new Set());
      await refresh();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBulkBusy(false);
    }
  }

  // ── CSV import (DIR-E1-S6) — "add to existing" only; no destructive overwrite mode ──

  function getGroupLabel(r) {
    return String(r.group_name ?? r.group ?? "").trim();
  }

  async function onPickCsvFile(file) {
    setCsvFileErr(""); setErr(""); setCsvMsg(""); setCsvRows([]); setCsvPreview([]);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) { setCsvFileErr("Upload CSV only (export from Excel as CSV)."); return; }
    const text = await file.text();
    const raw = parseCSV(text);
    if (raw.length < 2) { setCsvFileErr("CSV looks empty."); return; }
    const headers = raw[0].map((h) => String(h).trim().toLowerCase());
    if (!headers.includes("name")) { setCsvFileErr("Missing required column: name"); return; }
    const objs = raw.slice(1).map((row) => {
      const o = {};
      headers.forEach((h, idx) => { o[h] = row[idx] ?? ""; });
      return o;
    });
    setCsvRows(objs);
    setCsvPreview(objs.slice(0, 20));
    setCsvMsg(`${objs.length} rows ready to import.`);
  }

  function downloadTemplate() {
    const baseHeader = ["id", "name", "address", "postcode", "country", "city", "lat", "lng", "website_url", "email", "phone", "logo_url", "notes_html", "allow_html", "group_name", "is_active"];
    const baseSample = ["", "Example Supplier Ltd", "1 Example Street", "SW1A 1AA", "UK", "", "", "", "https://example.com", "hello@example.com", "", "", "", "false", "", "true"];
    const catCols = categorisations.map((c) => categoryColumnName(c.key));
    const catSample = categorisations.map((c) => (c.terms || []).slice(0, 1).map((t) => t.slug).join("|"));
    const header = [...baseHeader, ...catCols];
    const sample = [[...baseSample, ...catSample]];
    const toCSV = (arr) => arr.map((row) => row.map((cell) => {
      const s = String(cell ?? "");
      return (s.includes('"') || s.includes(",") || s.includes("\n")) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")).join("\n");
    const blob = new Blob([toCSV([header, ...sample])], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "directory-entries-template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function doImport() {
    setErr(""); setCsvMsg("");
    if (!csvRows.length) { setErr("No rows loaded yet."); return; }

    try {
      setImporting(true);

      // Auto-create groups for any previously-unseen group_name values (matches
      // ClientMapData.jsx's doImport convention).
      const distinctGroups = new Map();
      for (const r of csvRows) {
        const label = getGroupLabel(r);
        if (!label) continue;
        const key = label.toLowerCase();
        if (!distinctGroups.has(key)) distinctGroups.set(key, label);
      }
      const existingGroups = await listDirectoryGroups(directoryId);
      const groupLookup = new Map();
      existingGroups.forEach((g) => groupLookup.set((g.name || "").trim().toLowerCase(), g.id));
      for (const [key, displayName] of distinctGroups) {
        if (groupLookup.has(key)) continue;
        const g = await createDirectoryGroup(directoryId, displayName);
        groupLookup.set(key, g.id);
      }

      // Resolve category_<key> columns against existing term slugs/labels.
      // Unknown tokens are reported as warnings, not auto-created — that's a
      // taxonomy change and belongs in Categorisations, not a data import.
      const termLookupByCat = new Map();
      for (const cat of categorisations) {
        const m = new Map();
        (cat.terms || []).forEach((t) => {
          m.set(String(t.slug || "").toLowerCase(), t.id);
          m.set(String(t.label || "").toLowerCase(), t.id);
        });
        termLookupByCat.set(cat.id, m);
      }

      const cleaned = [];
      const errors = [];
      const warnings = [];
      const entryTermsById = new Map();

      csvRows.forEach((r, idx) => {
        const rowNum = idx + 2;
        const name = String(r.name ?? "").trim();
        if (!name) { errors.push(`Row ${rowNum}: name is required`); return; }
        const id = String(r.id ?? "").trim() || crypto.randomUUID();
        const lat = String(r.lat ?? "").trim();
        const lng = String(r.lng ?? "").trim();
        const latNum = lat === "" ? null : Number(lat);
        const lngNum = lng === "" ? null : Number(lng);
        if (latNum !== null && Number.isNaN(latNum)) { errors.push(`Row ${rowNum}: lat is not a valid number`); return; }
        if (lngNum !== null && Number.isNaN(lngNum)) { errors.push(`Row ${rowNum}: lng is not a valid number`); return; }
        if ((latNum === null) !== (lngNum === null)) { errors.push(`Row ${rowNum}: provide both lat and lng, or leave both blank`); return; }

        const groupKey = getGroupLabel(r).toLowerCase();
        const directory_group_id = groupKey ? groupLookup.get(groupKey) ?? null : null;

        cleaned.push({
          id,
          directory_id: directoryId,
          directory_group_id,
          name,
          address: String(r.address ?? "").trim() || null,
          postcode: String(r.postcode ?? "").trim() || null,
          country: String(r.country ?? "").trim() || null,
          city: String(r.city ?? "").trim() || null,
          lat: latNum,
          lng: lngNum,
          website_url: String(r.website_url ?? "").trim() || null,
          email: String(r.email ?? "").trim() || null,
          phone: String(r.phone ?? "").trim() || null,
          logo_url: String(r.logo_url ?? "").trim() || null,
          notes_html: String(r.notes_html ?? "").trim() || null,
          allow_html: boolish(r.allow_html) ?? false,
          is_active: boolish(r.is_active) ?? true,
          source: "csv",
        });

        if (clientId) {
          const termIds = [];
          for (const cat of categorisations) {
            const col = categoryColumnName(cat.key);
            const raw = String(r[col] ?? "").trim();
            if (!raw) continue;
            const lookup = termLookupByCat.get(cat.id);
            raw.split("|").map((s) => s.trim()).filter(Boolean).forEach((token) => {
              const termId = lookup?.get(token.toLowerCase());
              if (termId) termIds.push(termId);
              else warnings.push(`Row ${rowNum}: unknown ${cat.label} term "${token}"`);
            });
          }
          if (termIds.length) entryTermsById.set(id, termIds);
        }
      });

      if (errors.length) {
        setErr(errors.slice(0, 40).join("\n") + (errors.length > 40 ? `\n… +${errors.length - 40} more` : ""));
        return;
      }

      const upserted = await upsertDirectoryEntries(cleaned);
      for (const [entryId, termIds] of entryTermsById) {
        await setEntryTerms(entryId, termIds);
      }

      recordEvent?.("directory_entry_imported", {
        directory_id: directoryId,
        rows_imported: upserted.length,
        rows_skipped: cleaned.length - upserted.length,
        warnings: warnings.slice(0, 20),
      });

      setCsvMsg(`Imported ${upserted.length} row${upserted.length === 1 ? "" : "s"}.${warnings.length ? ` ${warnings.length} term warning(s) below.` : ""}`);
      setErr(warnings.length ? warnings.slice(0, 40).join("\n") : "");
      setCsvRows([]);
      setCsvPreview([]);
      setImportOpen(false);
      await refresh();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setImporting(false);
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
          <Group gap="xs">
            <Button size="sm" variant="default" onClick={downloadTemplate}>Download CSV template</Button>
            <Button size="sm" variant="default" onClick={() => setImportOpen((v) => !v)}>
              {importOpen ? "Cancel import" : "Import CSV"}
            </Button>
            <Button size="sm" onClick={openCreate}>+ Add entry</Button>
          </Group>
        )}
      </div>

      <input
        type="text"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        placeholder="Search by name or address…"
        style={{ maxWidth: 380, ...inputStyle }}
      />

      {canEdit && importOpen && (
        <div className="admin-card" style={{ padding: 16 }}>
          <Text size="sm" fw={600} mb={4}>Import entries from CSV</Text>
          <Text size="xs" c="dimmed" mb={10}>
            Add to existing entries — rows are matched by <code>id</code> when present, otherwise created new.
          </Text>
          <input type="file" accept=".csv" onChange={(e) => onPickCsvFile(e.target.files?.[0])} style={{ fontSize: 13 }} />
          {csvFileErr && <Alert color="red" variant="light" mt="xs">{csvFileErr}</Alert>}
          {csvMsg && <Alert color="green" variant="light" mt="xs">{csvMsg}</Alert>}

          {csvPreview.length > 0 && (
            <>
              <div style={{ overflowX: "auto", border: "1px solid var(--lc-border)", borderRadius: 8, marginTop: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      {["name", "postcode", "country", "lat", "lng", "group_name"].map((h) => (
                        <th key={h} style={{ padding: "6px 8px", textAlign: "left" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.map((r, i) => (
                      <tr key={i}>
                        <td style={{ padding: "6px 8px" }}>{r.name}</td>
                        <td style={{ padding: "6px 8px" }}>{r.postcode}</td>
                        <td style={{ padding: "6px 8px" }}>{r.country}</td>
                        <td style={{ padding: "6px 8px" }}>{r.lat || "—"}</td>
                        <td style={{ padding: "6px 8px" }}>{r.lng || "—"}</td>
                        <td style={{ padding: "6px 8px" }}>{r.group_name || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button size="sm" mt={10} onClick={doImport} loading={importing} disabled={importing}>
                {importing ? "Importing…" : `Import ${csvRows.length} row${csvRows.length === 1 ? "" : "s"}`}
              </Button>
            </>
          )}
        </div>
      )}

      {canEdit && selectedIds.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 12px", background: "rgba(74,155,170,0.08)", border: "1px solid var(--lc-border)", borderRadius: 8 }}>
          <Text size="xs" fw={600}>{selectedIds.size} selected</Text>
          <Button size="xs" variant="default" onClick={() => bulkArchive(false)} disabled={bulkBusy} loading={bulkBusy}>Archive</Button>
          <Button size="xs" variant="default" onClick={() => bulkArchive(true)} disabled={bulkBusy} loading={bulkBusy}>Restore</Button>
          {clientId && (
            <Button size="xs" variant="default" onClick={() => setBulkTagOpen(true)} disabled={bulkBusy}>Bulk tag…</Button>
          )}
          <Button size="xs" variant="subtle" color="gray" onClick={() => setSelectedIds(new Set())}>Clear selection</Button>
        </div>
      )}

      {err && <Alert color="red" variant="light"><pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{err}</pre></Alert>}

      {loading ? (
        <Loader size="sm" />
      ) : (
        <>
          <div style={{ overflowX: "auto", border: "1px solid var(--lc-border)", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--lc-border)", background: "rgba(0,0,0,0.02)" }}>
                  {canEdit && (
                    <th style={{ padding: "9px 10px", width: 1 }}>
                      <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAllOnPage} aria-label="Select all on page" />
                    </th>
                  )}
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
                    {canEdit && (
                      <td style={{ padding: "8px 10px" }}>
                        <input type="checkbox" checked={selectedIds.has(entry.id)} onChange={() => toggleSelected(entry.id)} aria-label={`Select ${entry.name || "entry"}`} />
                      </td>
                    )}
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
                    <td colSpan={canEdit ? 6 : 5} style={{ padding: "16px 10px", opacity: 0.6, textAlign: "center" }}>
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

                {clientId && (
                  <div>
                    <label style={labelStyle}>Categorisations</label>
                    <CategoryTagPicker
                      clientId={clientId}
                      scope="entry"
                      selectedTermIds={entryTermIds}
                      onChange={setEntryTermIdsState}
                    />
                  </div>
                )}

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

      {bulkTagOpen && (
        <BulkCategoryEditModal
          categorisations={categorisations}
          entryIds={[...selectedIds]}
          directoryId={directoryId}
          recordEvent={recordEvent}
          onClose={() => setBulkTagOpen(false)}
          onApplied={() => setSelectedIds(new Set())}
        />
      )}
    </div>
  );
}

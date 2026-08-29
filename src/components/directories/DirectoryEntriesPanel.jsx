import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Badge, Button, Group, Loader, Text } from "@mantine/core";
import {
  ENTRIES_PAGE_SIZE,
  bulkSetDirectoryEntriesActive,
  createDirectoryGroup,
  deleteDirectoryEntry,
  listDirectoryEntries,
  listDirectoryGroups,
  upsertDirectoryEntries,
} from "../../lib/directories";
import { listAttachedCategorisations, setEntryTerms } from "../../lib/categorisations";
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

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid var(--lc-border)",
  fontSize: 13,
};

/**
 * Directory entries — search, paginate, create/edit, typed-confirm delete.
 * Shared between the client portal and the admin console (DIR-E1).
 *
 * @param {string} directoryId
 * @param {string} directoryBasePath - this directory's own base route (e.g. `/client/directories/:id` or the admin equivalent) — entries are edited at `${directoryBasePath}/entries/:entryId`.
 * @param {string} [clientId] - required to show the Categorisations tag picker (DIR-E5-S2); omit to hide it.
 * @param {boolean} canEdit - Owner/Manager, or a Member explicitly granted access.
 * @param {(eventType: string, meta?: object) => void} [recordEvent] - admin-event emitter (see AGENTS.md), matches the recordFilterEvent convention used by FilterFieldsPanel.
 */
export default function DirectoryEntriesPanel({ directoryId, directoryBasePath, clientId, canEdit = true, recordEvent }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const [groups, setGroups] = useState([]);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);

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
    if (!directoryId) return;
    listAttachedCategorisations("directory", directoryId)
      .then(setCategorisations)
      .catch(() => {});
  }, [directoryId]);

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

  function goToCreate() {
    navigate(`${directoryBasePath}/entries/new`);
  }

  function goToEdit(entry) {
    navigate(`${directoryBasePath}/entries/${encodeURIComponent(entry.id)}`);
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
            <Button size="sm" onClick={goToCreate}>+ Add entry</Button>
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
                          <Button size="xs" variant="default" onClick={() => goToEdit(entry)}>Edit</Button>
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

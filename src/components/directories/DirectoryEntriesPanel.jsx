import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  ENTRIES_PAGE_SIZE,
  bulkSetDirectoryEntriesActive,
  createDirectoryGroup,
  deleteAllDirectoryEntries,
  deleteDirectoryEntry,
  geocodeDirectoryEntries,
  listAllDirectoryEntries,
  listDirectoryEntries,
  listDirectoryGroups,
  upsertDirectoryEntries,
} from "../../lib/directories";
import { listAttachedCategorisations, listEntryTermIdsByEntry, setEntryTerms } from "../../lib/categorisations";
import BulkCategoryEditModal from "./BulkCategoryEditModal.jsx";
import { JobCard, KeepOpenBanner, useLocalJob, buildBrowserJob } from "../jobs/index.js";
import {
  AskPipLink, BulkBar, Button, Callout, DataTable, Dialog, EmptyState, Field, OverflowMenu, PageLayout, PlusIcon, Pill,
  Section, Select, TextInput, Toolbar, useUnsavedGuard,
} from "../ui/index.js";
import "../../styles/wave-a/batch-2.css";

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

// ─── CSV column contract (import + export + template share these so they can
// never drift apart — see AGENTS.md's "directory entries CSV contract" note).
// System-managed/computed columns (timestamps, geocode status, AI-generated
// fields) are deliberately excluded: they're written by other features and a
// bulk CSV edit shouldn't be able to blank them out as a side effect.
const BASE_HEADER = ["id", "name", "address", "postcode", "country", "city", "lat", "lng", "website_url", "email", "phone", "logo_url", "notes_html", "allow_html", "group_name", "is_active"];
const EXTRA_FIELD_KEYS = ["show_phone", "show_email", "show_website", "show_address", "slug", "meta_title", "meta_description", "noindex", "structured_data_type", "sitemap_priority", "og_title", "og_description", "og_image_url", "canonical_url", "keywords", "twitter_card_type", "panel_image_url", "panel_background_color"];
const BOOL_DEFAULT_TRUE_FIELDS = new Set(["show_phone", "show_email", "show_website", "show_address"]);
const STRUCTURED_DATA_TYPES = ["LocalBusiness", "Organization", "Person"];
const TWITTER_CARD_TYPES = ["summary", "summary_large_image"];

function buildEntryCsvHeader(categorisations) {
  return [...BASE_HEADER, ...EXTRA_FIELD_KEYS, ...categorisations.map((c) => categoryColumnName(c.key))];
}

function downloadCsv(filename, header, rows) {
  const toCSV = (arr) => arr.map((row) => row.map((cell) => {
    const s = String(cell ?? "");
    return (s.includes('"') || s.includes(",") || s.includes("\n")) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
  const blob = new Blob([toCSV([header, ...rows])], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Directory entries — search, paginate, create/edit, typed-confirm delete.
 * Shared between the client portal and the admin console (DIR-E1).
 *
 * @param {string} directoryId
 * @param {string} directoryBasePath - this directory's own base route (e.g. `/client/directories/:id` or the admin equivalent) — entries are edited at `${directoryBasePath}/entries/:entryId`.
 * @param {string} [clientId] - required to show the Categories tag picker (DIR-E5-S2); omit to hide it.
 * @param {boolean} canEdit - Owner/Manager, or a Member explicitly granted access.
 * @param {(eventType: string, meta?: object) => void} [recordEvent] - admin-event emitter (see AGENTS.md), matches the recordFilterEvent convention used by FilterFieldsPanel.
 */
export default function DirectoryEntriesPanel({ directoryId, directoryBasePath, clientId, canEdit = true, recordEvent }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  // Initial gap filter comes from ?gap= (Overview tiles link here); changing the dropdown keeps the URL in step.
  const [gap, setGapState] = useState(() => {
    const g = searchParams.get("gap");
    return ["no_logo", "no_content", "no_seo", "not_geocoded"].includes(g) ? g : "";
  });
  const setGap = (value) => {
    setGapState(value);
    setSearchParams((prev) => { const n = new URLSearchParams(prev); if (value) n.set("gap", value); else n.delete("gap"); return n; }, { replace: true });
  };
  const [categoryTermId, setCategoryTermId] = useState("");

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
  // CSV import runs in the browser: banner + leave guard while it runs, then a done/failed JobCard.
  const { pathname } = useLocation();
  const importJob = useLocalJob(`csv-import:${directoryId}`);
  useUnsavedGuard(importing);
  const [importChoiceOpen, setImportChoiceOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [geocoding, setGeocoding] = useState(false);
  const [geocodeMsg, setGeocodeMsg] = useState("");

  const groupNameById = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);

  const refresh = useCallback(async () => {
    if (!directoryId) return;
    setLoading(true);
    try {
      const { rows: r, count: c } = await listDirectoryEntries(directoryId, { search, page, gap: gap || null, categoryTermId: categoryTermId || null });
      setRows(r);
      setCount(c);
      setErr("");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [directoryId, search, page, gap, categoryTermId]);

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
  }, [directoryId, search, page, gap, categoryTermId]);

  // Gaps/categorisation filters (Phase 4, admin shell redesign) reset to page 0 like search does.
  useEffect(() => {
    setPage(0);
  }, [gap, categoryTermId]);

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

  // ── Geocoding (DIR-E4 fix) — entries have no lat/lng unless geocoded here ───

  async function handleGeocodeMissing() {
    setErr(""); setGeocodeMsg("");
    try {
      setGeocoding(true);
      recordEvent?.("data_geocode_started", { directory_id: directoryId });
      const queued = await geocodeDirectoryEntries(directoryId);
      if (queued === 0) {
        setGeocodeMsg("No entries need geocoding — every active entry already has coordinates.");
      } else {
        setGeocodeMsg(`Geocoding ${queued} ${queued === 1 ? "entry" : "entries"} in the background — refresh in a moment to see pins update.`);
      }
      window.setTimeout(() => setGeocodeMsg(""), 8000);
    } catch (e) {
      const message = e?.message ?? String(e);
      setErr(message);
      recordEvent?.("data_geocode_failed", { directory_id: directoryId, error: message });
    } finally {
      setGeocoding(false);
    }
  }

  // ── CSV import (DIR-E1-S6) — confirm overwrite vs. append, then upsert-by-id ──

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
    const header = buildEntryCsvHeader(categorisations);
    const baseSample = ["", "Example Supplier Ltd", "1 Example Street", "SW1A 1AA", "UK", "", "", "", "https://example.com", "hello@example.com", "", "", "", "false", "", "true"];
    const extraSample = EXTRA_FIELD_KEYS.map((key) => (BOOL_DEFAULT_TRUE_FIELDS.has(key) ? "true" : ""));
    const catSample = categorisations.map((c) => (c.terms || []).slice(0, 1).map((t) => t.slug).join("|"));
    downloadCsv("directory-entries-template.csv", header, [[...baseSample, ...extraSample, ...catSample]]);
  }

  // ── CSV export (DIR-E1-S8) — every entry, live from the DB, in exactly the
  // same column order the import expects, so a re-import updates in place.
  async function exportEntriesCsv() {
    setErr(""); setCsvMsg("");
    try {
      setExporting(true);
      const entries = await listAllDirectoryEntries(directoryId);
      const header = buildEntryCsvHeader(categorisations);

      let termIdsByEntry = new Map();
      const termIdToSlugByCat = new Map();
      if (clientId && categorisations.length && entries.length) {
        termIdsByEntry = await listEntryTermIdsByEntry(entries.map((e) => e.id));
        for (const cat of categorisations) {
          termIdToSlugByCat.set(cat.id, new Map((cat.terms || []).map((t) => [t.id, t.slug])));
        }
      }

      const rows = entries.map((entry) => {
        const base = [
          entry.id,
          entry.name,
          entry.address ?? "",
          entry.postcode ?? "",
          entry.country ?? "",
          entry.city ?? "",
          entry.lat ?? "",
          entry.lng ?? "",
          entry.website_url ?? "",
          entry.email ?? "",
          entry.phone ?? "",
          entry.logo_url ?? "",
          entry.notes_html ?? "",
          entry.allow_html ? "true" : "false",
          groupNameById.get(entry.directory_group_id) || "",
          entry.is_active ? "true" : "false",
        ];
        const extras = EXTRA_FIELD_KEYS.map((key) => {
          const v = entry[key];
          if (BOOL_DEFAULT_TRUE_FIELDS.has(key)) return v === false ? "false" : "true";
          if (key === "noindex") return v === true ? "true" : v === false ? "false" : "";
          return v == null ? "" : String(v);
        });
        const termIds = termIdsByEntry.get(entry.id) || [];
        const cats = categorisations.map((cat) => {
          const slugLookup = termIdToSlugByCat.get(cat.id);
          return termIds.map((tid) => slugLookup?.get(tid)).filter(Boolean).join("|");
        });
        return [...base, ...extras, ...cats];
      });

      downloadCsv(`directory-entries-export-${directoryId}.csv`, header, rows);
      recordEvent?.("directory_entry_csv_exported", { directory_id: directoryId, rows_exported: entries.length });
      setCsvMsg(entries.length === 0
        ? "Directory has no entries yet — exported an empty CSV with just the headers."
        : `Exported ${entries.length} row${entries.length === 1 ? "" : "s"}.`);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setExporting(false);
    }
  }

  async function doImport(mode) {
    setErr(""); setCsvMsg("");
    if (!csvRows.length) { setErr("No rows loaded yet."); return; }

    const importJobId = `csv-import:${directoryId}`;
    const importStartedAt = new Date().toISOString();
    try {
      setImporting(true);
      setImportChoiceOpen(false);
      importJob.upsert(buildBrowserJob({ id: importJobId, kind: "csv-import", status: "running", total: csvRows.length, startedAt: importStartedAt, href: pathname }));

      // Needed to preserve `slug` on blank cells for rows that update an
      // existing entry (slug is NOT NULL + unique, and only auto-fills on
      // insert — see the slug handling below).
      const existingById = new Map((await listAllDirectoryEntries(directoryId)).map((e) => [e.id, e]));

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
      // taxonomy change and belongs in Categories, not a data import.
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

        const structuredDataTypeRaw = String(r.structured_data_type ?? "").trim();
        if (structuredDataTypeRaw && !STRUCTURED_DATA_TYPES.includes(structuredDataTypeRaw)) {
          errors.push(`Row ${rowNum}: structured_data_type must be one of ${STRUCTURED_DATA_TYPES.join(", ")}`);
          return;
        }

        const twitterCardTypeRaw = String(r.twitter_card_type ?? "").trim();
        if (twitterCardTypeRaw && !TWITTER_CARD_TYPES.includes(twitterCardTypeRaw)) {
          errors.push(`Row ${rowNum}: twitter_card_type must be one of ${TWITTER_CARD_TYPES.join(", ")}`);
          return;
        }

        const sitemapPriorityRaw = String(r.sitemap_priority ?? "").trim();
        let sitemap_priority = null;
        if (sitemapPriorityRaw) {
          const n = Number(sitemapPriorityRaw);
          if (Number.isNaN(n) || n < 0 || n > 1) {
            errors.push(`Row ${rowNum}: sitemap_priority must be a number between 0 and 1`);
            return;
          }
          sitemap_priority = n;
        }

        // slug is NOT NULL + unique per directory and only auto-fills on
        // INSERT (a DB trigger derives it from name) — so a blank cell means
        // "leave the existing entry's slug alone" on an update, not "clear
        // it". A blank cell on a new row is passed through as null so the
        // insert trigger can derive it.
        const slugRaw = String(r.slug ?? "").trim();
        const existingEntry = existingById.get(id);
        const slug = slugRaw || (existingEntry ? existingEntry.slug : null);

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
          show_phone: boolish(r.show_phone) ?? true,
          show_email: boolish(r.show_email) ?? true,
          show_website: boolish(r.show_website) ?? true,
          show_address: boolish(r.show_address) ?? true,
          slug,
          meta_title: String(r.meta_title ?? "").trim() || null,
          meta_description: String(r.meta_description ?? "").trim() || null,
          noindex: boolish(r.noindex),
          structured_data_type: structuredDataTypeRaw || null,
          sitemap_priority,
          og_title: String(r.og_title ?? "").trim() || null,
          og_description: String(r.og_description ?? "").trim() || null,
          og_image_url: String(r.og_image_url ?? "").trim() || null,
          canonical_url: String(r.canonical_url ?? "").trim() || null,
          keywords: String(r.keywords ?? "").trim() || null,
          twitter_card_type: twitterCardTypeRaw || null,
          panel_image_url: String(r.panel_image_url ?? "").trim() || null,
          panel_background_color: String(r.panel_background_color ?? "").trim() || null,
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

      // Only delete existing data once the CSV has validated cleanly — never wipe
      // entries ahead of a row-level error that would abort the import.
      if (mode === "overwrite") {
        await deleteAllDirectoryEntries(directoryId);
      }

      const upserted = await upsertDirectoryEntries(cleaned);
      for (const [entryId, termIds] of entryTermsById) {
        await setEntryTerms(entryId, termIds);
      }

      recordEvent?.("directory_entry_imported", {
        directory_id: directoryId,
        rows_imported: upserted.length,
        rows_skipped: cleaned.length - upserted.length,
        mode,
        warnings: warnings.slice(0, 20),
      });

      const modeLabel = mode === "overwrite" ? "Replaced existing entries — imported" : "Imported";
      setCsvMsg(`${modeLabel} ${upserted.length} row${upserted.length === 1 ? "" : "s"}.${warnings.length ? ` ${warnings.length} term warning(s) below.` : ""}`);
      importJob.upsert(buildBrowserJob({ id: importJobId, kind: "csv-import", status: "done", imported: upserted.length, total: csvRows.length, startedAt: importStartedAt, href: pathname }));
      setErr(warnings.length ? warnings.slice(0, 40).join("\n") : "");
      setCsvRows([]);
      setCsvPreview([]);
      setImportOpen(false);
      await refresh();
    } catch (e) {
      importJob.upsert(buildBrowserJob({ id: importJobId, kind: "csv-import", status: "failed", processed: 0, total: csvRows.length, startedAt: importStartedAt, error: e?.message ?? String(e), href: pathname }));
      setErr(e?.message ?? String(e));
    } finally {
      setImporting(false);
    }
  }

  // Stable close handlers: Dialog re-runs its focus effect whenever onClose changes identity.
  const closeDelete = useCallback(() => setDeleteTarget(null), []);
  const closeImportChoice = useCallback(() => { if (!importing) setImportChoiceOpen(false); }, [importing]);
  const closeBulkTag = useCallback(() => setBulkTagOpen(false), []);

  const columns = [
    { key: "name", label: "Name", render: (entry) => entry.name },
    { key: "group", label: "Group", render: (entry) => groupNameById.get(entry.directory_group_id) || "—" },
    { key: "address", label: "Address", render: (entry) => entry.address || "—" },
    {
      key: "pin",
      label: "Pin",
      render: (entry) => (entry.lat != null && entry.lng != null
        ? <Pill tone="live">On map</Pill>
        : <Pill tone="warn">No pin</Pill>),
    },
    {
      key: "status",
      label: "Status",
      render: (entry) => <Pill tone={entry.is_active ? "ok" : "neutral"}>{entry.is_active ? "Active" : "Hidden"}</Pill>,
    },
  ];

  const moreActions = [
    { label: exporting ? "Exporting…" : "Export CSV", onSelect: exportEntriesCsv, disabled: exporting },
    { label: "Download CSV template", onSelect: downloadTemplate },
    { label: importOpen ? "Cancel import" : "Import CSV", onSelect: () => setImportOpen((v) => !v) },
    { label: geocoding ? "Geocoding…" : "Geocode missing coords", onSelect: handleGeocodeMissing, disabled: geocoding },
  ];

  const head = {
    title: "Entries",
    subtitle: `${count} ${count === 1 ? "entry" : "entries"} in this directory`,
    actions: canEdit ? (
      <>
        <OverflowMenu label="More entry actions" items={moreActions} />
        <Button variant="primary" icon={<PlusIcon />} onClick={goToCreate}>Add entry</Button>
      </>
    ) : null,
  };

  const summary = importing ? (
    <KeepOpenBanner title={`Importing ${csvRows.length} ${csvRows.length === 1 ? "row" : "rows"}`} detail="Importing runs in your browser and stops if you leave." />
  ) : importJob.job ? (
    <JobCard job={importJob.job} onDismiss={importJob.dismiss} />
  ) : null;

  return (
    <PageLayout head={head} summary={summary}>
      <div className="entries-stack">
        {geocodeMsg && <Callout tone="ok">{geocodeMsg}</Callout>}
        {(exporting || geocoding) && <Callout tone="info">{exporting ? "Exporting entries…" : "Geocoding entries…"}</Callout>}

        <Toolbar>
          <Field label="Search" className="entries-search">
            <TextInput
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name or address…"
            />
          </Field>
          <Field label="Show" className="entries-filter">
            <Select value={gap} onChange={(e) => setGap(e.target.value)}>
              <option value="">All entries</option>
              <option value="no_logo">Gap: no logo</option>
              <option value="no_content">Gap: no page content</option>
              <option value="no_seo">Gap: no SEO metadata</option>
              <option value="not_geocoded">Gap: not geocoded</option>
            </Select>
          </Field>
          {categorisations.length > 0 && (
            <Field label="Category" className="entries-filter">
              <Select value={categoryTermId} onChange={(e) => setCategoryTermId(e.target.value)}>
                <option value="">All categories</option>
                {categorisations.map((cat) => (
                  <optgroup key={cat.id} label={cat.label}>
                    {(cat.terms ?? []).map((term) => (
                      <option key={term.id} value={term.id}>{term.label}</option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </Field>
          )}
        </Toolbar>

        {canEdit && importOpen && (
          <Section
            title="Import entries from CSV"
            description={(
              <>
                You'll be asked whether to replace all existing entries or add to them. Either way, rows with an <code>id</code> matching an existing entry update it in place — they don't create duplicates. Rows without an <code>id</code> (or with one that doesn't match) are created as new entries.
              </>
            )}
          >
            <Field label="CSV file" error={csvFileErr || undefined}>
              <TextInput type="file" accept=".csv" className="csv-file" onChange={(e) => onPickCsvFile(e.target.files?.[0])} />
            </Field>
            {csvMsg && <Callout tone="ok">{csvMsg}</Callout>}

            {csvPreview.length > 0 && (
              <>
                <div className="table-wrap">
                  <table className="table csv-preview-table">
                    <caption className="sr-only">First rows of the CSV file</caption>
                    <thead>
                      <tr>
                        {["name", "postcode", "country", "lat", "lng", "group_name"].map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreview.map((r, i) => (
                        <tr key={i}>
                          <td>{r.name}</td>
                          <td>{r.postcode}</td>
                          <td>{r.country}</td>
                          <td>{r.lat || "—"}</td>
                          <td>{r.lng || "—"}</td>
                          <td>{r.group_name || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <Button variant="primary" onClick={() => setImportChoiceOpen(true)} loading={importing} loadingLabel="Importing…">
                    {`Import ${csvRows.length} row${csvRows.length === 1 ? "" : "s"}`}
                  </Button>
                </div>
              </>
            )}
          </Section>
        )}

        {canEdit && selectedIds.size > 0 && (
          <BulkBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
            <Button size="sm" onClick={() => bulkArchive(false)} disabled={bulkBusy} loading={bulkBusy} loadingLabel="Archiving…">Archive</Button>
            <Button size="sm" onClick={() => bulkArchive(true)} disabled={bulkBusy} loading={bulkBusy} loadingLabel="Restoring…">Restore</Button>
            {clientId && (
              <Button size="sm" onClick={() => setBulkTagOpen(true)} disabled={bulkBusy}>Bulk tag…</Button>
            )}
          </BulkBar>
        )}

        {err && <Callout tone="danger"><pre className="entries-pre">{err}</pre></Callout>}

        <DataTable
          caption="Directory entries"
          columns={columns}
          rows={rows}
          loading={loading}
          getRowId={(entry) => entry.id}
          getRowLabel={(entry) => entry.name || "entry"}
          rowLink={canEdit ? (entry) => `${directoryBasePath}/entries/${encodeURIComponent(entry.id)}` : undefined}
          selectable={canEdit}
          selected={[...selectedIds]}
          onSelectedChange={(ids) => setSelectedIds(new Set(ids))}
          rowMenu={canEdit ? (entry) => [
            { label: "Edit", onSelect: () => navigate(`${directoryBasePath}/entries/${encodeURIComponent(entry.id)}`) },
            { label: "Delete", danger: true, onSelect: () => { setDeleteTarget(entry); setDeleteText(""); } },
          ] : undefined}
          empty={search ? (
            <EmptyState art="searching" title="No entries match your search" body="Try a different name or address." />
          ) : (
            <EmptyState
              art="welcome"
              title="No entries yet"
              body="Add an entry, or import a CSV file."
              actions={(
                <>
                  {canEdit ? <Button variant="primary" icon={<PlusIcon />} onClick={goToCreate}>Add entry</Button> : null}
                  <AskPipLink question="What columns does my import file need?" context="Entries" trigger="empty_state" />
                </>
              )}
            />
          )}
          pagination={{ page: page + 1, pageSize: ENTRIES_PAGE_SIZE, total: count, onPage: (p) => setPage(p - 1) }}
        />
      </div>

      {deleteTarget && (
        <Dialog
          title={`Delete "${deleteTarget.name}" permanently?`}
          onClose={closeDelete}
          footer={(
            <>
              <Button onClick={closeDelete} disabled={deleting}>Cancel</Button>
              <Button variant="danger-solid" onClick={confirmDelete} loading={deleting} loadingLabel="Deleting…" disabled={deleteText !== "DELETE"}>
                Delete permanently
              </Button>
            </>
          )}
        >
          <p className="dialog-note">This removes the entry and its category tags. This can't be undone.</p>
          <Field label="Type DELETE to confirm">
            <TextInput data-autofocus value={deleteText} onChange={(e) => setDeleteText(e.target.value)} placeholder="DELETE" />
          </Field>
        </Dialog>
      )}

      {importChoiceOpen && (
        <Dialog
          title="How should this data be added?"
          onClose={closeImportChoice}
          footer={(
            <>
              <Button onClick={() => setImportChoiceOpen(false)} disabled={importing}>Cancel</Button>
              <Button onClick={() => doImport("append")} disabled={importing}>
                {importing ? "Importing…" : "Add to existing entries"}
              </Button>
              <Button variant="danger-solid" onClick={() => doImport("overwrite")} disabled={importing}>
                {importing ? "Importing…" : "Replace all existing entries"}
              </Button>
            </>
          )}
        >
          <p className="dialog-note">
            This directory has {count} existing {count === 1 ? "entry" : "entries"}. Choose whether to replace them or add to them.
            Either way, rows in the CSV with an <code>id</code> matching an existing entry update it rather than creating a duplicate.
          </p>
        </Dialog>
      )}

      {bulkTagOpen && (
        <BulkCategoryEditModal
          categorisations={categorisations}
          entryIds={[...selectedIds]}
          directoryId={directoryId}
          recordEvent={recordEvent}
          onClose={closeBulkTag}
          onApplied={() => setSelectedIds(new Set())}
        />
      )}
    </PageLayout>
  );
}

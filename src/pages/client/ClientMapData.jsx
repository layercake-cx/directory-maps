import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase, invokeFunction } from "../../lib/supabase";
import BulkFilterEditModal from "../../components/BulkFilterEditModal.jsx";
import { loadFilterFields, filterColumnName, buildImportFilterValueRows, applyImportedFilterValues, ensureImportOptions, isSelectType } from "../../lib/filterFields.js";
import { listAttachedCategorisations, categoryColumnName, resolveImportedListingTerms, applyImportedListingTerms } from "../../lib/categorisations.js";
import { recordAdminEvent } from "../../lib/adminEvents.js";
import { sanitizeSvgFile } from "../../lib/sanitizeSvg.js";
import { formatSheetSyncResult } from "../../lib/sheetSyncMessages.js";
import { logClientError } from "../../lib/errorLogger.js";
import { openGoogleDrivePicker, preloadGoogleDrivePicker } from "../../lib/googleDrivePicker.js";
import SyncHistoryTable from "../../components/SyncHistoryTable.jsx";
import MapDataTabs from "../../components/MapDataTabs.jsx";
import { JobCard, KeepOpenBanner, useLocalJob, buildSheetSyncJob, buildBrowserJob } from "../../components/jobs/index.js";
import {
  Button, Callout, Checkbox, Dialog, EmptyState, Field, PageLayout, Pill, PlusIcon, Section, Skeleton, TextInput, Toolbar, BulkBar, DataTable,
  Select, useConfirm, useUnsavedGuard,
} from "../../components/ui/index.js";
import CsvPreviewTable from "../../components/mapData/CsvPreviewTable.jsx";
import DriveSyncCards from "../../components/mapData/DriveSyncCards.jsx";
import ListingLogoTable from "../../components/mapData/ListingLogoTable.jsx";
import ManualListingDialog from "../../components/mapData/ManualListingDialog.jsx";
import SourcePill from "../../components/mapData/SourcePill.jsx";
import { parseSchedule, buildScheduleValue } from "../../components/mapData/schedule.js";
import "../../styles/wave-b/map-data.css";
import { listDirectories, getMapDirectoryAssociation, attachDirectoryToMap, detachDirectoryFromMap, createDirectoryFromMap } from "../../lib/directories.js";

const PAGE_SIZE = 100;

const MANUAL_FORM_EMPTY = {
  name: "", address: "", group_id: "", lat: "", lng: "",
  website_url: "", email: "", phone: "", logo_url: "", is_active: true,
};

// ─── CSV helpers ─────────────────────────────────────────────────────────────

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

// ─── Geocoding ───────────────────────────────────────────────────────────────

async function geocodeViaServer(supabaseClient, address) {
  try {
    const { data, error } = await supabaseClient.functions.invoke("geocode_address", { body: { address } });
    if (error) {
      const reason = error?.message || error?.context?.status || String(error);
      return { ok: false, status: `ERROR:${reason}`, lat: null, lng: null };
    }
    return { ok: !!data?.ok, status: data?.status || "ERROR", lat: data?.lat ?? null, lng: data?.lng ?? null };
  } catch (e) {
    return { ok: false, status: `ERROR:${e?.message ?? String(e)}`, lat: null, lng: null };
  }
}

// ─── Stable hash ID for integration-sourced rows ─────────────────────────────

async function stableListingId(mapIdValue, listingName) {
  const data = new TextEncoder().encode(`${mapIdValue}:${String(listingName || "").trim().toLowerCase()}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ClientMapData() {
  const { mapId } = useParams();
  const navigate = useNavigate();

  // ── Data ──────────────────────────────────────────────────────────────────
  const [map, setMap] = useState(null);
  const [clientId, setClientId] = useState(null);
  const [groups, setGroups] = useState([]);
  const [listings, setListings] = useState([]);

  // ── Integration / Drive ───────────────────────────────────────────────────
  const [sheetStatus, setSheetStatus] = useState(null);
  const [sheetMsg, setSheetMsg] = useState("");
  const [sheetErr, setSheetErr] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [openingPicker, setOpeningPicker] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncSchedule, setSyncSchedule] = useState(null);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [integrationLinked, setIntegrationLinked] = useState(false);

  // ── Directory datasource (DIR-E4-S2) ──────────────────────────────────────
  const [directoryAssoc, setDirectoryAssoc] = useState(null);
  const [clientDirectories, setClientDirectories] = useState([]);
  const [directoriesLoading, setDirectoriesLoading] = useState(false);
  const [directoriesFetched, setDirectoriesFetched] = useState(false);
  const [directoriesError, setDirectoriesError] = useState("");
  const [selectedDirectoryId, setSelectedDirectoryId] = useState("");
  const [attachingDirectory, setAttachingDirectory] = useState(false);
  const [detachingDirectory, setDetachingDirectory] = useState(false);
  const [buildingDirectory, setBuildingDirectory] = useState(false);

  // ── CSV tab ───────────────────────────────────────────────────────────────
  const [fileErr, setFileErr] = useState("");
  const [rows, setRows] = useState([]);
  const [preview, setPreview] = useState([]);
  const [geocodeMissing, setGeocodeMissing] = useState(true);
  const [importing, setImporting] = useState(false);
  // Processing pattern: Sheets sync is a JobCard; CSV import runs in the browser, so it gets a KeepOpenBanner and a leave guard.
  const { pathname } = useLocation();
  const confirm = useConfirm();
  const sheetJob = useLocalJob(`sheet-sync:${mapId}`);
  const importJob = useLocalJob(`csv-import:${mapId}`);
  useUnsavedGuard(importing);
  const [importChoiceOverlayOpen, setImportChoiceOverlayOpen] = useState(false);

  // ── Manual CRUD ───────────────────────────────────────────────────────────
  const [manualModal, setManualModal] = useState(null); // null | "new" | "edit"
  const [editingListing, setEditingListing] = useState(null);
  const [manualForm, setManualForm] = useState(MANUAL_FORM_EMPTY);
  const [savingManual, setSavingManual] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [manualErr, setManualErr] = useState("");
  const [logoUploadingId, setLogoUploadingId] = useState(null);
  const [geocodingAddress, setGeocodingAddress] = useState(false);
  const manualAddressBaselineRef = useRef("");
  const filterEditorRef = useRef(null);
  const [filterFields, setFilterFields] = useState([]);
  const [categorisations, setCategorisations] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!mapId) return;
    loadFilterFields(mapId, { includeArchived: false })
      .then((f) => { if (alive) setFilterFields(f); })
      .catch(() => {});
    return () => { alive = false; };
  }, [mapId]);

  // Categories attached to this map (categorisation_attachments), used
  // for CSV import's category_<key> columns.
  useEffect(() => {
    let alive = true;
    if (!mapId) return;
    listAttachedCategorisations("map", mapId)
      .then((cats) => { if (alive) setCategorisations(cats); })
      .catch(() => {});
    return () => { alive = false; };
  }, [mapId]);

  const hasSelectFilterFields = filterFields.some((f) => f.is_active && isSelectType(f.field_type));
  const [addGroupModal, setAddGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);

  // ── General UI ────────────────────────────────────────────────────────────
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState("ok"); // "ok" | "warn": import messages that carry warnings render as a warning Callout
  const [err, setErr] = useState("");
  const [clearing, setClearing] = useState(false);
  const [activeTab, setActiveTab] = useState(null); // null until load resolves mode
  const [justDisconnected, setJustDisconnected] = useState(false);
  const [dataSearch, setDataSearch] = useState("");
  const [dataPage, setDataPage] = useState(0);

  // ── Overwrite confirmation ────────────────────────────────────────────────
  const [confirmOverwrite, setConfirmOverwrite] = useState(null); // null | "connect-integration"

  // ── Ingestion source map (for legacy rows without source column) ───────────
  const [ingestionMethodMap, setIngestionMethodMap] = useState(new Map());

  // ── Sync history ──────────────────────────────────────────────────────────
  const [syncLogCount, setSyncLogCount] = useState(0);

  // ── Data fetching ─────────────────────────────────────────────────────────

  async function fetchListings() {
    const { data, error } = await supabase
      .from("listings")
      .select("id,name,address,postcode,country,lat,lng,website_url,email,phone,group_id,logo_bg,logo_url,source,is_active")
      .eq("map_id", mapId)
      .order("name", { ascending: true });
    if (error) {
      // Graceful fallback if source column doesn't exist yet
      if (String(error.message || "").includes("source")) {
        const fallback = await supabase
          .from("listings")
          .select("id,name,address,postcode,country,lat,lng,website_url,email,phone,group_id,logo_bg,logo_url,is_active")
          .eq("map_id", mapId)
          .order("name", { ascending: true });
        if (fallback.error) throw fallback.error;
        return (fallback.data ?? []).map((r) => ({ ...r, source: null }));
      }
      // logo_bg fallback
      if (String(error.message || "").includes("logo_bg")) {
        const fallback = await supabase
          .from("listings")
          .select("id,name,address,postcode,country,lat,lng,website_url,email,phone,group_id,logo_url,is_active")
          .eq("map_id", mapId)
          .order("name", { ascending: true });
        if (fallback.error) throw fallback.error;
        return (fallback.data ?? []).map((r) => ({ ...r, logo_bg: null, source: null }));
      }
      throw error;
    }
    return data ?? [];
  }

  useEffect(() => {
    (async () => {
      try {
        const [{ data: m }, { data: g }, { data: ds }, l, { count }, assoc] = await Promise.all([
          supabase.from("maps").select("id,name,client_id").eq("id", mapId).single(),
          supabase.from("groups").select("id,name").eq("map_id", mapId).order("sort_order", { ascending: true }),
          supabase.from("map_data_sources").select("id").eq("map_id", mapId).eq("provider", "google_sheets").eq("enabled", true).limit(1),
          fetchListings(),
          supabase.from("sync_logs").select("id", { count: "exact", head: true }).eq("map_id", mapId),
          getMapDirectoryAssociation(mapId),
        ]);
        setMap(m ?? null);
        setClientId(m?.client_id ?? null);
        setGroups(g ?? []);
        const linked = (ds?.length ?? 0) > 0;
        setIntegrationLinked(linked);
        setActiveTab(linked ? "drive" : "branding");
        setListings(l ?? []);
        setSyncLogCount(count ?? 0);
        setDirectoryAssoc(assoc);
      } catch (e) {
        setErr(e?.message ?? String(e));
      }
    })();
  }, [mapId]);

  // Build ingestion source for legacy rows (no source column value)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out = new Map();
      await Promise.all(
        (listings || []).map(async (listing) => {
          if (listing.source) { out.set(listing.id, listing.source); return; }
          // Legacy inference
          let method = "manual";
          try {
            if (integrationLinked) {
              const expected = await stableListingId(mapId, listing.name || "");
              if (expected === listing.id) method = "integration";
            }
            if (
              method === "manual" &&
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(listing.id || ""))
            ) {
              method = "csv";
            }
          } catch { method = "manual"; }
          out.set(listing.id, method);
        })
      );
      if (!cancelled) setIngestionMethodMap(out);
    })();
    return () => { cancelled = true; };
  }, [listings, integrationLinked, mapId]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const groupNameById = useMemo(() => {
    const m = new Map();
    (groups || []).forEach((g) => m.set(g.id, g.name || "—"));
    return m;
  }, [groups]);

  const filteredListings = useMemo(
    () => (listings || []).filter((l) =>
      !dataSearch.trim() ||
      l.name?.toLowerCase().includes(dataSearch.toLowerCase()) ||
      l.address?.toLowerCase().includes(dataSearch.toLowerCase())
    ),
    [listings, dataSearch]
  );
  const totalPages = Math.ceil(filteredListings.length / PAGE_SIZE);
  const pageListings = useMemo(
    () => filteredListings.slice(dataPage * PAGE_SIZE, (dataPage + 1) * PAGE_SIZE),
    [filteredListings, dataPage]
  );
  const totalFilteredListings = filteredListings.length;

  useEffect(() => {
    const maxPage = totalPages > 0 ? totalPages - 1 : 0;
    if (dataPage > maxPage) setDataPage(maxPage);
  }, [dataPage, totalPages]);

  const { freq: schedFreq, time: schedTime } = parseSchedule(syncSchedule);

  // ── Integration functions ─────────────────────────────────────────────────

  async function refreshSheetStatus() {
    try {
      setSheetErr("");
      const [statusRes, srcRes] = await Promise.all([
        invokeFunction("validate_sheet_source", { body: { mapId } }),
        supabase.from("map_data_sources").select("sync_schedule").eq("map_id", mapId).eq("provider", "google_sheets").maybeSingle(),
      ]);
      if (statusRes.error) {
        const body = await statusRes.error.context?.json?.().catch(() => null);
        throw new Error(body?.error ?? body?.message ?? statusRes.error.message);
      }
      setSheetStatus(statusRes.data ?? null);
      setSyncSchedule(srcRes.data?.sync_schedule ?? null);
    } catch (e) {
      setSheetErr(e?.message ?? String(e));
      setSheetStatus((prev) => prev ?? { connected: false });
      logClientError({ type: "google_sync", message: e?.message ?? String(e), context: { map_id: mapId, fn: "refreshSheetStatus" } });
    }
  }

  useEffect(() => { refreshSheetStatus().catch(() => {}); }, [mapId]);
  useEffect(() => { preloadGoogleDrivePicker(); }, []);

  async function saveSchedule(freq, time) {
    try {
      setSavingSchedule(true);
      const value = buildScheduleValue(freq, time);
      const { error } = await supabase
        .from("map_data_sources")
        .update({ sync_schedule: value, updated_at: new Date().toISOString() })
        .eq("map_id", mapId)
        .eq("provider", "google_sheets");
      if (error) throw error;
      setSyncSchedule(value);
    } catch (e) {
      setSheetErr(e?.message ?? String(e));
    } finally {
      setSavingSchedule(false);
    }
  }

  async function disconnectGoogle() {
    try {
      setConnecting(true); setSheetErr("");
      const { error } = await supabase.from("map_data_sources").delete().eq("map_id", mapId).eq("provider", "google_sheets");
      if (error) throw error;
      setSheetStatus(null); setSheetMsg("");
      setIntegrationLinked(false);
      setActiveTab("branding");
      setJustDisconnected(true);
    } catch (e) {
      setSheetErr(e?.message ?? String(e));
    } finally {
      setConnecting(false);
    }
  }

  async function syncNow() {
    const jobId = `sheet-sync:${mapId}`;
    const jobStartedAt = new Date().toISOString();
    try {
      setSyncing(true); setSheetErr(""); setSheetMsg("");
      sheetJob.upsert(buildSheetSyncJob({ id: jobId, status: "running", sheetName: sheetStatus?.sheet?.sheet_name, startedAt: jobStartedAt, href: pathname }));
      const { data, error } = await invokeFunction("sync_sheet_listings", { body: { mapId } });
      if (error) {
        const body = await error.context?.json?.().catch(() => null);
        throw new Error(body?.error ?? body?.message ?? error.message);
      }
      const formatted = formatSheetSyncResult(data, mapId);
      if (formatted.type === "error") throw new Error(formatted.message);
      if (formatted.type === "warning") { setSheetErr(formatted.message); setSheetMsg(""); }
      else { setSheetErr(""); setSheetMsg(""); }
      sheetJob.upsert(buildSheetSyncJob({ id: jobId, status: "done", startedAt: jobStartedAt, counts: { rows: formatted.rows }, href: pathname }));
      const l = await fetchListings();
      setListings(l ?? []);
      await refreshSheetStatus();
    } catch (e) {
      sheetJob.upsert(buildSheetSyncJob({ id: jobId, status: "failed", startedAt: jobStartedAt, error: e?.message ?? String(e), href: pathname }));
      setSheetErr(e?.message ?? String(e));
      logClientError({ type: "google_sync", message: e?.message ?? String(e), context: { map_id: mapId, fn: "syncNow" } });
    } finally {
      setSyncing(false);
    }
  }

  async function openDrivePicker() {
    try {
      setOpeningPicker(true); setSheetErr("");
      await openGoogleDrivePicker({
        mapId,
        onPicked: (fileId, mimeType, fileName) => selectSheet(fileId, mimeType, fileName),
      });
    } catch (e) {
      setSheetErr(e?.message ?? String(e));
    } finally {
      setOpeningPicker(false);
    }
  }

  async function connectGoogle() {
    try {
      setConnecting(true); setSheetErr(""); setSheetMsg("");
      const returnTo = window.location.href;
      const { data, error } = await invokeFunction("google_oauth_start", { body: { mapId, returnTo } });
      if (data?.error) throw new Error(data.error);
      if (error) {
        const body = await error.context?.json?.().catch(() => null);
        throw new Error(body?.error ?? body?.message ?? error.message);
      }
      if (!data?.authUrl) throw new Error("Missing authUrl");
      window.location.assign(data.authUrl);
    } catch (e) {
      setSheetErr(e?.message ?? String(e));
      logClientError({ type: "google_oauth", message: e?.message ?? String(e), context: { map_id: mapId, fn: "connectGoogle" } });
    } finally {
      setConnecting(false);
    }
  }

  async function selectSheet(spreadsheetId, mimeType, fileName) {
    try {
      setConfiguring(true); setSheetErr(""); setSheetMsg("");
      const { data, error } = await invokeFunction("google_set_sheet_file", { body: { mapId, spreadsheetId, mimeType, fileName } });
      if (data?.error) throw new Error(data.error);
      if (error) {
        const body = await error.context?.json?.().catch(() => null);
        throw new Error(body?.error ?? body?.message ?? error.message);
      }
      setSheetMsg(data.sheetName ? `Connected: ${data.sheetName}` : "File connected");
      await refreshSheetStatus();
    } catch (e) {
      setSheetErr(e?.message ?? String(e));
    } finally {
      setConfiguring(false);
    }
  }

  // ── CSV functions ─────────────────────────────────────────────────────────

  async function onPickFile(file) {
    setFileErr(""); setErr(""); setMsg(""); setMsgTone("ok"); setRows([]); setPreview([]);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) { setFileErr("Upload CSV only (export from Excel as CSV)."); return; }
    const text = await file.text();
    const raw = parseCSV(text);
    if (raw.length < 2) { setFileErr("CSV looks empty."); return; }
    const headers = raw[0].map((h) => String(h).trim().toLowerCase());
    if (!headers.includes("name")) { setFileErr("Missing required column: name"); return; }
    const objs = raw.slice(1).map((row) => {
      const o = {};
      headers.forEach((h, idx) => { o[h] = row[idx] ?? ""; });
      return o;
    });
    setRows(objs);
    setPreview(objs.slice(0, 20));
    setMsg(`${objs.length} rows ready to import.`);
  }

  function downloadTemplate() {
    const baseHeader = ["id","name","address","postcode","country","lat","lng","website_url","email","phone","logo_url","notes_html","allow_html","group_name","is_active"];
    const baseSample = ["","Example Supplier Ltd","1 Example Street","SW1A 1AA","UK","","","https://example.com","hello@example.com","","","","false","","true"];
    // Append one column per active filter field. Multi-select cells accept a pipe-delimited list.
    const activeFields = filterFields.filter((f) => f.is_active);
    const filterCols = activeFields.map((f) => filterColumnName(f.key));
    const filterSample = activeFields.map((f) => {
      if (f.field_type === "text") return "";
      const first = (f.options || [])[0]?.value || "";
      if (f.field_type === "multi_select") {
        const second = (f.options || [])[1]?.value || "";
        return [first, second].filter(Boolean).join("|");
      }
      return first;
    });
    // Append one column per categorisation attached to this map, same pipe-delimited convention.
    const catCols = categorisations.map((c) => categoryColumnName(c.key));
    const catSample = categorisations.map((c) => (c.terms || []).slice(0, 1).map((t) => t.slug).join("|"));
    const header = [...baseHeader, ...filterCols, ...catCols];
    const sample = [[...baseSample, ...filterSample, ...catSample]];
    const toCSV = (arr) => arr.map((row) => row.map((cell) => { const s = String(cell ?? ""); return (s.includes('"') || s.includes(",") || s.includes("\n")) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\n");
    const blob = new Blob([toCSV([header, ...sample])], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "listings-template.csv"; a.click();
    URL.revokeObjectURL(a.href);
  }

  function getGroupLabel(r) {
    return String(r.group_name ?? r.group ?? r.category ?? r["group name"] ?? "").trim();
  }

  async function doImport(mode) {
    setErr(""); setMsg(""); setMsgTone("ok");
    if (!rows.length) { setErr("No rows loaded yet."); return; }

    const distinctGroups = new Map();
    for (const r of rows) {
      const label = getGroupLabel(r);
      if (!label) continue;
      const key = label.toLowerCase();
      if (!distinctGroups.has(key)) distinctGroups.set(key, label);
    }

    const { data: existingGroups } = await supabase.from("groups").select("id,name").eq("map_id", mapId).order("sort_order", { ascending: true });
    const lookup = new Map();
    (existingGroups ?? []).forEach((g) => lookup.set((g.name || "").trim().toLowerCase(), g.id));

    const toCreate = [];
    let sortOrder = existingGroups?.length ?? 0;
    for (const [key, displayName] of distinctGroups) {
      if (lookup.has(key)) continue;
      const id = crypto.randomUUID();
      toCreate.push({ id, map_id: mapId, name: displayName, sort_order: sortOrder++ });
      lookup.set(key, id);
    }
    if (toCreate.length) {
      const { error: createErr } = await supabase.from("groups").insert(toCreate);
      if (createErr) { setErr(createErr.message ?? String(createErr)); return; }
    }

    const cleaned = [];
    const errors = [];
    rows.forEach((r, idx) => {
      const rowNum = idx + 2;
      const name = String(r.name ?? "").trim();
      if (!name) errors.push(`Row ${rowNum}: name is required`);
      const id = String(r.id ?? "").trim() || crypto.randomUUID();
      const lat = String(r.lat ?? r.latitude ?? "").trim();
      const lng = String(r.lng ?? r.longitude ?? r.long ?? "").trim();
      const latNum = lat === "" ? null : Number(lat);
      const lngNum = lng === "" ? null : Number(lng);
      if (latNum !== null && isNaN(latNum)) errors.push(`Row ${rowNum}: lat is not a valid number`);
      else if (lngNum !== null && isNaN(lngNum)) errors.push(`Row ${rowNum}: lng is not a valid number`);
      else if ((latNum === null) !== (lngNum === null)) errors.push(`Row ${rowNum}: provide both lat and lng, or leave both blank`);
      const groupKey = getGroupLabel(r).toLowerCase();
      const group_id = groupKey ? lookup.get(groupKey) ?? null : null;
      cleaned.push({
        id, map_id: mapId, name,
        address: String(r.address ?? "").trim() || null,
        postcode: String(r.postcode ?? "").trim() || null,
        country: String(r.country ?? "").trim() || null,
        lat: latNum, lng: lngNum,
        website_url: String(r.website_url ?? "").trim() || null,
        email: String(r.email ?? "").trim() || null,
        phone: String(r.phone ?? "").trim() || null,
        logo_url: String(r.logo_url ?? "").trim() || null,
        notes_html: String(r.notes_html ?? "").trim() || null,
        allow_html: boolish(r.allow_html) ?? false,
        group_id,
        is_active: boolish(r.is_active) ?? true,
        source: "csv",
      });
    });

    if (errors.length) {
      setErr(errors.slice(0, 40).join("\n") + (errors.length > 40 ? `\n… +${errors.length - 40} more` : ""));
      return;
    }

    const importJobId = `csv-import:${mapId}`;
    let importStartedAt = null;
    try {
      setImporting(true); setImportChoiceOverlayOpen(false);
      importStartedAt = new Date().toISOString();
      importJob.upsert(buildBrowserJob({ id: importJobId, kind: "csv-import", status: "running", total: cleaned.length, startedAt: importStartedAt, href: pathname }));
      if (mode === "overwrite") {
        const { error: delErr } = await supabase.from("listings").delete().eq("map_id", mapId);
        if (delErr) throw new Error(`Delete existing failed: ${delErr.message}`);
        // Disconnect any integration when overwriting with CSV
        if (integrationLinked) {
          await supabase.from("map_data_sources").delete().eq("map_id", mapId).eq("provider", "google_sheets");
          setIntegrationLinked(false); setSheetStatus(null);
        }
      }

      const UPSERT_KEYS = ["id","map_id","group_id","name","address","postcode","country","city","lat","lng","is_active","website_url","email","phone","logo_url","notes_html","allow_html","geocode_status","geocoded_at","source"];
      const toUpsert = cleaned.map((row) => {
        const out = {};
        for (const key of UPSERT_KEYS) { if (Object.prototype.hasOwnProperty.call(row, key)) out[key] = row[key]; }
        return out;
      });

      const { data, error, status } = await supabase.from("listings").upsert(toUpsert, { onConflict: "id" }).select("id");
      if (error) throw new Error(`Upsert failed (${status}): ${error.message}`);

      const importCount = data?.length ?? cleaned.length;

      // Resolve filter_<key> columns into listing_filter_values.
      let filterWarnings = [];
      let filterCreatedSuffix = "";
      if (filterFields.some((f) => f.is_active)) {
        const listingIds = cleaned.map((c) => c.id);
        // Auto-create any option values that don't exist yet, then resolve.
        let fieldsForImport = filterFields;
        try {
          const { fields: augmented, created } = await ensureImportOptions({ rows, fields: filterFields });
          fieldsForImport = augmented;
          if (created.length) {
            setFilterFields(augmented);
            filterCreatedSuffix = ` Added ${created.length} new filter option${created.length === 1 ? "" : "s"}.`;
          }
        } catch (optErr) {
          filterWarnings = [...filterWarnings, `New filter options could not be created: ${optErr?.message ?? optErr}`];
        }
        const { valueRows, warnings } = buildImportFilterValueRows({ rows, listingIds, fields: fieldsForImport });
        filterWarnings = [...filterWarnings, ...warnings];
        try {
          await applyImportedFilterValues({ listingIds, fields: fieldsForImport, valueRows });
        } catch (fvErr) {
          filterWarnings = [...filterWarnings, `Filter values could not be saved: ${fvErr?.message ?? fvErr}`];
        }
      }
      // Resolve category_<key> columns against categorisations attached to this map.
      let categoryWarnings = [];
      if (categorisations.length > 0) {
        const listingIds = cleaned.map((c) => c.id);
        const { termsByListing, warnings } = resolveImportedListingTerms({ rows, listingIds, categorisations });
        categoryWarnings = warnings;
        try {
          await applyImportedListingTerms(termsByListing);
        } catch (ctErr) {
          categoryWarnings = [...categoryWarnings, `Category tags could not be saved: ${ctErr?.message ?? ctErr}`];
        }
      }
      const filterWarnSuffix = (filterCreatedSuffix ? filterCreatedSuffix : "") + (filterWarnings.length
        ? ` ${filterWarnings.length} filter value issue${filterWarnings.length === 1 ? "" : "s"}: ${filterWarnings.slice(0, 5).join("; ")}${filterWarnings.length > 5 ? "…" : ""}`
        : "") + (categoryWarnings.length
        ? ` ${categoryWarnings.length} category issue${categoryWarnings.length === 1 ? "" : "s"}: ${categoryWarnings.slice(0, 5).join("; ")}${categoryWarnings.length > 5 ? "…" : ""}`
        : "");
      const hasImportWarnings = filterWarnings.length > 0 || categoryWarnings.length > 0;
      if (geocodeMissing) {
        const { data: geoData, error: geoErr } = await invokeFunction("geocode_listings", { body: { mapId } });
        if (geoErr || geoData?.error) { setMsgTone("warn"); setMsg(`Imported ${importCount} rows. Geocoding could not be started: ${geoData?.error ?? geoErr?.message}${filterWarnSuffix}`); }
        else { setMsgTone(hasImportWarnings ? "warn" : "ok"); setMsg(`Imported ${importCount} rows. Geocoding ${geoData?.queued ?? 0} addresses in the background — pins will appear shortly.${filterWarnSuffix}`); }
      } else {
        setMsgTone(hasImportWarnings ? "warn" : "ok");
        setMsg(`Imported ${importCount} rows.${filterWarnSuffix}`);
      }
      importJob.upsert(buildBrowserJob({ id: importJobId, kind: "csv-import", status: "done", imported: importCount, total: cleaned.length, startedAt: importStartedAt, href: pathname }));
      const [{ data: g }, l] = await Promise.all([
        supabase.from("groups").select("id,name").eq("map_id", mapId).order("sort_order", { ascending: true }),
        fetchListings(),
      ]);
      setGroups(g ?? []); setListings(l ?? []);
    } catch (e) {
      if (importStartedAt) importJob.upsert(buildBrowserJob({ id: importJobId, kind: "csv-import", status: "failed", processed: 0, total: cleaned?.length, startedAt: importStartedAt, error: e?.message ?? String(e), href: pathname }));
      setErr(e?.message ?? String(e));
    } finally {
      setImporting(false);
    }
  }

  // ── Manual CRUD ───────────────────────────────────────────────────────────

  function openNewManual() {
    setManualForm(MANUAL_FORM_EMPTY);
    setEditingListing(null);
    setManualErr("");
    manualAddressBaselineRef.current = "";
    setManualModal("new");
  }

  function openEditManual(listing) {
    setManualForm({
      name: listing.name || "",
      address: listing.address || "",
      group_id: listing.group_id || "",
      lat: listing.lat != null ? String(listing.lat) : "",
      lng: listing.lng != null ? String(listing.lng) : "",
      website_url: listing.website_url || "",
      email: listing.email || "",
      phone: listing.phone || "",
      logo_url: listing.logo_url || "",
      is_active: listing.is_active !== false,
    });
    setEditingListing(listing);
    setManualErr("");
    manualAddressBaselineRef.current = (listing.address || "").trim();
    setManualModal("edit");
  }

  function closeManual() { setManualModal(null); setEditingListing(null); setManualErr(""); setGeocodingAddress(false); }

  async function geocodeManualAddress(address, { force = false } = {}) {
    const trimmed = (address || "").trim();
    if (!trimmed) {
      setManualForm((prev) => ({ ...prev, lat: "", lng: "" }));
      manualAddressBaselineRef.current = "";
      return { ok: true, lat: null, lng: null, cleared: true };
    }
    if (!force && trimmed === manualAddressBaselineRef.current) {
      return { ok: true, skipped: true };
    }
    setGeocodingAddress(true);
    try {
      const geo = await geocodeViaServer(supabase, trimmed);
      if (!geo.ok || geo.lat == null || geo.lng == null) {
        return {
          ok: false,
          error: `Could not find coordinates for that address${geo.status && geo.status !== "ERROR" ? ` (${geo.status})` : ""}.`,
        };
      }
      setManualForm((prev) => ({
        ...prev,
        lat: String(geo.lat),
        lng: String(geo.lng),
      }));
      manualAddressBaselineRef.current = trimmed;
      return { ok: true, lat: geo.lat, lng: geo.lng };
    } finally {
      setGeocodingAddress(false);
    }
  }

  async function onManualAddressBlur() {
    const trimmed = manualForm.address.trim();
    if (trimmed === manualAddressBaselineRef.current) return;
    const result = await geocodeManualAddress(manualForm.address);
    if (!result.ok) setManualErr(result.error);
    else if (manualErr.startsWith("Could not find coordinates")) setManualErr("");
  }

  async function saveNewGroup(e) {
    e.preventDefault();
    const name = newGroupName.trim();
    if (!name) return;
    setSavingGroup(true);
    try {
      const nextOrder = groups.length > 0 ? Math.max(...groups.map((g) => g.sort_order ?? 0)) + 1 : 0;
      const { data, error } = await supabase
        .from("groups")
        .insert({ map_id: mapId, name, sort_order: nextOrder })
        .select("id,name,sort_order")
        .single();
      if (error) throw error;
      setGroups((prev) => [...prev, data]);
      mfSet("group_id", data.id);
      setAddGroupModal(false);
      setNewGroupName("");
    } catch (e2) {
      // surface the error in the entry dialog
      setManualErr(e2?.message ?? "Failed to create group.");
    } finally {
      setSavingGroup(false);
    }
  }

  function mfSet(key, val) { setManualForm((prev) => ({ ...prev, [key]: val })); }

  async function saveManualEntry(e) {
    e.preventDefault();
    setManualErr("");
    const name = manualForm.name.trim();
    if (!name) { setManualErr("Name is required."); return; }

    const address = manualForm.address.trim();
    let latRaw = manualForm.lat.trim();
    let lngRaw = manualForm.lng.trim();

    const addressChanged = address !== manualAddressBaselineRef.current;
    const missingCoords = !!address && (!latRaw || !lngRaw);
    if (addressChanged || missingCoords) {
      const geo = await geocodeManualAddress(address, { force: missingCoords && !addressChanged });
      if (!geo.ok) { setManualErr(geo.error); return; }
      if (geo.cleared) {
        latRaw = "";
        lngRaw = "";
      } else if (!geo.skipped) {
        latRaw = geo.lat != null ? String(geo.lat) : "";
        lngRaw = geo.lng != null ? String(geo.lng) : "";
      }
    }

    const lat = latRaw === "" ? null : Number(latRaw);
    const lng = lngRaw === "" ? null : Number(lngRaw);
    if (latRaw && isNaN(lat)) { setManualErr("Lat must be a number."); return; }
    if (lngRaw && isNaN(lng)) { setManualErr("Lng must be a number."); return; }
    if ((lat === null) !== (lng === null)) { setManualErr("Provide both lat and lng, or leave both blank."); return; }

    const payload = {
      map_id: mapId,
      name,
      address: address || null,
      group_id: manualForm.group_id || null,
      lat, lng,
      website_url: manualForm.website_url.trim() || null,
      email: manualForm.email.trim() || null,
      phone: manualForm.phone.trim() || null,
      logo_url: manualForm.logo_url.trim() || null,
      is_active: manualForm.is_active,
      source: "manual",
    };

    try {
      setSavingManual(true);
      let savedId;
      if (manualModal === "new") {
        savedId = crypto.randomUUID();
        const { error } = await supabase.from("listings").insert({ ...payload, id: savedId });
        if (error) throw error;
      } else {
        savedId = editingListing.id;
        const { error } = await supabase.from("listings").update(payload).eq("id", editingListing.id);
        if (error) throw error;
      }
      await filterEditorRef.current?.persist(savedId);
      const l = await fetchListings();
      setListings(l ?? []);
      closeManual();
    } catch (e) {
      setManualErr(e?.message ?? String(e));
    } finally {
      setSavingManual(false);
    }
  }

  async function deleteManualEntry(listing) {
    const ok = await confirm({ title: `Delete "${listing.name}"?`, body: "This cannot be undone.", confirmLabel: "Delete entry", tone: "danger" });
    if (!ok) return;
    try {
      setDeletingId(listing.id);
      const { error } = await supabase.from("listings").delete().eq("id", listing.id);
      if (error) throw error;
      setListings((prev) => prev.filter((l) => l.id !== listing.id));
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setDeletingId(null);
    }
  }

  // ── Logo BG ───────────────────────────────────────────────────────────────

  async function updateListingActive(listingId, newValue) {
    const { error } = await supabase.from("listings").update({ is_active: newValue }).eq("id", listingId);
    if (error) { setErr(error.message || "Failed to update status."); return; }
    setListings((prev) => prev.map((l) => (l.id === listingId ? { ...l, is_active: newValue } : l)));
    invokeFunction("generate_map_snapshot", { body: { map_id: mapId } }).catch(() => {});
  }

  async function updateListingLogoBg(listingId, newValue) {
    const { error } = await supabase.from("listings").update({ logo_bg: newValue || null }).eq("id", listingId);
    if (error) { setErr(error.message || "Failed to update logo background."); return; }
    setListings((prev) => prev.map((l) => (l.id === listingId ? { ...l, logo_bg: newValue || null } : l)));
  }

  async function updateListingLogoUrl(listingId, newValue) {
    const { error } = await supabase.from("listings").update({ logo_url: newValue || null }).eq("id", listingId);
    if (error) { setErr(error.message || "Failed to update logo."); return; }
    setListings((prev) => prev.map((l) => (l.id === listingId ? { ...l, logo_url: newValue || null } : l)));
  }

  async function handleListingLogoFile(e, listingId) {
    const file = e?.target?.files?.[0];
    if (!file) return;
    const name = (file.name || "").toLowerCase();
    const extMatch = name.match(/\.(svg|png|jpe?g|webp)$/);
    if (!extMatch) {
      setErr("Use SVG, PNG, JPG or WebP for the logo.");
      e.target.value = "";
      return;
    }
    if (file.size > 500 * 1024) {
      setErr("Logo too large (max 500 KB).");
      e.target.value = "";
      return;
    }
    setErr("");
    setLogoUploadingId(listingId);
    try {
      const ext = extMatch[1] === "jpeg" ? "jpg" : extMatch[1];
      const uploadFile = ext === "svg" ? await sanitizeSvgFile(file) : file;
      const path = `${mapId}/listings/${listingId}/logo.${ext}`;
      const { error: uploadError } = await supabase.storage.from("map-pins").upload(path, uploadFile, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("map-pins").getPublicUrl(path);
      await updateListingLogoUrl(listingId, `${urlData.publicUrl}?v=${Date.now()}`);
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setLogoUploadingId(null);
      e.target.value = "";
    }
  }

  // ── Clear all data ────────────────────────────────────────────────────────

  async function clearMapData() {
    const ok = await confirm({
      title: "Clear all listing data and groups for this map?",
      body: "This cannot be undone.",
      confirmLabel: "Clear all data",
      tone: "danger",
    });
    if (!ok) return;
    try {
      setClearing(true); setErr(""); setMsg(""); setMsgTone("ok");
      const { error: le } = await supabase.from("listings").delete().eq("map_id", mapId);
      if (le) throw le;
      const { error: ge } = await supabase.from("groups").delete().eq("map_id", mapId);
      if (ge) throw ge;
      setGroups([]); setListings([]);
      setMsg("All listings and groups removed.");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setClearing(false);
    }
  }

  // ── Tab switching with guard ──────────────────────────────────────────────

  function handleTabChange(tab) {
    if (integrationLinked && (tab === "manual" || tab === "spreadsheet")) return;
    if (directoryAssoc && (tab === "manual" || tab === "spreadsheet" || tab === "drive")) return;
    setMsg(""); setMsgTone("ok"); setErr(""); setSheetErr(""); setSheetMsg("");
    setJustDisconnected(false);
    setActiveTab(tab);
  }

  // ── Directory datasource functions (DIR-E4-S2) ────────────────────────────

  useEffect(() => {
    if (activeTab !== "directories" || directoriesFetched || directoriesLoading) return;
    (async () => {
      try {
        setDirectoriesLoading(true); setDirectoriesError("");
        const dirs = await listDirectories(clientId);
        setClientDirectories(dirs);
      } catch (e) {
        setDirectoriesError(e?.message ?? String(e));
      } finally {
        setDirectoriesLoading(false);
        setDirectoriesFetched(true);
      }
    })();
  }, [activeTab, clientId, directoriesFetched, directoriesLoading]);

  const linkedDirectory = directoryAssoc
    ? clientDirectories.find((d) => d.id === directoryAssoc.directory_id) ?? null
    : null;

  async function handleAttachDirectory() {
    if (!selectedDirectoryId) return;
    try {
      setAttachingDirectory(true); setDirectoriesError("");
      const assoc = await attachDirectoryToMap(mapId, selectedDirectoryId);
      // A map is either self-authored or directory-sourced, never both — attaching
      // a directory takes over as the datasource, so an active Sheets sync is
      // disconnected the same way switching to CSV already disconnects it.
      if (integrationLinked) {
        await supabase.from("map_data_sources").delete().eq("map_id", mapId).eq("provider", "google_sheets");
        setIntegrationLinked(false);
      }
      setDirectoryAssoc(assoc);
      setSelectedDirectoryId("");
      recordAdminEvent(supabase, {
        eventType: "data_directory_linked",
        clientId,
        mapId,
        meta: { client_id: clientId, map_id: mapId, directory_id: selectedDirectoryId, source: "client_portal" },
      });
    } catch (e) {
      setDirectoriesError(e?.message ?? String(e));
    } finally {
      setAttachingDirectory(false);
    }
  }

  async function handleDetachDirectory() {
    const detachedDirectoryId = directoryAssoc?.directory_id ?? null;
    try {
      setDetachingDirectory(true); setDirectoriesError("");
      await detachDirectoryFromMap(mapId);
      setDirectoryAssoc(null);
      recordAdminEvent(supabase, {
        eventType: "data_directory_unlinked",
        clientId,
        mapId,
        meta: { client_id: clientId, map_id: mapId, directory_id: detachedDirectoryId, source: "client_portal" },
      });
    } catch (e) {
      setDirectoriesError(e?.message ?? String(e));
    } finally {
      setDetachingDirectory(false);
    }
  }

  async function handleBuildDirectoryFromMap() {
    try {
      setBuildingDirectory(true); setDirectoriesError("");
      const dir = await createDirectoryFromMap(mapId);
      let categorisationsMigrated = null;
      try {
        categorisationsMigrated = (await listAttachedCategorisations("directory", dir.id)).length;
      } catch { /* best-effort telemetry only */ }
      recordAdminEvent(supabase, {
        eventType: "directory_created",
        meta: { name: dir.name, slug: dir.slug, directory_id: dir.id, source_map_id: mapId, categorisations_migrated: categorisationsMigrated },
        source: "client_portal",
        clientId,
      });
      navigate(`/client/directories/${encodeURIComponent(dir.id)}`);
    } catch (e) {
      setDirectoriesError(e?.message ?? String(e));
    } finally {
      setBuildingDirectory(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const syncLockedReason = "Disconnect Google Drive to use this tab";
  const directoryLockedReason = "Disconnect the linked directory to use this tab";
  const tabs = [
    { id: "branding", label: "Map data" },
    { id: "manual", label: "Manual entry", disabled: integrationLinked || !!directoryAssoc, disabledReason: directoryAssoc ? directoryLockedReason : syncLockedReason },
    { id: "spreadsheet", label: "Upload CSV", disabled: integrationLinked || !!directoryAssoc, disabledReason: directoryAssoc ? directoryLockedReason : syncLockedReason },
    { id: "drive", label: "Sync data", disabled: !!directoryAssoc, disabledReason: directoryLockedReason },
    { id: "directories", label: "Directories" },
    ...(syncLogCount > 0 ? [{ id: "sync_history", label: "Sync History" }] : []),
  ];

  const mapPath = `/client/maps/${encodeURIComponent(mapId)}`;
  const head = {
    breadcrumb: [{ label: map?.name ?? "Map", to: mapPath }, { label: "Map data" }],
    title: "Map data",
    subtitle: <>Manage the listings displayed on <strong>{map?.name ?? "this map"}</strong></>,
    status: <Pill tone={listings.length ? "ok" : "neutral"}>{listings.length} {listings.length === 1 ? "listing" : "listings"}</Pill>,
    actions: <Button onClick={downloadTemplate}>CSV template</Button>,
  };

  const manualColumns = [
    { key: "name", label: "Name", render: (l) => <button type="button" className="md-linkbtn" onClick={() => openEditManual(l)}>{l.name || "—"}</button> },
    { key: "address", label: "Address", render: (l) => <span className="md-cell-clip md-cell-muted" title={l.address || undefined}>{l.address || "—"}</span> },
    { key: "group", label: "Group", render: (l) => <span className="md-cell-muted">{groupNameById.get(l.group_id) || "—"}</span> },
    { key: "source", label: "Source", render: (l) => <SourcePill source={l.source || ingestionMethodMap.get(l.id) || "manual"} /> },
  ];

  const searchField = (
    <Field label="Search" className="md-search">
      <TextInput
        type="search"
        value={dataSearch}
        onChange={(e) => { setDataSearch(e.target.value); setDataPage(0); }}
        placeholder="Filter by name or address…"
      />
    </Field>
  );

  return (
    <>
      <PageLayout head={head}>
        <div className="md-stack">
          {(importing || sheetJob.job || importJob.job) ? (
            <div className="job-stack">
              {importing ? <KeepOpenBanner title={`Importing ${rows.length} ${rows.length === 1 ? "row" : "rows"}`} detail="Importing runs in your browser and stops if you leave." /> : null}
              {sheetJob.job ? <JobCard job={sheetJob.job} onRetry={syncNow} onDismiss={sheetJob.dismiss} /> : null}
              {!importing && importJob.job ? <JobCard job={importJob.job} onDismiss={importJob.dismiss} /> : null}
            </div>
          ) : null}

          <MapDataTabs tabs={tabs} activeTab={activeTab} onChange={handleTabChange} />

          {justDisconnected && (
            <Callout tone="ok" action={<Button variant="ghost" size="sm" onClick={() => setJustDisconnected(false)}>Dismiss</Button>}>
              Google Drive disconnected. You can now edit listings manually or upload a CSV.
            </Callout>
          )}

          {activeTab === null && <Skeleton variant="list" rows={3} label="Loading map data" />}

          {/* TAB: Sync data (Google Sheets) */}
          {activeTab === "drive" && (
            <Section
              title="Sync data"
              description="Connect a cloud spreadsheet and keep your map data in sync automatically. Syncing will replace all existing listings on this map."
            >
              <div className="md-stack">
                {listings.length > 0 && !integrationLinked && (
                  <Callout tone="warn" title="Existing data will be replaced">
                    This map already has {listings.length} listing{listings.length !== 1 ? "s" : ""}. Connecting an integration and syncing will overwrite them.
                  </Callout>
                )}

                <DriveSyncCards
                  sheetStatus={sheetStatus}
                  schedFreq={schedFreq}
                  schedTime={schedTime}
                  savingSchedule={savingSchedule}
                  syncing={syncing}
                  connecting={connecting}
                  configuring={configuring}
                  openingPicker={openingPicker}
                  onConnect={connectGoogle}
                  onSync={syncNow}
                  onChangeFile={openDrivePicker}
                  onDisconnect={disconnectGoogle}
                  onSaveSchedule={saveSchedule}
                />

                {sheetErr && <Callout tone="danger">{sheetErr}</Callout>}
                {sheetMsg && <Callout tone="ok">{sheetMsg}</Callout>}
                {sheetStatus?.issues?.length ? (
                  <Callout tone="warn" title="Issues detected">
                    {sheetStatus.issues.map((x) => <div key={x}>{x}</div>)}
                  </Callout>
                ) : null}
              </div>
            </Section>
          )}

          {/* TAB: Directories (DIR-E4-S2) */}
          {activeTab === "directories" && (
            <>
              <Section
                title="Directories"
                description="Use one of your directories as this map's live pin datasource instead of its own listings."
              >
                <div className="md-stack">
                  {integrationLinked && !directoryAssoc && (
                    <Callout tone="warn">
                      A Google Sheets sync is currently active on this map. Attaching a directory will disconnect it.
                    </Callout>
                  )}

                  {directoriesError && <Callout tone="danger">{directoriesError}</Callout>}

                  {directoryAssoc ? (
                    <>
                      <div className="md-fact">
                        <span className="md-fact-label">Linked directory</span>
                        <span className="md-fact-value">{linkedDirectory?.name ?? directoryAssoc.directory_id}</span>
                      </div>
                      <p className="md-meta">
                        This map's pins are read live from the directory's published entries — no separate sync step. Edits only appear here once the directory is next published.
                      </p>
                      <div className="md-actions">
                        <Button variant="danger" size="sm" onClick={handleDetachDirectory} loading={detachingDirectory} loadingLabel="Disconnecting…" disabled={detachingDirectory}>
                          Disconnect
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      {directoriesLoading && <Skeleton variant="list" rows={2} label="Loading directories" />}
                      {!directoriesLoading && clientDirectories.length === 0 ? (
                        <EmptyState art="none" title="No directories yet" />
                      ) : (
                        !directoriesLoading && (
                          <>
                            <Field label="Directory" className="md-select-field">
                              <Select value={selectedDirectoryId} onChange={(e) => setSelectedDirectoryId(e.target.value)}>
                                <option value="">Choose a directory</option>
                                {clientDirectories.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                              </Select>
                            </Field>
                            <div className="md-actions">
                              <Button variant="primary" onClick={handleAttachDirectory} disabled={!selectedDirectoryId || attachingDirectory} loading={attachingDirectory} loadingLabel="Linking…">
                                Use this directory
                              </Button>
                            </div>
                          </>
                        )
                      )}
                    </>
                  )}
                </div>
              </Section>

              {!directoryAssoc && !directoriesLoading && (
                <Section
                  title="Build a directory from this map"
                  description="Or copy this map's groups and listings into a brand-new directory. You'll review and publish it before it's linked back to this map."
                >
                  <div className="md-actions">
                    <Button onClick={handleBuildDirectoryFromMap} loading={buildingDirectory} loadingLabel="Building…" disabled={buildingDirectory}>
                      Build a directory from this map
                    </Button>
                  </div>
                </Section>
              )}
            </>
          )}

          {/* TAB: Upload CSV */}
          {activeTab === "spreadsheet" && (
            <Section
              title="Upload a CSV file"
              description={(
                <>
                  Your CSV must have a <code>name</code> column. Download the template above for the full list of supported columns.
                  Importing will replace all existing data on this map.
                </>
              )}
            >
              <div className="md-stack">
                {integrationLinked && (
                  <Callout tone="warn" title="Sync is active">
                    Disconnect Google Drive to upload a CSV file.
                  </Callout>
                )}

                {(listings.length > 0 || integrationLinked) && (
                  <Callout tone="warn" title="This will overwrite existing data">
                    {integrationLinked
                      ? "You have an active integration. Uploading a CSV will disconnect it and replace all synced listings."
                      : `This map has ${listings.length} existing listing${listings.length !== 1 ? "s" : ""}. Importing will replace them.`}
                  </Callout>
                )}

                <Field label="Choose file" error={fileErr || undefined}>
                  <TextInput type="file" accept=".csv" onChange={(e) => onPickFile(e.target.files?.[0])} />
                </Field>

                <Checkbox
                  label="Automatically geocode rows that are missing lat/lng coordinates"
                  checked={geocodeMissing}
                  onChange={(e) => setGeocodeMissing(e.target.checked)}
                />

                {msg && <Callout tone={msgTone}>{msg}</Callout>}
                {err && <Callout tone="danger"><pre className="md-pre">{err}</pre></Callout>}

                <div className="md-actions">
                  <Button
                    variant="primary"
                    onClick={() => rows.length && setImportChoiceOverlayOpen(true)}
                    disabled={importing || rows.length === 0}
                    loading={importing}
                    loadingLabel="Importing…"
                  >
                    {`Import ${rows.length} row${rows.length !== 1 ? "s" : ""}`}
                  </Button>
                  <Button as={Link} to={mapPath}>Done</Button>
                </div>

                <CsvPreviewTable rows={preview} />
              </div>
            </Section>
          )}

          {/* TAB: Manual entry */}
          {activeTab === "manual" && (
            <Section
              title="Manual entries"
              description="Add, edit, or remove individual listings by hand."
              actions={(
                <Button variant="primary" size="sm" icon={<PlusIcon />} onClick={openNewManual} disabled={integrationLinked}>
                  Add entry
                </Button>
              )}
            >
              <div className="md-stack">
                {integrationLinked && (
                  <Callout tone="warn" title="Sync is active">
                    Disconnect Google Drive to edit listings manually.
                  </Callout>
                )}

                {listings.length === 0 ? (
                  <EmptyState
                    art="welcome"
                    title="No listings yet"
                    actions={<Button variant="primary" icon={<PlusIcon />} onClick={openNewManual} disabled={integrationLinked}>Add first entry</Button>}
                  />
                ) : (
                  <>
                    <Toolbar>{searchField}</Toolbar>

                    {hasSelectFilterFields && selectedIds.size > 0 && (
                      <BulkBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
                        <Button size="sm" onClick={() => setBulkModalOpen(true)}>Bulk edit filters</Button>
                      </BulkBar>
                    )}

                    <DataTable
                      caption="Manual entries"
                      columns={manualColumns}
                      rows={filteredListings}
                      getRowId={(l) => l.id}
                      getRowLabel={(l) => l.name || "listing"}
                      selectable={hasSelectFilterFields}
                      selected={[...selectedIds]}
                      onSelectedChange={(ids) => setSelectedIds(new Set(ids))}
                      rowMenu={(l) => [
                        { label: "Edit", onSelect: () => openEditManual(l) },
                        { label: "Delete", danger: true, disabled: !!deletingId, onSelect: () => deleteManualEntry(l) },
                      ]}
                      empty={<EmptyState art="searching" title="No listings match your search" />}
                    />
                  </>
                )}

                {err && <Callout tone="danger">{err}</Callout>}
              </div>
            </Section>
          )}

          {/* TAB: Map data (view and edit all listings) */}
          {activeTab === "branding" && (
            <Section
              title="All listings"
              description="Edit logo backgrounds. Source column shows where each listing came from."
              actions={(
                <Button variant="danger" size="sm" onClick={clearMapData} loading={clearing} loadingLabel="Clearing…" disabled={clearing}>
                  Clear all data
                </Button>
              )}
            >
              <div className="md-stack">
                <Toolbar>{searchField}</Toolbar>

                <ListingLogoTable
                  listings={pageListings}
                  groupNameById={groupNameById}
                  ingestionMethodMap={ingestionMethodMap}
                  logoUploadingId={logoUploadingId}
                  onToggleActive={updateListingActive}
                  onSetLogoBg={updateListingLogoBg}
                  onUploadLogo={handleListingLogoFile}
                  pagination={{ page: dataPage + 1, pageSize: PAGE_SIZE, total: totalFilteredListings, onPage: (p) => setDataPage(p - 1) }}
                  empty={dataSearch
                    ? <EmptyState art="searching" title="No listings match your search" />
                    : <EmptyState art="none" title="No listings loaded yet" />}
                />

                {msg && <Callout tone={msgTone}>{msg}</Callout>}
                {err && <Callout tone="danger">{err}</Callout>}
              </div>
            </Section>
          )}

          {/* TAB: Sync history */}
          {activeTab === "sync_history" && (
            <Section title="Sync history" description="A log of every Google Sheets sync attempt for this map.">
              <SyncHistoryTable mapId={mapId} />
            </Section>
          )}
        </div>
      </PageLayout>

      {bulkModalOpen && (
        <BulkFilterEditModal
          mapId={mapId}
          fields={filterFields}
          listingIds={[...selectedIds]}
          clientId={null}
          recordEvent={(eventType, meta) => recordAdminEvent(supabase, { eventType, meta, source: "client_portal" })}
          onClose={() => setBulkModalOpen(false)}
          onApplied={() => { setSelectedIds(new Set()); setMsgTone("ok"); setMsg("Filter values updated."); }}
        />
      )}

      {/* Import mode choice */}
      {importChoiceOverlayOpen && (
        <Dialog title="How should this data be added?" onClose={() => setImportChoiceOverlayOpen(false)}>
          <p className="md-dialog-note">
            You have {listings.length} existing listing{listings.length !== 1 ? "s" : ""}. Choose whether to replace them or add to them.
          </p>
          <div className="md-dialog-actions">
            <Button variant="danger" onClick={() => doImport("overwrite")} disabled={importing} loading={importing} loadingLabel="Importing…">
              Replace all existing data
            </Button>
            <Button onClick={() => doImport("append")} disabled={importing}>
              Add to existing data
            </Button>
            <Button variant="ghost" data-autofocus onClick={() => setImportChoiceOverlayOpen(false)}>
              Cancel
            </Button>
          </div>
        </Dialog>
      )}

      {/* Manual entry dialog */}
      {manualModal && (
        <ManualListingDialog
          mode={manualModal}
          listing={editingListing}
          mapId={mapId}
          form={manualForm}
          onChange={mfSet}
          groups={groups}
          geocoding={geocodingAddress}
          error={manualErr}
          saving={savingManual}
          onAddressBlur={onManualAddressBlur}
          onSubmit={saveManualEntry}
          onClose={closeManual}
          filterEditorRef={filterEditorRef}
          addGroup={{
            open: addGroupModal,
            name: newGroupName,
            saving: savingGroup,
            onOpen: () => { setAddGroupModal(true); setNewGroupName(""); },
            onClose: () => setAddGroupModal(false),
            onNameChange: setNewGroupName,
            onSave: saveNewGroup,
          }}
        />
      )}
    </>
  );
}

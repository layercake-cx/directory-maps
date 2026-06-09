import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase, invokeFunction } from "../../lib/supabase";
import { Alert, Badge, Button, Loader, Overlay, SegmentedControl, Stack, Text, Group } from "@mantine/core";
import { Download, FilePlus, FolderOpen, Pencil, Plus, RefreshCw, Trash2, Unlink } from "lucide-react";
import { formatSheetSyncResult } from "../../lib/sheetSyncMessages.js";
import { logClientError } from "../../lib/errorLogger.js";
import SyncHistoryTable from "../../components/SyncHistoryTable.jsx";

const PAGE_SIZE = 100;
const LOGO_BG_SWATCHES = [
  { label: "None", value: "" },
  { label: "Light", value: "#d4d4d4" },
  { label: "Mid", value: "#737373" },
  { label: "Dark", value: "#1a1a1a" },
];

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

// ─── Schedule helpers ────────────────────────────────────────────────────────

function parseSchedule(raw) {
  if (!raw || raw === "manual") return { freq: "manual", time: "09:00" };
  if (raw === "nightly") return { freq: "daily", time: "00:00" }; // legacy
  if (raw === "hourly") return { freq: "hourly", time: "09:00" };
  if (raw.startsWith("daily:")) return { freq: "daily", time: raw.slice(6) || "09:00" };
  return { freq: "manual", time: "09:00" };
}

function buildScheduleValue(freq, time) {
  if (freq === "manual") return null;
  if (freq === "hourly") return "hourly";
  return `daily:${time}`;
}

function describeSchedule(freq, time) {
  if (freq === "manual") return "No automatic sync — run manually";
  if (freq === "hourly") return "Syncs every hour";
  const [h, m] = (time || "09:00").split(":").map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  return `Syncs daily at ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

// ─── Source badge ────────────────────────────────────────────────────────────

function SourceBadge({ source }) {
  if (source === "integration") return <Badge size="xs" color="teal" variant="light">Integration</Badge>;
  if (source === "csv") return <Badge size="xs" color="blue" variant="light">CSV</Badge>;
  if (source === "manual") return <Badge size="xs" color="gray" variant="light">Manual</Badge>;
  return <Badge size="xs" color="gray" variant="outline">Unknown</Badge>;
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

  // ── Data ──────────────────────────────────────────────────────────────────
  const [map, setMap] = useState(null);
  const [groups, setGroups] = useState([]);
  const [listings, setListings] = useState([]);

  // ── Integration / Drive ───────────────────────────────────────────────────
  const [sheetStatus, setSheetStatus] = useState(null);
  const [sheetMsg, setSheetMsg] = useState("");
  const [sheetErr, setSheetErr] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [spreadsheetInput, setSpreadsheetInput] = useState("");
  const [sheets, setSheets] = useState([]);
  const [folders, setFolders] = useState([]);
  const [folderStack, setFolderStack] = useState([]);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [sheetsLoading, setSheetsLoading] = useState(false);
  const [sheetsQuery, setSheetsQuery] = useState("");
  const [sheetsErr, setSheetsErr] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncSchedule, setSyncSchedule] = useState(null);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [integrationLinked, setIntegrationLinked] = useState(false);

  // ── CSV tab ───────────────────────────────────────────────────────────────
  const [fileErr, setFileErr] = useState("");
  const [rows, setRows] = useState([]);
  const [preview, setPreview] = useState([]);
  const [geocodeMissing, setGeocodeMissing] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importChoiceOverlayOpen, setImportChoiceOverlayOpen] = useState(false);

  // ── Manual CRUD ───────────────────────────────────────────────────────────
  const [manualModal, setManualModal] = useState(null); // null | "new" | "edit"
  const [editingListing, setEditingListing] = useState(null);
  const [manualForm, setManualForm] = useState(MANUAL_FORM_EMPTY);
  const [savingManual, setSavingManual] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [manualErr, setManualErr] = useState("");
  const [addGroupModal, setAddGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);

  // ── General UI ────────────────────────────────────────────────────────────
  const [msg, setMsg] = useState("");
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
      .select("id,name,address,postcode,country,lat,lng,website_url,email,phone,logo_bg,logo_url,source,is_active")
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
        const [{ data: m }, { data: g }, { data: ds }, l, { count }] = await Promise.all([
          supabase.from("maps").select("id,name").eq("id", mapId).single(),
          supabase.from("groups").select("id,name").eq("map_id", mapId).order("sort_order", { ascending: true }),
          supabase.from("map_data_sources").select("id").eq("map_id", mapId).eq("provider", "google_sheets").eq("enabled", true).limit(1),
          fetchListings(),
          supabase.from("sync_logs").select("id", { count: "exact", head: true }).eq("map_id", mapId),
        ]);
        setMap(m ?? null);
        setGroups(g ?? []);
        const linked = (ds?.length ?? 0) > 0;
        setIntegrationLinked(linked);
        setActiveTab(linked ? "drive" : "branding");
        setListings(l ?? []);
        setSyncLogCount(count ?? 0);
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
  const dataStart = totalFilteredListings ? dataPage * PAGE_SIZE + 1 : 0;
  const dataEnd = totalFilteredListings ? Math.min((dataPage + 1) * PAGE_SIZE, totalFilteredListings) : 0;

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
      if (statusRes.data?.connected && !statusRes.data?.sheet?.spreadsheet_id) {
        setShowPicker(true);
        loadSheets();
      }
    } catch (e) {
      setSheetErr(e?.message ?? String(e));
      setSheetStatus((prev) => prev ?? { connected: false });
      logClientError({ type: "google_sync", message: e?.message ?? String(e), context: { map_id: mapId, fn: "refreshSheetStatus" } });
    }
  }

  useEffect(() => { refreshSheetStatus().catch(() => {}); }, [mapId]);

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
      setSheetStatus(null); setSheets([]); setFolders([]); setFolderStack([]); setCurrentFolderId(null);
      setShowPicker(false); setSheetMsg("");
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
    try {
      setSyncing(true); setSheetErr(""); setSheetMsg("");
      const { data, error } = await invokeFunction("sync_sheet_listings", { body: { mapId } });
      if (error) {
        const body = await error.context?.json?.().catch(() => null);
        throw new Error(body?.error ?? body?.message ?? error.message);
      }
      const formatted = formatSheetSyncResult(data, mapId);
      if (formatted.type === "error") throw new Error(formatted.message);
      if (formatted.type === "warning") { setSheetErr(formatted.message); setSheetMsg(""); }
      else { setSheetErr(""); setSheetMsg(formatted.message); }
      const l = await fetchListings();
      setListings(l ?? []);
      await refreshSheetStatus();
    } catch (e) {
      setSheetErr(e?.message ?? String(e));
      logClientError({ type: "google_sync", message: e?.message ?? String(e), context: { map_id: mapId, fn: "syncNow" } });
    } finally {
      setSyncing(false);
    }
  }

  async function loadSheets(query = "", folderId = currentFolderId) {
    try {
      setSheetsLoading(true); setSheetsErr("");
      const { data, error } = await invokeFunction("google_list_sheets", { body: { mapId, query, folderId } });
      if (error) {
        const body = await error.context?.json?.().catch(() => null);
        throw new Error(body?.error ?? body?.message ?? error.message);
      }
      if (data?.error) throw new Error(data.error);
      setSheets(data?.files ?? []);
      setFolders(data?.folders ?? []);
    } catch (e) {
      setSheetsErr(e?.message ?? String(e));
    } finally {
      setSheetsLoading(false);
    }
  }

  function navigateToFolder(folder) {
    setFolderStack((prev) => [...prev, folder]);
    setCurrentFolderId(folder.id);
    setSheetsQuery("");
    loadSheets("", folder.id);
  }

  function navigateUp(index) {
    const newStack = index === -1 ? [] : folderStack.slice(0, index + 1);
    const newFolderId = newStack.length ? newStack[newStack.length - 1].id : null;
    setFolderStack(newStack);
    setCurrentFolderId(newFolderId);
    setSheetsQuery("");
    loadSheets("", newFolderId);
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
      setShowPicker(false);
      setSheetMsg(data.sheetName ? `Connected: ${data.sheetName}` : "File connected");
      await refreshSheetStatus();
    } catch (e) {
      setSheetErr(e?.message ?? String(e));
    } finally {
      setConfiguring(false);
    }
  }

  function getSpreadsheetIdError(value) {
    const trimmed = (value || "").trim();
    if (!trimmed) return null;
    if (/drive\.google\.com\/file\/d\//i.test(trimmed))
      return "That's a Drive file link, not a Sheet. Copy the URL from the Google Sheets address bar (docs.google.com/spreadsheets/d/…).";
    return null;
  }

  // ── CSV functions ─────────────────────────────────────────────────────────

  async function onPickFile(file) {
    setFileErr(""); setErr(""); setMsg(""); setRows([]); setPreview([]);
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
    const header = ["id","name","address","postcode","country","lat","lng","website_url","email","phone","logo_url","notes_html","allow_html","group_name","is_active"];
    const sample = [["","Example Supplier Ltd","1 Example Street","SW1A 1AA","UK","","","https://example.com","hello@example.com","","","","false","","true"]];
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
    setErr(""); setMsg("");
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

    try {
      setImporting(true); setImportChoiceOverlayOpen(false);
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
      if (geocodeMissing) {
        const { data: geoData, error: geoErr } = await invokeFunction("geocode_listings", { body: { mapId } });
        if (geoErr || geoData?.error) setMsg(`Imported ${importCount} rows. ⚠ Geocoding could not be started: ${geoData?.error ?? geoErr?.message}`);
        else setMsg(`Imported ${importCount} rows. Geocoding ${geoData?.queued ?? 0} addresses in the background — pins will appear shortly.`);
      } else {
        setMsg(`Imported ${importCount} rows.`);
      }
      const [{ data: g }, l] = await Promise.all([
        supabase.from("groups").select("id,name").eq("map_id", mapId).order("sort_order", { ascending: true }),
        fetchListings(),
      ]);
      setGroups(g ?? []); setListings(l ?? []);
    } catch (e) {
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
    setManualModal("edit");
  }

  function closeManual() { setManualModal(null); setEditingListing(null); setManualErr(""); }

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
    } catch (err) {
      // surface error in the group modal — keep it simple
      alert(err?.message ?? "Failed to create group.");
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

    const latRaw = manualForm.lat.trim();
    const lngRaw = manualForm.lng.trim();
    const lat = latRaw === "" ? null : Number(latRaw);
    const lng = lngRaw === "" ? null : Number(lngRaw);
    if (latRaw && isNaN(lat)) { setManualErr("Lat must be a number."); return; }
    if (lngRaw && isNaN(lng)) { setManualErr("Lng must be a number."); return; }
    if ((lat === null) !== (lng === null)) { setManualErr("Provide both lat and lng, or leave both blank."); return; }

    const payload = {
      map_id: mapId,
      name,
      address: manualForm.address.trim() || null,
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
      if (manualModal === "new") {
        const { error } = await supabase.from("listings").insert({ ...payload, id: crypto.randomUUID() });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("listings").update(payload).eq("id", editingListing.id);
        if (error) throw error;
      }
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
    if (!confirm(`Delete "${listing.name}"? This cannot be undone.`)) return;
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

  // ── Clear all data ────────────────────────────────────────────────────────

  async function clearMapData() {
    if (!confirm("Clear all listing data and groups for this map? This cannot be undone.")) return;
    try {
      setClearing(true); setErr(""); setMsg("");
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
    setMsg(""); setErr(""); setSheetErr(""); setSheetMsg("");
    setJustDisconnected(false);
    setActiveTab(tab);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const syncLockedReason = "Disconnect Google Drive to use this tab";
  const tabs = [
    { id: "branding", label: "Map data" },
    { id: "manual", label: "Manual entry", disabled: integrationLinked, disabledReason: syncLockedReason },
    { id: "spreadsheet", label: "Upload CSV", disabled: integrationLinked, disabledReason: syncLockedReason },
    { id: "drive", label: "Sync data" },
    ...(syncLogCount > 0 ? [{ id: "sync_history", label: "Sync History" }] : []),
  ];

  return (
    <div className="page-main" style={{ maxWidth: 960 }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 24 }}>
        <Link to={`/client/maps/${encodeURIComponent(mapId)}`} style={{ fontSize: 13, opacity: 0.65, textDecoration: "none" }}>
          ← Back to map
        </Link>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Map data</h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.65 }}>
              Manage the listings displayed on <strong>{map?.name ?? "this map"}</strong>
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Badge size="md" variant="light" color={listings.length ? "teal" : "gray"}>
              {listings.length} {listings.length === 1 ? "listing" : "listings"}
            </Badge>
            <Button size="sm" variant="default" leftSection={<Download size={14} />} onClick={downloadTemplate}>
              CSV template
            </Button>
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="admin-map-tabs" style={{ marginBottom: 20 }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`admin-map-tabs__tab ${activeTab === tab.id ? "is-active" : ""} ${tab.disabled ? "is-disabled" : ""}`}
            onClick={() => !tab.disabled && handleTabChange(tab.id)}
            title={tab.disabled ? tab.disabledReason : undefined}
            style={tab.disabled ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {justDisconnected && (
        <Alert color="teal" variant="light" mb="md" withCloseButton onClose={() => setJustDisconnected(false)}>
          Google Drive disconnected. You can now edit listings manually or upload a CSV.
        </Alert>
      )}

      {activeTab === null && (
        <div style={{ padding: "40px 0", textAlign: "center", opacity: 0.5 }}>
          <Loader size="sm" />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: Integrations
      ══════════════════════════════════════════════════════════════════════ */}

      {activeTab === "drive" && (
        <div style={{ display: "grid", gap: 16 }}>
          <p style={{ margin: 0, fontSize: 13, opacity: 0.7, maxWidth: 560 }}>
            Connect a cloud spreadsheet and keep your map data in sync automatically. Syncing will replace all existing listings on this map.
          </p>

          {listings.length > 0 && !integrationLinked && (
            <Alert color="yellow" variant="light" title="Existing data will be replaced">
              This map already has {listings.length} listing{listings.length !== 1 ? "s" : ""}. Connecting an integration and syncing will overwrite them.
            </Alert>
          )}

          {/* Provider cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>

            {/* Google Drive */}
            <div className="admin-card" style={{ padding: 20, position: "relative", overflow: "hidden" }}>
              {syncing && (
                <Overlay blur={3} backgroundOpacity={0.55} color="#fff" zIndex={10} radius="md">
                  <Stack align="center" justify="center" style={{ height: "100%" }} gap="xs">
                    <Loader size="sm" />
                    <Text size="sm" fw={500} c="dimmed">Syncing…</Text>
                  </Stack>
                </Overlay>
              )}
              <Stack gap="md">
                <Group gap="sm" justify="space-between">
                  <Group gap="sm">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" style={{ flexShrink: 0 }}>
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" fill="#EA4335"/>
                    </svg>
                    <div>
                      <Text fw={600} size="sm">Google Drive</Text>
                      <Text size="xs" c="dimmed">Sync from a Google Sheet</Text>
                    </div>
                  </Group>
                  {sheetStatus?.connected && <Badge color="green" variant="light" size="sm">Connected</Badge>}
                </Group>

                {sheetStatus === null && <Text size="xs" c="dimmed">Checking connection…</Text>}

                {sheetStatus !== null && !sheetStatus.connected && (
                  <Button size="sm" onClick={connectGoogle} loading={connecting}>
                    Connect Google Drive
                  </Button>
                )}

                {sheetStatus?.connected && sheetStatus?.sheet?.spreadsheet_id && !showPicker && (
                  <Stack gap="sm">
                    <div style={{ padding: "8px 10px", background: "rgba(0,0,0,0.04)", borderRadius: 6 }}>
                      <Text size="xs" c="dimmed" mb={2}>Connected file</Text>
                      <Text size="sm" fw={500} style={{ wordBreak: "break-word" }}>
                        {sheetStatus.sheet.sheet_name || "File connected"}
                      </Text>
                    </div>

                    {/* Schedule */}
                    <div>
                      <Text size="xs" c="dimmed" mb={6} fw={500}>Auto-sync schedule</Text>
                      <SegmentedControl
                        size="xs"
                        value={schedFreq}
                        onChange={(v) => saveSchedule(v, schedTime)}
                        disabled={savingSchedule}
                        data={[
                          { label: "Off", value: "manual" },
                          { label: "Hourly", value: "hourly" },
                          { label: "Daily", value: "daily" },
                        ]}
                      />
                      {schedFreq === "daily" && (
                        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                          <Text size="xs" c="dimmed">Run at</Text>
                          <input
                            type="time"
                            value={schedTime}
                            onChange={(e) => saveSchedule("daily", e.target.value)}
                            disabled={savingSchedule}
                            style={{ fontSize: 13, padding: "3px 6px", borderRadius: 6, border: "1px solid var(--lc-border)" }}
                          />
                        </div>
                      )}
                      <Text size="xs" c="dimmed" mt={4}>{describeSchedule(schedFreq, schedTime)}</Text>
                      {sheetStatus.last_synced_at && (
                        <Text size="xs" c="dimmed" mt={2}>
                          Last synced {new Date(sheetStatus.last_synced_at).toLocaleString()}
                          {sheetStatus.last_sync_status === "WARNING" ? " (with warnings)" : ""}
                        </Text>
                      )}
                      {sheetStatus.last_sync_error && <Text size="xs" c="orange" mt={2}>{sheetStatus.last_sync_error}</Text>}
                      {sheetStatus.dataRowCount != null && (
                        <Text size="xs" c="dimmed" mt={2}>
                          File: {sheetStatus.dataRowCount} rows, {sheetStatus.rowsWithName} with a name
                        </Text>
                      )}
                    </div>

                    <Group gap="xs" wrap="wrap">
                      <Button size="xs" leftSection={<RefreshCw size={13} />} onClick={syncNow} disabled={syncing || connecting || configuring} loading={syncing}>
                        Sync now
                      </Button>
                      <Button size="xs" variant="default" leftSection={<FolderOpen size={13} />} onClick={() => { setShowPicker(true); loadSheets(); }} disabled={syncing || connecting || configuring}>
                        Change file
                      </Button>
                      <Button size="xs" variant="subtle" color="red" leftSection={<Unlink size={13} />} onClick={disconnectGoogle} disabled={syncing || connecting || configuring} loading={connecting}>
                        Disconnect
                      </Button>
                    </Group>
                  </Stack>
                )}

                {sheetStatus?.connected && !sheetStatus?.sheet?.spreadsheet_id && !showPicker && (
                  <Button size="sm" variant="default" leftSection={<FilePlus size={14} />} onClick={() => { setShowPicker(true); loadSheets(); }} disabled={connecting || configuring}>
                    Choose a file
                  </Button>
                )}
              </Stack>
            </div>

            {/* OneDrive — coming soon */}
            <div className="admin-card" style={{ padding: 20, opacity: 0.4, pointerEvents: "none" }}>
              <Stack gap="md">
                <Group gap="sm">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 23 23" width="24" height="24" style={{ flexShrink: 0 }}>
                    <rect width="10.5" height="10.5" fill="#F25022"/>
                    <rect x="12.5" width="10.5" height="10.5" fill="#7FBA00"/>
                    <rect y="12.5" width="10.5" height="10.5" fill="#00A4EF"/>
                    <rect x="12.5" y="12.5" width="10.5" height="10.5" fill="#FFB900"/>
                  </svg>
                  <div>
                    <Text fw={600} size="sm">OneDrive</Text>
                    <Text size="xs" c="dimmed">Microsoft 365 / Excel</Text>
                  </div>
                </Group>
                <Badge variant="light" color="gray" size="sm" w="fit-content">Coming soon</Badge>
              </Stack>
            </div>

            {/* iCloud — coming soon */}
            <div className="admin-card" style={{ padding: 20, opacity: 0.4, pointerEvents: "none" }}>
              <Stack gap="md">
                <Group gap="sm">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 814 1000" width="20" height="24" style={{ flexShrink: 0 }}>
                    <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-42.3-150.3-109.2c-58.6-81.5-109.5-209.2-109.5-330.4 0-168.8 111.1-258.1 220.2-258.1 81.3 0 148.6 53.4 198.4 53.4 50.2 0 128.7-56.5 219.1-56.5zm-204.7-96.1c37.5-44.4 64.2-105.9 64.2-167.5 0-8.8-.8-17.7-2.3-25.4-60.5 2.4-132.2 39.6-175.3 89.4-33.4 37.5-64.8 99.8-64.8 162.8 0 9.6 1.6 19.2 2.3 22.3 3.8.7 10 1.6 16.2 1.6 54.3 0 120.5-36.1 159.7-83.2z" fill="#555"/>
                  </svg>
                  <div>
                    <Text fw={600} size="sm">iCloud Drive</Text>
                    <Text size="xs" c="dimmed">Apple Numbers</Text>
                  </div>
                </Group>
                <Badge variant="light" color="gray" size="sm" w="fit-content">Coming soon</Badge>
              </Stack>
            </div>
          </div>

          {/* File picker */}
          {sheetStatus?.connected && showPicker && (
            <div className="admin-card" style={{ padding: 16 }}>
              {sheetStatus?.sheet?.spreadsheet_id && (
                <button type="button" onClick={() => { setShowPicker(false); setFolderStack([]); setCurrentFolderId(null); setSheetsQuery(""); }} style={{ background: "none", border: "none", padding: 0, fontSize: 12, cursor: "pointer", opacity: 0.6, marginBottom: 10 }}>
                  ← Back
                </button>
              )}
              <Text size="sm" fw={500} mb={8}>Choose a file from Google Drive</Text>
              <input
                value={sheetsQuery}
                onChange={(e) => { setSheetsQuery(e.target.value); loadSheets(e.target.value); }}
                placeholder="Search files…"
                style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13, marginBottom: 8 }}
              />
              {!sheetsQuery && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 8, fontSize: 12 }}>
                  <button type="button" onClick={() => navigateUp(-1)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--mantine-color-blue-6)", fontSize: 12 }}>My Drive</button>
                  {folderStack.map((f, i) => (
                    <React.Fragment key={f.id}>
                      <span style={{ opacity: 0.4 }}>›</span>
                      {i < folderStack.length - 1
                        ? <button type="button" onClick={() => navigateUp(i)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--mantine-color-blue-6)", fontSize: 12 }}>{f.name}</button>
                        : <span style={{ opacity: 0.7 }}>{f.name}</span>
                      }
                    </React.Fragment>
                  ))}
                </div>
              )}
              {sheetsErr ? (
                <Alert color="red" variant="light" mb="xs">{sheetsErr}</Alert>
              ) : sheetsLoading ? (
                <Text size="sm" c="dimmed">Loading…</Text>
              ) : sheetsQuery ? (
                sheets.length === 0 ? (
                  <Text size="sm" c="dimmed">No files found.</Text>
                ) : (
                  <div style={{ border: "1px solid var(--lc-border)", borderRadius: 8, overflow: "hidden" }}>
                    {sheets.map((f, i) => (
                      <button key={f.id} type="button" onClick={() => selectSheet(f.id, f.mimeType, f.name)} disabled={configuring}
                        style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: i % 2 === 0 ? "var(--lc-card)" : "transparent", border: "none", borderBottom: i < sheets.length - 1 ? "1px solid var(--lc-border)" : "none", cursor: configuring ? "wait" : "pointer", gap: 8 }}
                      >
                        <span style={{ fontSize: 13 }}>{f.name}</span>
                        <span style={{ fontSize: 11, opacity: 0.5, whiteSpace: "nowrap" }}>{f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : ""}</span>
                      </button>
                    ))}
                  </div>
                )
              ) : folders.length === 0 && sheets.length === 0 ? (
                <Text size="sm" c="dimmed">This folder is empty.</Text>
              ) : (
                <div style={{ border: "1px solid var(--lc-border)", borderRadius: 8, overflow: "hidden" }}>
                  {[...folders.map((f) => ({ ...f, _type: "folder" })), ...sheets.map((f) => ({ ...f, _type: "file" }))].map((f, i, arr) => (
                    f._type === "folder" ? (
                      <button key={f.id} type="button" onClick={() => navigateToFolder(f)}
                        style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: i % 2 === 0 ? "var(--lc-card)" : "transparent", border: "none", borderBottom: i < arr.length - 1 ? "1px solid var(--lc-border)" : "none", cursor: "pointer" }}
                      >
                        <FolderOpen size={14} style={{ opacity: 0.6, flexShrink: 0 }} />
                        <span style={{ fontSize: 13 }}>{f.name}</span>
                      </button>
                    ) : (
                      <button key={f.id} type="button" onClick={() => selectSheet(f.id, f.mimeType, f.name)} disabled={configuring}
                        style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: i % 2 === 0 ? "var(--lc-card)" : "transparent", border: "none", borderBottom: i < arr.length - 1 ? "1px solid var(--lc-border)" : "none", cursor: configuring ? "wait" : "pointer", gap: 8 }}
                      >
                        <span style={{ fontSize: 13 }}>{f.name}</span>
                        <span style={{ fontSize: 11, opacity: 0.5, whiteSpace: "nowrap" }}>{f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : ""}</span>
                      </button>
                    )
                  ))}
                </div>
              )}
            </div>
          )}

          {sheetErr && <Alert color="red" variant="light">{sheetErr}</Alert>}
          {sheetMsg && <Alert color="green" variant="light">{sheetMsg}</Alert>}
          {sheetStatus?.issues?.length ? (
            <Alert color="yellow" variant="light" title="Issues detected">
              {sheetStatus.issues.map((x) => <div key={x}>{x}</div>)}
            </Alert>
          ) : null}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: Upload CSV
      ══════════════════════════════════════════════════════════════════════ */}

      {activeTab === "spreadsheet" && (
        <div className="admin-card" style={{ padding: 20, display: "grid", gap: 16 }}>
          {integrationLinked && (
            <Alert color="yellow" variant="light" title="Sync is active">
              Disconnect Google Drive to upload a CSV file.
            </Alert>
          )}
          <div>
            <Text size="sm" fw={600} mb={2}>Upload a CSV file</Text>
            <Text size="xs" c="dimmed" mb={12}>
              Your CSV must have a <code>name</code> column. Download the template above for the full list of supported columns.
              Importing will replace all existing data on this map.
            </Text>

            {(listings.length > 0 || integrationLinked) && (
              <Alert color="yellow" variant="light" mb="md" title="This will overwrite existing data">
                {integrationLinked
                  ? "You have an active integration. Uploading a CSV will disconnect it and replace all synced listings."
                  : `This map has ${listings.length} existing listing${listings.length !== 1 ? "s" : ""}. Importing will replace them.`}
              </Alert>
            )}

            <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 500 }}>Choose file</label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => onPickFile(e.target.files?.[0])}
              style={{ fontSize: 13 }}
            />
            {fileErr && <Alert color="red" variant="light" mt="xs">{fileErr}</Alert>}
          </div>

          <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={geocodeMissing} onChange={(e) => setGeocodeMissing(e.target.checked)} />
            Automatically geocode rows that are missing lat/lng coordinates
          </label>

          {msg && <Alert color="green" variant="light">{msg}</Alert>}
          {err && <Alert color="red" variant="light"><pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{err}</pre></Alert>}

          <Group gap="xs" wrap="wrap">
            <Button
              size="sm"
              onClick={() => rows.length && setImportChoiceOverlayOpen(true)}
              disabled={importing || rows.length === 0}
              loading={importing}
            >
              {importing ? "Importing…" : `Import ${rows.length} row${rows.length !== 1 ? "s" : ""}`}
            </Button>
            <Button size="sm" variant="default" component={Link} to={`/client/maps/${encodeURIComponent(mapId)}`}>
              Done
            </Button>
          </Group>

          {/* CSV preview */}
          {preview.length > 0 && (
            <div>
              <Text size="sm" fw={500} mb={8}>Preview — first {preview.length} rows</Text>
              <div style={{ overflowX: "auto", border: "1px solid var(--lc-border)", borderRadius: 8 }}>
                <table className="admin-table" style={{ marginTop: 0, fontSize: 12 }}>
                  <thead>
                    <tr>
                      {["name","postcode","country","lat","lng","group_name"].map((h) => <th key={h}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i}>
                        <td>{r.name}</td>
                        <td>{r.postcode}</td>
                        <td>{r.country}</td>
                        <td>{r.lat || "—"}</td>
                        <td>{r.lng || "—"}</td>
                        <td>{r.group_name || r.group || r.category || r["group name"] || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: Manual entries
      ══════════════════════════════════════════════════════════════════════ */}

      {activeTab === "manual" && (
        <div style={{ display: "grid", gap: 16 }}>
          {integrationLinked && (
            <Alert color="yellow" variant="light" title="Sync is active">
              Disconnect Google Drive to edit listings manually.
            </Alert>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <Text size="sm" fw={600}>Manual entries</Text>
              <Text size="xs" c="dimmed">Add, edit, or remove individual listings by hand.</Text>
            </div>
            <Button size="sm" leftSection={<Plus size={14} />} onClick={openNewManual} disabled={integrationLinked}>
              Add entry
            </Button>
          </div>

          {listings.length === 0 ? (
            <div className="admin-card" style={{ padding: 32, textAlign: "center" }}>
              <Text size="sm" c="dimmed" mb={12}>No listings yet. Add your first one above.</Text>
              <Button size="sm" variant="light" leftSection={<Plus size={14} />} onClick={openNewManual}>
                Add first entry
              </Button>
            </div>
          ) : (
            <div style={{ overflowX: "auto", border: "1px solid var(--lc-border)", borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid var(--lc-border)", background: "rgba(0,0,0,0.02)" }}>
                    <th style={{ padding: "9px 12px" }}>Name</th>
                    <th style={{ padding: "9px 12px" }}>Address</th>
                    <th style={{ padding: "9px 12px" }}>Group</th>
                    <th style={{ padding: "9px 12px" }}>Source</th>
                    <th style={{ padding: "9px 12px", width: 100 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((listing) => {
                    const src = listing.source || ingestionMethodMap.get(listing.id) || "manual";
                    return (
                      <tr key={listing.id} style={{ borderBottom: "1px solid var(--lc-border)" }}>
                        <td style={{ padding: "8px 12px", fontWeight: 500 }}>{listing.name || "—"}</td>
                        <td style={{ padding: "8px 12px", opacity: 0.7, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{listing.address || "—"}</td>
                        <td style={{ padding: "8px 12px", opacity: 0.7 }}>{groupNameById.get(listing.group_id) || "—"}</td>
                        <td style={{ padding: "8px 12px" }}><SourceBadge source={src} /></td>
                        <td style={{ padding: "8px 12px" }}>
                          <Group gap={4} justify="flex-end">
                            <Button size="xs" variant="subtle" leftSection={<Pencil size={12} />} onClick={() => openEditManual(listing)}>
                              Edit
                            </Button>
                            <Button
                              size="xs" variant="subtle" color="red"
                              leftSection={<Trash2 size={12} />}
                              onClick={() => deleteManualEntry(listing)}
                              loading={deletingId === listing.id}
                              disabled={!!deletingId}
                            >
                              Delete
                            </Button>
                          </Group>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {err && <Alert color="red" variant="light">{err}</Alert>}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: View & edit data
      ══════════════════════════════════════════════════════════════════════ */}

      {activeTab === "branding" && (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
            <div>
              <Text size="sm" fw={600}>All listings</Text>
              <Text size="xs" c="dimmed">Edit logo backgrounds. Source column shows where each listing came from.</Text>
            </div>
            <Button size="sm" variant="subtle" color="red" onClick={clearMapData} loading={clearing} disabled={clearing}>
              Clear all data
            </Button>
          </div>

          <input
            type="text"
            value={dataSearch}
            onChange={(e) => { setDataSearch(e.target.value); setDataPage(0); }}
            placeholder="Filter by name or address…"
            style={{ maxWidth: 380, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13 }}
          />

          <div style={{ overflowX: "auto", border: "1px solid var(--lc-border)", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed", minWidth: 860 }}>
              <colgroup>
                <col style={{ width: "20%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "2px" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "2px" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "32%" }} />
              </colgroup>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--lc-border)", background: "rgba(0,0,0,0.02)" }}>
                  <th style={{ padding: "9px 10px" }}>Name</th>
                  <th style={{ padding: "9px 10px" }}>Group</th>
                  <th style={{ padding: "9px 10px" }}>Source</th>
                  <th style={{ padding: 0, background: "var(--lc-border)", width: 1 }} />
                  <th style={{ padding: "9px 10px" }}>Status</th>
                  <th style={{ padding: 0, background: "var(--lc-border)", width: 1 }} />
                  <th style={{ padding: "9px 10px" }}>Logo</th>
                  <th style={{ padding: "9px 10px" }}>Logo background</th>
                </tr>
              </thead>
              <tbody>
                {pageListings.map((listing) => {
                  const currentBg = listing.logo_bg || "";
                  const src = listing.source || ingestionMethodMap.get(listing.id) || "manual";
                  return (
                    <tr key={listing.id} style={{ borderBottom: "1px solid var(--lc-border)" }}>
                      <td style={{ padding: "8px 10px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={listing.name || "—"}>
                        {listing.name || "—"}
                      </td>
                      <td style={{ padding: "8px 10px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={groupNameById.get(listing.group_id) || "—"}>
                        {groupNameById.get(listing.group_id) || "—"}
                      </td>
                      <td style={{ padding: "8px 10px" }}><SourceBadge source={src} /></td>
                      <td style={{ padding: 0, background: "var(--lc-border)", width: 1 }} />
                      <td style={{ padding: "8px 10px" }}>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={listing.is_active !== false}
                          title={listing.is_active !== false ? "Visible on map — click to hide" : "Hidden from map — click to show"}
                          onClick={() => updateListingActive(listing.id, listing.is_active === false)}
                          style={{
                            display: "inline-flex", alignItems: "center", cursor: "pointer",
                            width: 36, height: 20, borderRadius: 10, border: "none", padding: "0 2px",
                            background: listing.is_active !== false ? "#22c55e" : "#d1d5db",
                            transition: "background 150ms ease", flexShrink: 0,
                          }}
                        >
                          <span style={{
                            display: "block", width: 16, height: 16, borderRadius: "50%", background: "#fff",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                            transform: listing.is_active !== false ? "translateX(16px)" : "translateX(0)",
                            transition: "transform 150ms ease",
                          }} />
                        </button>
                      </td>
                      <td style={{ padding: 0, background: "var(--lc-border)", width: 1 }} />
                      <td style={{ padding: "8px 10px" }}>
                        {listing.logo_url ? (
                          <div
                            title="Hover to preview"
                            style={{ width: 68, height: 48, background: currentBg || "transparent", borderRadius: currentBg ? 6 : 2, padding: currentBg ? "5px 8px" : 0, border: "1px solid var(--lc-border)", display: "inline-flex", alignItems: "center", justifyContent: "center", overflow: "hidden", transition: "transform 120ms ease" }}
                            onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(2)"; e.currentTarget.style.transformOrigin = "left center"; e.currentTarget.style.zIndex = "5"; e.currentTarget.style.position = "relative"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.zIndex = "auto"; e.currentTarget.style.position = "static"; }}
                          >
                            <img src={listing.logo_url} alt={`${listing.name || "Listing"} logo`} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }} />
                          </div>
                        ) : (
                          <span style={{ opacity: 0.5 }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "8px 10px" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "nowrap" }}>
                          {currentBg ? (
                            <span title={currentBg} style={{ width: 12, height: 12, borderRadius: 2, background: currentBg, border: "1px solid rgba(0,0,0,0.2)", flexShrink: 0 }} />
                          ) : (
                            <span style={{ opacity: 0.5, fontSize: 11 }}>none</span>
                          )}
                          {LOGO_BG_SWATCHES.map((swatch) => {
                            const selected = currentBg === swatch.value || (!currentBg && swatch.value === "");
                            return (
                              <button
                                key={swatch.label} type="button"
                                onClick={() => updateListingLogoBg(listing.id, swatch.value)}
                                title={swatch.label}
                                style={{ width: 20, height: 20, borderRadius: 4, border: selected ? "2px solid #2563eb" : "1px solid rgba(0,0,0,0.28)", padding: 0, background: swatch.value || "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                              >
                                {!swatch.value ? <span style={{ fontSize: 10 }}>✕</span> : ""}
                              </button>
                            );
                          })}
                          <label title="Custom colour" style={{ width: 20, height: 20, borderRadius: 4, border: !LOGO_BG_SWATCHES.some((s) => s.value === currentBg) && currentBg ? "2px solid #2563eb" : "1px solid rgba(0,0,0,0.28)", overflow: "hidden", display: "inline-flex", alignItems: "center", justifyContent: "center", background: currentBg || "#fff", cursor: "pointer" }}>
                            <input type="color" value={currentBg || "#d4d4d4"} onChange={(e) => updateListingLogoBg(listing.id, e.target.value)} style={{ width: 24, height: 24, border: "none", padding: 0, background: "transparent" }} aria-label={`Custom logo background for ${listing.name || "listing"}`} />
                          </label>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {pageListings.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: "16px 10px", opacity: 0.6, textAlign: "center" }}>
                      {dataSearch ? "No listings match your search." : "No listings loaded yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <Text size="xs" c="dimmed">
              {totalFilteredListings ? `Showing ${dataStart}–${dataEnd} of ${totalFilteredListings}` : "No listings"}
            </Text>
            <Group gap="xs">
              <Button size="xs" variant="default" onClick={() => setDataPage((p) => Math.max(0, p - 1))} disabled={dataPage <= 0}>Prev</Button>
              <Button size="xs" variant="default" onClick={() => setDataPage((p) => Math.min(Math.max(totalPages - 1, 0), p + 1))} disabled={dataPage >= Math.max(totalPages - 1, 0)}>Next</Button>
            </Group>
          </div>

          {msg && <Alert color="green" variant="light">{msg}</Alert>}
          {err && <Alert color="red" variant="light">{err}</Alert>}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: Sync History
      ══════════════════════════════════════════════════════════════════════ */}

      {activeTab === "sync_history" && (
        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <Text size="sm" fw={600}>Sync history</Text>
            <Text size="xs" c="dimmed">A log of every Google Sheets sync attempt for this map.</Text>
          </div>
          <SyncHistoryTable mapId={mapId} />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          OVERLAYS
      ══════════════════════════════════════════════════════════════════════ */}

      {/* Import mode choice */}
      {importChoiceOverlayOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)" }} onClick={() => setImportChoiceOverlayOpen(false)}>
          <div className="admin-card" style={{ padding: 24, maxWidth: 380, width: "100%", margin: 16, boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
            <Text fw={600} size="md" mb={4}>How should this data be added?</Text>
            <Text size="xs" c="dimmed" mb={16}>
              You have {listings.length} existing listing{listings.length !== 1 ? "s" : ""}. Choose whether to replace them or add to them.
            </Text>
            <Stack gap="xs">
              <Button fullWidth type="button" color="red" variant="light" onClick={() => doImport("overwrite")} disabled={importing} loading={importing}>
                Replace all existing data
              </Button>
              <Button fullWidth variant="default" type="button" onClick={() => doImport("append")} disabled={importing}>
                Add to existing data
              </Button>
              <Button fullWidth variant="subtle" color="gray" type="button" onClick={() => setImportChoiceOverlayOpen(false)}>
                Cancel
              </Button>
            </Stack>
          </div>
        </div>
      )}

      {/* Importing spinner */}
      {importing && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1001, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}>
          <div className="admin-card" style={{ padding: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, boxShadow: "0 8px 32px rgba(0,0,0,0.25)" }}>
            <Loader size="md" />
            <Text size="sm" fw={500}>Importing data…</Text>
            <Text size="xs" c="dimmed">This may take a moment.</Text>
          </div>
        </div>
      )}

      {/* Manual entry modal */}
      {manualModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", padding: 16 }} onClick={closeManual}>
          <div className="admin-card" style={{ padding: 24, maxWidth: 520, width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.22)" }} onClick={(e) => e.stopPropagation()}>
            <Text fw={600} size="md" mb={16}>{manualModal === "new" ? "Add new entry" : `Edit: ${editingListing?.name || ""}`}</Text>
            <form onSubmit={saveManualEntry}>
              <Stack gap="sm">
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>Name <span style={{ color: "red" }}>*</span></label>
                  <input value={manualForm.name} onChange={(e) => mfSet("name", e.target.value)} required placeholder="e.g. Acme Ltd" style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>Address</label>
                  <input value={manualForm.address} onChange={(e) => mfSet("address", e.target.value)} placeholder="e.g. 1 Example Street, London" style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13 }} />
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <label style={{ fontSize: 13, fontWeight: 500 }}>Group</label>
                    <button
                      type="button"
                      style={{ fontSize: 12, color: "var(--lc-brand, #4a9baa)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                      onClick={() => { setAddGroupModal(true); setNewGroupName(""); }}
                    >
                      + Add group
                    </button>
                  </div>
                  <select value={manualForm.group_id} onChange={(e) => mfSet("group_id", e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13 }}>
                    <option value="">No group</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>

                  {addGroupModal && (
                    <div style={{ marginTop: 8, padding: "12px 14px", background: "#f9fafb", border: "1px solid var(--lc-border)", borderRadius: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>New group name</div>
                      <form onSubmit={saveNewGroup} style={{ display: "flex", gap: 8 }}>
                        <input
                          autoFocus
                          value={newGroupName}
                          onChange={(e) => setNewGroupName(e.target.value)}
                          placeholder="e.g. Cafés"
                          style={{ flex: 1, padding: "6px 10px", borderRadius: 7, border: "1px solid var(--lc-border)", fontSize: 13 }}
                          required
                        />
                        <button type="submit" className="btn btn-primary" style={{ fontSize: 13, padding: "6px 14px" }} disabled={savingGroup}>
                          {savingGroup ? "Saving…" : "Add"}
                        </button>
                        <button type="button" className="btn" style={{ fontSize: 13, padding: "6px 10px" }} onClick={() => setAddGroupModal(false)}>
                          Cancel
                        </button>
                      </form>
                    </div>
                  )}
                </div>
                <Group gap="sm" grow>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>Latitude</label>
                    <input value={manualForm.lat} onChange={(e) => mfSet("lat", e.target.value)} placeholder="e.g. 51.5074" type="text" inputMode="decimal" style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>Longitude</label>
                    <input value={manualForm.lng} onChange={(e) => mfSet("lng", e.target.value)} placeholder="e.g. -0.1278" type="text" inputMode="decimal" style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13 }} />
                  </div>
                </Group>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>Website URL</label>
                  <input value={manualForm.website_url} onChange={(e) => mfSet("website_url", e.target.value)} placeholder="https://…" type="url" style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13 }} />
                </div>
                <Group gap="sm" grow>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>Email</label>
                    <input value={manualForm.email} onChange={(e) => mfSet("email", e.target.value)} placeholder="hello@…" type="email" style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>Phone</label>
                    <input value={manualForm.phone} onChange={(e) => mfSet("phone", e.target.value)} placeholder="+44…" style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13 }} />
                  </div>
                </Group>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>Logo URL</label>
                  <input value={manualForm.logo_url} onChange={(e) => mfSet("logo_url", e.target.value)} placeholder="https://…/logo.png" type="url" style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13 }} />
                </div>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={manualForm.is_active} onChange={(e) => mfSet("is_active", e.target.checked)} />
                  Active (visible on map)
                </label>

                {manualErr && <Alert color="red" variant="light">{manualErr}</Alert>}

                <Group gap="xs" justify="flex-end" mt={4}>
                  <Button variant="default" size="sm" type="button" onClick={closeManual}>Cancel</Button>
                  <Button size="sm" type="submit" loading={savingManual}>
                    {manualModal === "new" ? "Add entry" : "Save changes"}
                  </Button>
                </Group>
              </Stack>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

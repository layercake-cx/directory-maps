import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Alert, Button, Badge, SegmentedControl, Loader, Overlay, Text, Group, Stack } from "@mantine/core";
import { RefreshCw, FolderOpen, Unlink, FilePlus } from "lucide-react";

function parseCSV(text) {
  const rows = [];
  let cur = [];
  let val = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      val += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      cur.push(val);
      val = "";
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      cur.push(val);
      val = "";
      if (cur.some((c) => String(c).trim() !== "")) rows.push(cur);
      cur = [];
      continue;
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

/** Geocode via Supabase Edge Function (avoids CORS; uses GOOGLE_GEOCODING_API_KEY on server). */
async function geocodeViaServer(supabaseClient, address) {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) {
    return { ok: false, status: "ERROR", lat: null, lng: null };
  }
  const url = `${baseUrl.replace(/\/$/, "")}/functions/v1/geocode_address`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
  } catch (e) {
    return { ok: false, status: "ERROR", lat: null, lng: null };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, status: data?.status || "ERROR", lat: null, lng: null };
  }
  return {
    ok: !!data.ok,
    status: data.status || "ERROR",
    lat: data.lat ?? null,
    lng: data.lng ?? null,
  };
}

export default function ClientMapData() {
  const { mapId } = useParams();

  const [map, setMap] = useState(null);
  const [groups, setGroups] = useState([]);

  const [sheetStatus, setSheetStatus] = useState(null);
  const [sheetMsg, setSheetMsg] = useState("");
  const [sheetErr, setSheetErr] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [spreadsheetInput, setSpreadsheetInput] = useState("");
  const [sheets, setSheets] = useState([]);
  const [sheetsLoading, setSheetsLoading] = useState(false);
  const [sheetsQuery, setSheetsQuery] = useState("");
  const [sheetsErr, setSheetsErr] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncSchedule, setSyncSchedule] = useState(null);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const [fileErr, setFileErr] = useState("");
  const [rows, setRows] = useState([]);
  const [preview, setPreview] = useState([]);

  const [geocodeMissing, setGeocodeMissing] = useState(true);
  const [importing, setImporting] = useState(false);

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [importChoiceOverlayOpen, setImportChoiceOverlayOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [activeTab, setActiveTab] = useState("drive"); // "drive" | "spreadsheet"

  useEffect(() => {
    (async () => {
      const [{ data: m }, { data: g }] = await Promise.all([
        supabase.from("maps").select("id,name").eq("id", mapId).single(),
        supabase.from("groups").select("id,name").eq("map_id", mapId).order("sort_order", { ascending: true }),
      ]);
      setMap(m ?? null);
      setGroups(g ?? []);
    })();
  }, [mapId]);

  async function refreshSheetStatus() {
    try {
      setSheetErr("");
      const [statusRes, srcRes] = await Promise.all([
        supabase.functions.invoke("validate_sheet_source", { body: { mapId } }),
        supabase.from("map_data_sources").select("sync_schedule").eq("map_id", mapId).eq("provider", "google_sheets").maybeSingle(),
      ]);
      if (statusRes.error) throw statusRes.error;
      setSheetStatus(statusRes.data ?? null);
      setSyncSchedule(srcRes.data?.sync_schedule ?? null);
      if (statusRes.data?.connected && !statusRes.data?.sheet?.spreadsheet_id) {
        setShowPicker(true);
        loadSheets();
      }
    } catch (e) {
      setSheetErr(e?.message ?? String(e));
    }
  }

  async function saveSchedule(schedule) {
    try {
      setSavingSchedule(true);
      const { error } = await supabase
        .from("map_data_sources")
        .update({ sync_schedule: schedule || null, updated_at: new Date().toISOString() })
        .eq("map_id", mapId)
        .eq("provider", "google_sheets");
      if (error) throw error;
      setSyncSchedule(schedule || null);
    } catch (e) {
      setSheetErr(e?.message ?? String(e));
    } finally {
      setSavingSchedule(false);
    }
  }

  async function disconnectGoogle() {
    try {
      setConnecting(true);
      setSheetErr("");
      const { error } = await supabase
        .from("map_data_sources")
        .delete()
        .eq("map_id", mapId)
        .eq("provider", "google_sheets");
      if (error) throw error;
      setSheetStatus(null);
      setSheets([]);
      setShowPicker(false);
      setSheetMsg("");
    } catch (e) {
      setSheetErr(e?.message ?? String(e));
    } finally {
      setConnecting(false);
    }
  }

  async function syncNow() {
    try {
      setSyncing(true);
      setSheetErr("");
      setSheetMsg("");
      const { data, error } = await supabase.functions.invoke("sync_sheet_listings", { body: { mapId } });
      if (error) {
        const body = await error.context?.json?.().catch(() => null);
        throw new Error(body?.error ?? body?.message ?? error.message);
      }
      const result = data?.results?.[0];
      if (result?.ok === false) throw new Error(result.error);
      setSheetMsg(`Synced ${result?.rows ?? 0} rows`);
      await refreshSheetStatus();
    } catch (e) {
      setSheetErr(e?.message ?? String(e));
    } finally {
      setSyncing(false);
    }
  }

  async function loadSheets(query = "") {
    try {
      setSheetsLoading(true);
      setSheetsErr("");
      const { data, error } = await supabase.functions.invoke("google_list_sheets", { body: { mapId, query } });
      if (error) {
        const body = await error.context?.json?.().catch(() => null);
        throw new Error(body?.error ?? body?.message ?? error.message);
      }
      if (data?.error) throw new Error(data.error);
      setSheets(data?.files ?? []);
    } catch (e) {
      setSheetsErr(e?.message ?? String(e));
    } finally {
      setSheetsLoading(false);
    }
  }

  useEffect(() => {
    refreshSheetStatus().catch(() => {});
  }, [mapId]);

  async function connectGoogle() {
    try {
      setConnecting(true);
      setSheetErr("");
      setSheetMsg("");
      const returnTo = window.location.href;
      const { data, error } = await supabase.functions.invoke("google_oauth_start", { body: { mapId, returnTo } });
      const serverError = data?.error;
      if (serverError) throw new Error(serverError);
      if (error) {
        const body = await error.context?.json?.().catch(() => null);
        throw new Error(body?.error ?? body?.message ?? error.message);
      }
      if (!data?.authUrl) throw new Error("Missing authUrl");
      window.location.assign(data.authUrl);
    } catch (e) {
      setSheetErr(e?.message ?? String(e));
    } finally {
      setConnecting(false);
    }
  }

  function getSpreadsheetIdError(value) {
    const trimmed = (value || "").trim();
    if (!trimmed) return null;
    if (/drive\.google\.com\/file\/d\//i.test(trimmed)) {
      return "That's a Drive file link, not a Sheet. Copy the URL from the Google Sheets address bar (docs.google.com/spreadsheets/d/…).";
    }
    return null;
  }

  async function selectSheet(spreadsheetId, mimeType, fileName) {
    try {
      setConfiguring(true);
      setSheetErr("");
      setSheetMsg("");
      const { data, error } = await supabase.functions.invoke("google_set_sheet_file", {
        body: { mapId, spreadsheetId, mimeType, fileName },
      });
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

  async function configureSpreadsheet() {
    try {
      setConfiguring(true);
      setSheetErr("");
      setSheetMsg("");
      const input = spreadsheetInput.trim();
      const urlError = getSpreadsheetIdError(input);
      if (urlError) { setSheetErr(urlError); return; }
      const { data, error } = await supabase.functions.invoke("google_set_sheet_file", {
        body: { mapId, spreadsheetId: input },
      });
      const serverError = data?.error;
      if (serverError) throw new Error(serverError);
      if (error) throw error;
      setSheetMsg(`Connected sheet: ${data.sheetName}`);
      await refreshSheetStatus();
    } catch (e) {
      setSheetErr(e?.message ?? String(e));
    } finally {
      setConfiguring(false);
    }
  }

  const groupLookup = useMemo(() => {
    const m = new Map();
    groups.forEach((g) => m.set((g.name || "").trim().toLowerCase(), g.id));
    return m;
  }, [groups]);

  async function clearMapData() {
    if (!confirm("Clear all listing data and groups for this map? This cannot be undone.")) return;
    try {
      setClearing(true);
      setErr("");
      setMsg("");
      const { error: listingsErr } = await supabase.from("listings").delete().eq("map_id", mapId);
      if (listingsErr) throw listingsErr;
      const { error: groupsErr } = await supabase.from("groups").delete().eq("map_id", mapId);
      if (groupsErr) throw groupsErr;
      setGroups([]);
      setMsg("All listings and groups for this map have been removed.");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setClearing(false);
    }
  }

  function downloadTemplate() {
    const header = [
      "id",
      "name",
      "address",
      "postcode",
      "country",
      "lat",
      "lng",
      "website_url",
      "email",
      "phone",
      "logo_url",
      "notes_html",
      "allow_html",
      "group_name",
      "is_active",
    ];

    const sample = [
      ["", "Example Supplier Ltd", "1 Example Street", "SW1A 1AA", "UK", "", "", "https://example.com", "hello@example.com", "", "", "", "false", "", "true"],
    ];

    const toCSV = (arr) =>
      arr
        .map((row) =>
          row
            .map((cell) => {
              const s = String(cell ?? "");
              if (s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
              return s;
            })
            .join(","),
        )
        .join("\n");

    const csv = toCSV([header, ...sample]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "listings-template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function onPickFile(file) {
    setFileErr("");
    setErr("");
    setMsg("");
    setRows([]);
    setPreview([]);

    if (!file) return;

    const name = file.name.toLowerCase();
    if (!name.endsWith(".csv")) {
      setFileErr("Upload CSV only for now (export from Excel as CSV).");
      return;
    }

    const text = await file.text();
    const raw = parseCSV(text);
    if (raw.length < 2) {
      setFileErr("CSV looks empty.");
      return;
    }

    const headers = raw[0].map((h) => String(h).trim().toLowerCase());

    if (!headers.includes("name")) {
      setFileErr("Missing required column: name");
      return;
    }

    const objs = raw.slice(1).map((row) => {
      const o = {};
      headers.forEach((h, idx) => {
        o[h] = row[idx] ?? "";
      });
      return o;
    });

    setRows(objs);
    setPreview(objs.slice(0, 20));
    setMsg(`Loaded ${objs.length} rows.`);
  }

  function getGroupLabel(r) {
    const raw = r.group_name ?? r.group ?? r.category ?? r["group name"] ?? "";
    return String(raw).trim();
  }

  async function doImport(mode) {
    setErr("");
    setMsg("");

    if (!rows.length) {
      setErr("No rows loaded yet.");
      return;
    }

    // 1. Select distinct groups from CSV (normalized key -> display name, first occurrence wins)
    const distinctGroups = new Map();
    for (const r of rows) {
      const label = getGroupLabel(r);
      if (!label) continue;
      const key = label.toLowerCase();
      if (!distinctGroups.has(key)) distinctGroups.set(key, label);
    }

    // 2. Load existing groups for this map and build lookup by name
    const { data: existingGroups } = await supabase
      .from("groups")
      .select("id,name")
      .eq("map_id", mapId)
      .order("sort_order", { ascending: true });
    const lookup = new Map();
    (existingGroups ?? []).forEach((g) => lookup.set((g.name || "").trim().toLowerCase(), g.id));

    // 3. For each distinct CSV group: if no match, create group with new guid and map_id; add id to lookup
    const toCreate = [];
    let sortOrder = (existingGroups?.length ?? 0);
    for (const [key, displayName] of distinctGroups) {
      if (lookup.has(key)) continue;
      const id = crypto.randomUUID();
      toCreate.push({ id, map_id: mapId, name: displayName, sort_order: sortOrder++ });
      lookup.set(key, id);
    }
    if (toCreate.length) {
      const { error: createErr } = await supabase.from("groups").insert(toCreate);
      if (createErr) {
        setErr(createErr.message ?? String(createErr));
        return;
      }
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

      if (latNum !== null && isNaN(latNum)) {
        errors.push(`Row ${rowNum}: lat is not a valid number`);
      } else if (lngNum !== null && isNaN(lngNum)) {
        errors.push(`Row ${rowNum}: lng is not a valid number`);
      } else if ((latNum === null) !== (lngNum === null)) {
        errors.push(`Row ${rowNum}: provide both lat and lng, or leave both blank`);
      }

      const groupKey = getGroupLabel(r).toLowerCase();
      const group_id = groupKey ? lookup.get(groupKey) ?? null : null;

      const allow_html = boolish(r.allow_html);
      const is_active = boolish(r.is_active);

      cleaned.push({
        id,
        map_id: mapId,
        name,
        address: String(r.address ?? "").trim() || null,
        postcode: String(r.postcode ?? "").trim() || null,
        country: String(r.country ?? "").trim() || null,
        lat: latNum,
        lng: lngNum,
        website_url: String(r.website_url ?? "").trim() || null,
        email: String(r.email ?? "").trim() || null,
        phone: String(r.phone ?? "").trim() || null,
        logo_url: String(r.logo_url ?? "").trim() || null,
        notes_html: String(r.notes_html ?? "").trim() || null,
        allow_html: allow_html ?? false,
        group_id,
        is_active: is_active ?? true,
      });
    });

    if (errors.length) {
      setErr(errors.slice(0, 40).join("\n") + (errors.length > 40 ? `\n… +${errors.length - 40} more` : ""));
      return;
    }

    try {
      setImporting(true);
      setImportChoiceOverlayOpen(false);

      if (mode === "overwrite") {
        const { error: delErr } = await supabase.from("listings").delete().eq("map_id", mapId);
        if (delErr) throw new Error(`Delete existing failed: ${delErr.message}`);
      }

      let geocodeOk = 0;
      let geocodeFail = 0;
      let geocodeFailReason = "";
      if (geocodeMissing) {
        for (let i = 0; i < cleaned.length; i++) {
          const r = cleaned[i];
          if (r.lat != null && r.lng != null) continue;

          const parts = [r.address, r.postcode, r.country].filter(Boolean);
          const address = parts.length ? parts.join(", ") : (r.name || "").trim();
          if (!address) continue;

          const geo = await geocodeViaServer(supabase, address);

          r.geocode_status = geo.ok ? "OK" : geo.status;
          r.geocoded_at = new Date().toISOString();

          if (geo.ok) {
            r.lat = geo.lat;
            r.lng = geo.lng;
            geocodeOk++;
          } else {
            geocodeFail++;
            if (!geocodeFailReason) geocodeFailReason = geo.status || "ERROR";
          }

          await new Promise((res) => setTimeout(res, 150));
        }
      }

      // Only send columns that exist on listings (avoids schema errors; requires migration 20250202000000 for geocoded_at)
      const LISTING_UPSERT_KEYS = [
        "id", "map_id", "group_id", "name", "address", "postcode", "country", "city",
        "lat", "lng", "is_active", "website_url", "email", "phone", "logo_url", "notes_html",
        "allow_html", "geocode_status", "geocoded_at",
      ];
      const toUpsert = cleaned.map((row) => {
        const out = {};
        for (const key of LISTING_UPSERT_KEYS) {
          if (Object.prototype.hasOwnProperty.call(row, key)) out[key] = row[key];
        }
        return out;
      });

      const { data, error, status } = await supabase
        .from("listings")
        .upsert(toUpsert, { onConflict: "id" })
        .select("id");

      if (error) throw new Error(`Upsert failed (${status}): ${error.message}`);

      const importCount = data?.length ?? cleaned.length;
      let msg = `Imported ${importCount} rows.`;
      if (geocodeOk > 0) msg += ` Geocoded ${geocodeOk} addresses.`;
      if (geocodeFail > 0) msg += ` ⚠ ${geocodeFail} rows could not be geocoded (${geocodeFailReason}) — check your Supabase GOOGLE_GEOCODING_API_KEY secret.`;
      setMsg(msg);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="page-main">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            <Link to={`/client/maps/${encodeURIComponent(mapId)}`}>← Back to map</Link>
          </div>
          <h2 style={{ margin: "8px 0 0 0" }}>Load data</h2>
          <div style={{ fontSize: 13, opacity: 0.8, marginTop: 6 }}>
            Rows loaded: <strong>{rows.length}</strong>
          </div>
        </div>

        <Group gap="xs" wrap="wrap">
          <Button size="sm" variant="default" onClick={downloadTemplate}>
            Download template
          </Button>
          <Button size="sm" variant="default" component="a" href="/listings-template.csv">
            Template (if hosted)
          </Button>
        </Group>
      </div>

      <div style={{ marginTop: 16 }}>
        <div className="admin-map-tabs" style={{ marginBottom: 12 }}>
          <button
            type="button"
            className={`admin-map-tabs__tab ${activeTab === "drive" ? "is-active" : ""}`}
            onClick={() => setActiveTab("drive")}
          >
            Integrations
          </button>
          <button
            type="button"
            className={`admin-map-tabs__tab ${activeTab === "spreadsheet" ? "is-active" : ""}`}
            onClick={() => setActiveTab("spreadsheet")}
          >
            Spreadsheet / CSV
          </button>
        </div>

        {activeTab === "drive" && (
          <div style={{ display: "grid", gap: 12 }}>

            {/* Integration provider cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>

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
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="26" height="26" style={{ flexShrink: 0 }}>
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" fill="#EA4335"/>
                      </svg>
                      <Text fw={600} size="sm">Google Drive</Text>
                    </Group>
                    {sheetStatus?.connected && (
                      <Badge color="green" variant="light" size="sm">Connected</Badge>
                    )}
                  </Group>

                  {sheetStatus === null && <Text size="xs" c="dimmed">Checking…</Text>}

                  {sheetStatus !== null && !sheetStatus.connected && (
                    <Button size="sm" onClick={connectGoogle} loading={connecting}>
                      Connect
                    </Button>
                  )}

                  {sheetStatus?.connected && sheetStatus?.sheet?.spreadsheet_id && !showPicker && (
                    <Stack gap="sm">
                      <Text size="sm" fw={500} style={{ wordBreak: "break-word" }}>
                        {sheetStatus.sheet.sheet_name || "File connected"}
                      </Text>

                      <div>
                        <Text size="xs" c="dimmed" mb={6}>Auto-sync</Text>
                        <SegmentedControl
                          size="xs"
                          value={syncSchedule ?? "manual"}
                          onChange={(v) => saveSchedule(v === "manual" ? null : v)}
                          disabled={savingSchedule}
                          data={[
                            { label: "Manual", value: "manual" },
                            { label: "Nightly", value: "nightly" },
                          ]}
                        />
                        <Text size="xs" c="dimmed" mt={4}>
                          {sheetStatus.last_synced_at
                            ? `Last synced ${new Date(sheetStatus.last_synced_at).toLocaleString()}`
                            : "Never synced"}
                        </Text>
                      </div>

                      <Group gap="xs" wrap="wrap">
                        <Button
                          size="xs"
                          leftSection={<RefreshCw size={13} />}
                          onClick={syncNow}
                          disabled={syncing || connecting || configuring}
                          loading={syncing}
                        >
                          Sync now
                        </Button>
                        <Button
                          size="xs"
                          variant="default"
                          leftSection={<FolderOpen size={13} />}
                          onClick={() => { setShowPicker(true); loadSheets(); }}
                          disabled={syncing || connecting || configuring}
                        >
                          Change file
                        </Button>
                        <Button
                          size="xs"
                          variant="subtle"
                          color="red"
                          leftSection={<Unlink size={13} />}
                          onClick={disconnectGoogle}
                          disabled={syncing || connecting || configuring}
                          loading={connecting}
                        >
                          Disconnect
                        </Button>
                      </Group>
                    </Stack>
                  )}

                  {sheetStatus?.connected && !sheetStatus?.sheet?.spreadsheet_id && !showPicker && (
                    <Button
                      size="sm"
                      variant="default"
                      leftSection={<FilePlus size={14} />}
                      onClick={() => { setShowPicker(true); loadSheets(); }}
                      disabled={connecting || configuring}
                    >
                      Choose a file
                    </Button>
                  )}
                </Stack>
              </div>

              {/* Microsoft OneDrive — coming soon */}
              <div className="admin-card" style={{ padding: 20, opacity: 0.45, pointerEvents: "none" }}>
                <Stack gap="md">
                  <Group gap="sm">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 23 23" width="26" height="26" style={{ flexShrink: 0 }}>
                      <rect width="10.5" height="10.5" fill="#F25022"/>
                      <rect x="12.5" width="10.5" height="10.5" fill="#7FBA00"/>
                      <rect y="12.5" width="10.5" height="10.5" fill="#00A4EF"/>
                      <rect x="12.5" y="12.5" width="10.5" height="10.5" fill="#FFB900"/>
                    </svg>
                    <Text fw={600} size="sm">OneDrive</Text>
                  </Group>
                  <Badge variant="light" color="gray" size="sm" w="fit-content">Coming soon</Badge>
                </Stack>
              </div>

              {/* Apple iCloud — coming soon */}
              <div className="admin-card" style={{ padding: 20, opacity: 0.45, pointerEvents: "none" }}>
                <Stack gap="md">
                  <Group gap="sm">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 814 1000" width="22" height="26" style={{ flexShrink: 0 }}>
                      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-42.3-150.3-109.2c-58.6-81.5-109.5-209.2-109.5-330.4 0-168.8 111.1-258.1 220.2-258.1 81.3 0 148.6 53.4 198.4 53.4 50.2 0 128.7-56.5 219.1-56.5zm-204.7-96.1c37.5-44.4 64.2-105.9 64.2-167.5 0-8.8-.8-17.7-2.3-25.4-60.5 2.4-132.2 39.6-175.3 89.4-33.4 37.5-64.8 99.8-64.8 162.8 0 9.6 1.6 19.2 2.3 22.3 3.8.7 10 1.6 16.2 1.6 54.3 0 120.5-36.1 159.7-83.2z" fill="#555"/>
                    </svg>
                    <Text fw={600} size="sm">iCloud Drive</Text>
                  </Group>
                  <Badge variant="light" color="gray" size="sm" w="fit-content">Coming soon</Badge>
                </Stack>
              </div>
            </div>

            {/* File picker — shown below cards when active */}
            {sheetStatus?.connected && showPicker && (
              <div className="admin-card" style={{ padding: 16 }}>
                {sheetStatus?.sheet?.spreadsheet_id && (
                  <button type="button" onClick={() => setShowPicker(false)} style={{ background: "none", border: "none", padding: 0, fontSize: 12, cursor: "pointer", opacity: 0.6, marginBottom: 12 }}>
                    ← Back
                  </button>
                )}
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Choose a file from Google Drive</div>
                <input
                  value={sheetsQuery}
                  onChange={(e) => { setSheetsQuery(e.target.value); loadSheets(e.target.value); }}
                  placeholder="Search…"
                  style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13, marginBottom: 8 }}
                />
                {sheetsErr ? (
                  <Alert color="red" variant="light" mb="xs">{sheetsErr}</Alert>
                ) : sheetsLoading ? (
                  <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>Loading…</p>
                ) : sheets.length === 0 ? (
                  <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>No files found.</p>
                ) : (
                  <div style={{ border: "1px solid var(--lc-border)", borderRadius: 8, overflow: "hidden" }}>
                    {sheets.map((f, i) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => selectSheet(f.id, f.mimeType, f.name)}
                        disabled={configuring}
                        style={{
                          width: "100%", textAlign: "left", display: "flex", alignItems: "center",
                          justifyContent: "space-between", padding: "9px 12px",
                          background: i % 2 === 0 ? "var(--lc-card)" : "transparent",
                          border: "none", borderBottom: i < sheets.length - 1 ? "1px solid var(--lc-border)" : "none",
                          cursor: configuring ? "wait" : "pointer", gap: 8,
                        }}
                      >
                        <span style={{ fontSize: 13 }}>{f.name}</span>
                        <span style={{ fontSize: 11, opacity: 0.5, whiteSpace: "nowrap" }}>
                          {f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {sheetErr ? <Alert color="red" variant="light">{sheetErr}</Alert> : null}
            {sheetMsg ? <Alert color="green" variant="light">{sheetMsg}</Alert> : null}
            {sheetStatus?.issues?.length ? (
              <Alert color="yellow" variant="light" title="Issues detected">
                {sheetStatus.issues.map((x) => <div key={x}>{x}</div>)}
              </Alert>
            ) : null}
          </div>
        )}

        {activeTab === "spreadsheet" && (
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 6 }}>Upload CSV</div>
              <input type="file" accept=".csv" onChange={(e) => onPickFile(e.target.files?.[0])} />
              {fileErr ? <Alert color="red" variant="light" mt="xs">{fileErr}</Alert> : null}
            </div>

            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input type="checkbox" checked={geocodeMissing} onChange={(e) => setGeocodeMissing(e.target.checked)} />
              Geocode rows missing lat/lng
            </label>

            <Group gap="xs" wrap="wrap">
              <Button
                type="button"
                size="sm"
                onClick={() => setImportChoiceOverlayOpen(true)}
                disabled={importing || rows.length === 0}
                loading={importing}
              >
                {importing ? "Importing…" : `Import ${rows.length} rows`}
              </Button>
              <Button size="sm" variant="default" component={Link} to={`/client/maps/${encodeURIComponent(mapId)}`}>
                Done
              </Button>
              <Button
                size="sm"
                variant="subtle"
                color="red"
                type="button"
                onClick={clearMapData}
                disabled={clearing}
                loading={clearing}
                style={{ marginLeft: "auto" }}
              >
                Clear data
              </Button>
            </Group>
          </div>
        )}

        {importChoiceOverlayOpen ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.4)",
            }}
            onClick={() => setImportChoiceOverlayOpen(false)}
          >
            <div
              className="admin-card"
              style={{
                padding: 20,
                maxWidth: 360,
                boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: "0 0 12px 0", fontSize: 16 }}>How should this data be added?</h3>
              <Stack gap="xs">
                <Button fullWidth type="button" onClick={() => doImport("overwrite")} disabled={importing} loading={importing}>
                  Overwrite existing data
                </Button>
                <Button fullWidth variant="default" type="button" onClick={() => doImport("append")} disabled={importing}>
                  Add to existing map
                </Button>
                <Button fullWidth variant="subtle" color="gray" type="button" onClick={() => setImportChoiceOverlayOpen(false)}>
                  Cancel
                </Button>
              </Stack>
            </div>
          </div>
        ) : null}

        {importing ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1001,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.5)",
            }}
          >
            <div
              className="admin-card"
              style={{
                padding: 24,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 16,
                boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  border: "3px solid var(--lc-border, #e5e7eb)",
                  borderTopColor: "var(--lc-brand, #4A9BAA)",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              <span style={{ fontSize: 15, fontWeight: 500 }}>Import in progress…</span>
              <span style={{ fontSize: 13, opacity: 0.8 }}>This may take a moment.</span>
            </div>
          </div>
        ) : null}

        {msg ? <Alert color="green" variant="light">{msg}</Alert> : null}
        {err ? <Alert color="red" variant="light"><pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{err}</pre></Alert> : null}
      </div>

      {preview.length ? (
        <div style={{ marginTop: 18 }}>
          <h3 style={{ margin: "0 0 10px 0", fontSize: 16 }}>Preview (first 20 rows)</h3>

          <table className="admin-table" style={{ marginTop: 0 }}>
            <thead>
              <tr>
                {["name", "postcode", "country", "lat", "lng", "group_name"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
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
      ) : null}
    </div>
  );
}


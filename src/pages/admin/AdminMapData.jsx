import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { signOut } from "../../lib/auth";
import AdminLayout from "./AdminLayout.jsx";

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

export default function AdminMapData() {
  const { clientId, mapId } = useParams();
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const pickerApiKey = import.meta.env.VITE_GOOGLE_API_KEY || apiKey;

  const [client, setClient] = useState(null);
  const [map, setMap] = useState(null);
  const [groups, setGroups] = useState([]);

  const [sheetStatus, setSheetStatus] = useState(null);
  const [sheetMsg, setSheetMsg] = useState("");
  const [sheetErr, setSheetErr] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [spreadsheetInput, setSpreadsheetInput] = useState("");

  const [fileErr, setFileErr] = useState("");
  const [rows, setRows] = useState([]); // parsed objects
  const [preview, setPreview] = useState([]);

  const [geocodeMissing, setGeocodeMissing] = useState(true);
  const [importing, setImporting] = useState(false);

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [importChoiceOverlayOpen, setImportChoiceOverlayOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: m }, { data: g }] = await Promise.all([
        supabase.from("clients").select("id,name").eq("id", clientId).single(),
        supabase.from("maps").select("id,name").eq("id", mapId).single(),
        supabase.from("groups").select("id,name").eq("map_id", mapId).order("sort_order", { ascending: true }),
      ]);
      setClient(c ?? null);
      setMap(m ?? null);
      setGroups(g ?? []);
    })();
  }, [clientId, mapId]);

  async function refreshSheetStatus() {
    try {
      setSheetErr("");
      const { data, error } = await supabase.functions.invoke("validate_sheet_source", { body: { mapId } });
      if (error) throw error;
      setSheetStatus(data ?? null);
    } catch (e) {
      setSheetErr(e?.message ?? String(e));
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
      if (error) throw error;
      if (!data?.authUrl) throw new Error("Missing authUrl");
      window.location.assign(data.authUrl);
    } catch (e) {
      const msg = e?.message ?? String(e);
      const isGenericFailure = /failed to send a request to the edge function/i.test(msg);
      setSheetErr(
        isGenericFailure
          ? `${msg}\n\nCheck: (1) You’re logged in as an admin, (2) Edge Functions are deployed (google_oauth_start, google_oauth_callback, etc.), (3) VITE_SUPABASE_URL points to your project. See docs/GOOGLE_SHEETS_SYNC.md.`
          : msg
      );
    } finally {
      setConnecting(false);
    }
  }

  function getSpreadsheetIdError(value) {
    const trimmed = (value || "").trim();
    if (!trimmed) return null;
    // Drive file links (drive.google.com/file/d/...) are not spreadsheet links
    if (/drive\.google\.com\/file\/d\//i.test(trimmed) || /^https?:\/\/drive\.google\.com\/file\//i.test(trimmed)) {
      return "That’s a Google Drive file link. Use the Google Sheet link instead: open the sheet in your browser and copy the URL from the address bar (it should look like docs.google.com/spreadsheets/d/…).";
    }
    return null;
  }

  async function configureSpreadsheet() {
    try {
      setConfiguring(true);
      setSheetErr("");
      setSheetMsg("");
      const input = spreadsheetInput.trim();
      const urlError = getSpreadsheetIdError(input);
      if (urlError) {
        setSheetErr(urlError);
        return;
      }
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
            .join(",")
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

      const lat = String(r.lat ?? "").trim();
      const lng = String(r.lng ?? "").trim();
      const latNum = lat === "" ? null : Number(lat);
      const lngNum = lng === "" ? null : Number(lng);

      if ((latNum === null) !== (lngNum === null)) {
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

      setMsg(`Imported ${data?.length ?? cleaned.length} rows into listings.`);
    } catch (e) {
      setErr(e.message ?? String(e));
    } finally {
      setImporting(false);
    }
  }

  return (
    <AdminLayout
      breadcrumbs={[
        { label: "Customers", path: "/admin/clients" },
        { label: client?.name ?? "…", path: `/admin/clients/${encodeURIComponent(clientId)}` },
        { label: map?.name ?? "Map", path: `/admin/clients/${encodeURIComponent(clientId)}/maps/${encodeURIComponent(mapId)}` },
        { label: "Data" },
      ]}
      rightActions={
        <button onClick={signOut} type="button">
          Sign out
        </button>
      }
    >
      <div className="admin-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              <Link to={`/admin/clients/${encodeURIComponent(clientId)}/maps/${encodeURIComponent(mapId)}`}>
                ← Back to map dashboard
              </Link>
            </div>
            <h2 style={{ margin: "8px 0 0 0" }}>Load data</h2>
            <div style={{ fontSize: 13, opacity: 0.8, marginTop: 6 }}>
              Rows loaded: <strong>{rows.length}</strong>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn" type="button" onClick={downloadTemplate}>
              Download template
            </button>
            <a className="btn" href="/listings-template.csv">
              Template (if hosted)
            </a>
          </div>
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
          <div className="admin-card" style={{ padding: 12, borderRadius: 12, border: "1px solid var(--lc-border)" }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>Google Sheet sync (nightly)</h3>
            <p style={{ margin: "8px 0 0 0", fontSize: 13, opacity: 0.8 }}>
              Connect a Google Sheet for this map. Required columns: <strong>id</strong>, <strong>name</strong>.
            </p>

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btn btn-primary" type="button" onClick={connectGoogle} disabled={connecting}>
                {connecting ? "Connecting…" : "Connect Google Drive"}
              </button>
              <button className="btn" type="button" onClick={refreshSheetStatus}>
                Refresh status
              </button>
            </div>

            {!sheetStatus?.connected ? (
              <p style={{ margin: "10px 0 0 0", fontSize: 13, color: "var(--lc-fg-muted)" }}>
                Click <strong>Connect Google Drive</strong> above and sign in with the Google account that has access to your sheet. Then come back here and paste the sheet URL.
              </p>
            ) : null}
            <div style={{ marginTop: 12, display: "grid", gap: 8, maxWidth: 560 }}>
              <div style={{ fontSize: 13, opacity: 0.85 }}>Spreadsheet URL or ID</div>
              <input
                value={spreadsheetInput}
                onChange={(e) => {
                  setSpreadsheetInput(e.target.value);
                  if (sheetErr && !getSpreadsheetIdError(e.target.value)) setSheetErr("");
                }}
                placeholder="Paste Google Sheet URL (…/spreadsheets/d/<id>/…) or the raw id"
                disabled={!sheetStatus?.connected}
              />
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  className="btn"
                  type="button"
                  onClick={configureSpreadsheet}
                  disabled={configuring || !spreadsheetInput.trim() || !sheetStatus?.connected}
                >
                  {configuring ? "Saving…" : "Use this sheet"}
                </button>
                {pickerApiKey ? (
                  <span style={{ fontSize: 12, opacity: 0.7 }}>
                    (Optional) Set `VITE_GOOGLE_API_KEY` for Drive picker later.
                  </span>
                ) : null}
              </div>
            </div>

            {sheetMsg ? <p style={{ margin: "10px 0 0 0" }}>{sheetMsg}</p> : null}
            {sheetErr ? <pre style={{ margin: "10px 0 0 0", whiteSpace: "pre-wrap" }}>{sheetErr}</pre> : null}
            {sheetStatus ? (
              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
                Status:{" "}
                <strong>
                  {sheetStatus.connected
                    ? sheetStatus.configured
                      ? sheetStatus.ok
                        ? "Validated"
                        : "Needs attention"
                      : "Connected (pick a sheet)"
                    : "Not connected"}
                </strong>
                {sheetStatus.issues?.length ? (
                  <div style={{ marginTop: 6 }}>
                    Issues:
                    <ul style={{ margin: "6px 0 0 18px" }}>
                      {sheetStatus.issues.slice(0, 10).map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div>
            <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 6 }}>Upload CSV</div>
            <input type="file" accept=".csv" onChange={(e) => onPickFile(e.target.files?.[0])} />
            {fileErr ? <p style={{ marginTop: 8 }}>{fileErr}</p> : null}
          </div>

          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="checkbox" checked={geocodeMissing} onChange={(e) => setGeocodeMissing(e.target.checked)} />
            Geocode rows missing lat/lng
          </label>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => setImportChoiceOverlayOpen(true)}
              disabled={importing || rows.length === 0}
            >
              {importing ? "Importing…" : `Import ${rows.length} rows`}
            </button>

            <Link className="btn" to={`/admin/clients/${encodeURIComponent(clientId)}/maps/${encodeURIComponent(mapId)}`}>
              Done
            </Link>

            <button
              className="btn"
              type="button"
              onClick={clearMapData}
              disabled={clearing}
              style={{ marginLeft: "auto" }}
            >
              {clearing ? "Clearing…" : "Clear data"}
            </button>
          </div>

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
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => doImport("overwrite")}
                    disabled={importing}
                  >
                    Overwrite existing data
                  </button>
                  <button className="btn" type="button" onClick={() => doImport("append")} disabled={importing}>
                    Add to existing map
                  </button>
                  <button className="btn" type="button" onClick={() => setImportChoiceOverlayOpen(false)}>
                    Cancel
                  </button>
                </div>
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

          {msg ? <p style={{ margin: 0 }}>{msg}</p> : null}
          {err ? <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{err}</pre> : null}
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
    </AdminLayout>
  );
}
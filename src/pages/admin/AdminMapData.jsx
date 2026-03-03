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

async function geocodeGoogle({ apiKey, address }) {
  const url =
    "https://maps.googleapis.com/maps/api/geocode/json?address=" +
    encodeURIComponent(address) +
    "&key=" +
    encodeURIComponent(apiKey);

  const res = await fetch(url);
  const json = await res.json();

  if (json.status !== "OK" || !json.results?.length) {
    return { ok: false, status: json.status || "ERROR", lat: null, lng: null };
  }

  const loc = json.results[0].geometry.location;
  return { ok: true, status: "OK", lat: loc.lat, lng: loc.lng };
}

export default function AdminMapData() {
  const { clientId, mapId } = useParams();
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  const [map, setMap] = useState(null);
  const [groups, setGroups] = useState([]);

  const [fileErr, setFileErr] = useState("");
  const [rows, setRows] = useState([]); // parsed objects
  const [preview, setPreview] = useState([]);

  const [geocodeMissing, setGeocodeMissing] = useState(true);
  const [importing, setImporting] = useState(false);

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

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

  const groupLookup = useMemo(() => {
    const m = new Map();
    groups.forEach((g) => m.set((g.name || "").trim().toLowerCase(), g.id));
    return m;
  }, [groups]);

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

  async function doImport() {

    setErr("");
    setMsg(`Import clicked. rows=${rows.length} mapId=${mapId}`);
    console.log("DO_IMPORT_RUN", { mapId, rows: rows.length });

    setErr("");
    setMsg("");

    if (!rows.length) {
      setErr("No rows loaded yet.");
      return;
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

      const groupName = String(r.group_name ?? "").trim().toLowerCase();
      const group_id = groupName ? groupLookup.get(groupName) ?? null : null;

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

      if (geocodeMissing) {
        if (!apiKey) throw new Error("Missing VITE_GOOGLE_MAPS_API_KEY (needed for geocoding).");

        for (let i = 0; i < cleaned.length; i++) {
          const r = cleaned[i];
          if (r.lat != null && r.lng != null) continue;

          const parts = [r.address, r.postcode, r.country].filter(Boolean);
          if (!parts.length) continue;

          const address = parts.join(", ");
          const geo = await geocodeGoogle({ apiKey, address });

          r.geocode_status = geo.ok ? "OK" : geo.status;
          r.geocoded_at = new Date().toISOString();

          if (geo.ok) {
            r.lat = geo.lat;
            r.lng = geo.lng;
          }

          await new Promise((res) => setTimeout(res, 150));
        }
      }

      const { data, error, status } = await supabase
        .from("listings")
        .upsert(cleaned, { onConflict: "id" })
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
      title={`Admin · ${map?.name ?? "Map"} · Data`}
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
            <p style={{ margin: "8px 0", opacity: 0.7 }}>
  Debug: AdminMapData.jsx loaded at {new Date().toLocaleTimeString()}
</p>
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
          <div>
            <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 6 }}>Upload CSV</div>
            <input type="file" accept=".csv" onChange={(e) => onPickFile(e.target.files?.[0])} />
            {fileErr ? <p style={{ marginTop: 8 }}>{fileErr}</p> : null}
          </div>

          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="checkbox" checked={geocodeMissing} onChange={(e) => setGeocodeMissing(e.target.checked)} />
            Geocode rows missing lat/lng
          </label>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button className="btn btn-primary" type="button" onClick={doImport} disabled={importing || rows.length === 0}>
              {importing ? "Importing…" : `Import ${rows.length} rows`}
            </button>

            <Link className="btn" to={`/admin/clients/${encodeURIComponent(clientId)}/maps/${encodeURIComponent(mapId)}`}>
              Done
            </Link>
          </div>

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
                    <td>{r.group_name || "—"}</td>
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
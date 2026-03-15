import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { signOut } from "../../lib/auth";
import AdminLayout from "./AdminLayout.jsx";

/** Geocode via Supabase Edge Function. No auth header: deploy with --no-verify-jwt (see scripts/test-geocode.md). */
async function geocodeViaServer(supabaseClient, address) {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) {
    return { ok: false, status: "ERROR", error_message: "Missing VITE_SUPABASE_URL", lat: null, lng: null };
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
    return { ok: false, status: "ERROR", error_message: (e?.message || "Network error") + " – check connection and that the function is deployed.", lat: null, lng: null };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error_message || data?.error || res.statusText || `HTTP ${res.status}`;
    let hint = "";
    if (res.status === 404) hint = " Is geocode_address deployed and VITE_SUPABASE_URL correct (Dashboard → Settings → API)?";
    if (res.status === 401) hint = " Redeploy with: supabase functions deploy geocode_address --no-verify-jwt (see scripts/test-geocode.md).";
    return { ok: false, status: "ERROR", error_message: msg + hint, lat: null, lng: null };
  }
  return {
    ok: !!data.ok,
    status: data.status || "ERROR",
    error_message: data.error_message || null,
    lat: data.lat ?? null,
    lng: data.lng ?? null,
  };
}

export default function AdminMapListings() {
  const { clientId, mapId } = useParams();

  const [client, setClient] = useState(null);
  const [map, setMap] = useState(null);
  const [groups, setGroups] = useState([]);
  const [rows, setRows] = useState([]);

  const [q, setQ] = useState("");
  const [groupId, setGroupId] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [geocodingMissing, setGeocodingMissing] = useState(false);

  async function load() {
    try {
      setLoading(true);
      setErr("");

      const [{ data: c }, { data: m, error: me }, { data: g, error: ge }, { data: l, error: le }] =
        await Promise.all([
          supabase.from("clients").select("id,name").eq("id", clientId).single(),
          supabase.from("maps").select("id,name,client_id").eq("id", mapId).single(),
          supabase
            .from("groups")
            .select("id,name")
            .eq("map_id", mapId)
            .order("sort_order", { ascending: true }),
          supabase
            .from("listings")
            .select("id,name,address,postcode,country,lat,lng,group_id,is_active,updated_at")
            .eq("map_id", mapId)
            .order("updated_at", { ascending: false }),
        ]);

      if (me) throw me;
      if (ge) throw ge;
      if (le) throw le;

      // sanity: map belongs to this customer
      if (m.client_id !== clientId) {
        throw new Error("This map does not belong to the selected customer.");
      }

      setClient(c ?? null);
      setMap(m);
      setGroups(g ?? []);
      setRows(l ?? []);
    } catch (e) {
      setErr(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  async function geocodeMissingCoords() {
    setErr("");
    setMsg("");

    const candidates = rows.filter((r) => {
      const hasCoords = r.lat != null && r.lng != null;
      const hasAddressBits = !!(r.address || r.postcode || r.country);
      return !hasCoords && hasAddressBits;
    });

    if (!candidates.length) {
      setErr("No rows without coordinates that have address/postcode/country to geocode.");
      return;
    }

    try {
      setGeocodingMissing(true);
      let updated = 0;
      let geocodedOk = 0;
      let firstGeoStatus = null;
      let firstGeoErrorMessage = null;
      let firstDbError = null;

      for (const r of candidates) {
        const parts = [r.address, r.postcode, r.country].filter(Boolean);
        if (!parts.length) continue;

        const address = parts.join(", ");
        const geo = await geocodeViaServer(supabase, address);

        if (!geo.ok) {
          if (firstGeoStatus == null) {
            firstGeoStatus = geo.status;
            firstGeoErrorMessage = geo.error_message || null;
          }
          continue;
        }
        geocodedOk += 1;

        const { data, error } = await supabase
          .from("listings")
          .update({ lat: geo.lat, lng: geo.lng })
          .eq("id", r.id)
          .eq("map_id", mapId)
          .select("id");

        if (error) {
          if (firstDbError == null) firstDbError = error.message;
          throw error;
        }
        if (data?.length) updated += 1;

        await new Promise((res) => setTimeout(res, 150));
      }

      await load();
      if (updated > 0) {
        setErr("");
        setMsg(`Geocoded ${updated} listing(s).`);
      } else {
        const parts = [];
        if (geocodedOk === 0 && firstGeoStatus) {
          const detail = firstGeoErrorMessage ? ` ${firstGeoErrorMessage}` : "";
          parts.push(`Geocoding failed (${firstGeoStatus}).${detail}`);
        }
        else if (geocodedOk > 0 && updated === 0) parts.push(`${geocodedOk} geocoded but DB update returned no rows (check RLS).`);
        else if (candidates.length > 0) parts.push("No coordinates could be updated.");
        setErr(parts.length ? parts.join(" ") : "No coordinates could be updated.");
      }
      window.setTimeout(() => setMsg(""), 6000);
    } catch (e) {
      setErr(e.message ?? String(e));
    } finally {
      setGeocodingMissing(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId]);

  const groupNameById = useMemo(() => {
    const m = new Map();
    groups.forEach((g) => m.set(g.id, g.name));
    return m;
  }, [groups]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    return rows.filter((r) => {
      if (onlyActive && !r.is_active) return false;
      if (groupId && r.group_id !== groupId) return false;

      if (!query) return true;

      const hay = [
        r.name,
        r.postcode,
        r.country,
        r.id,
        groupNameById.get(r.group_id) || "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(query);
    });
  }, [rows, q, groupId, onlyActive, groupNameById]);

  return (
    <AdminLayout
      breadcrumbs={[
        { label: "Customers", path: "/admin/clients" },
        { label: client?.name ?? "…", path: `/admin/clients/${encodeURIComponent(clientId)}` },
        { label: map?.name ?? "Map", path: `/admin/clients/${encodeURIComponent(clientId)}/maps/${encodeURIComponent(mapId)}` },
        { label: "Listings" },
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
            <h2 style={{ margin: "8px 0 0 0" }}>Listings</h2>
            <div style={{ fontSize: 13, opacity: 0.8, marginTop: 6 }}>
              Showing <strong>{filtered.length}</strong> of <strong>{rows.length}</strong>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn" type="button" onClick={load}>
              Refresh
            </button>

            <button
              className="btn"
              type="button"
              onClick={geocodeMissingCoords}
              disabled={loading || geocodingMissing}
            >
              {geocodingMissing ? "Geocoding…" : "Geocode missing coords"}
            </button>

            {/* next: create listing form */}
            <button className="btn btn-primary" type="button" disabled>
              New listing (next)
            </button>
          </div>
        </div>

        <div className="admin-controls" style={{ marginTop: 14 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, postcode, country, group…"
          />

          <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">All groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>

          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, opacity: 0.85 }}>
            <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
            Active only
          </label>
        </div>

        {loading ? <p style={{ marginTop: 12 }}>Loading…</p> : null}
        {msg ? <p style={{ marginTop: 12, color: msg.startsWith("Geocoded") ? "var(--lc-success, #0a0)" : undefined }}>{msg}</p> : null}
        {err ? <pre style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{err}</pre> : null}

        <table className="admin-table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              {["Name", "Group", "Location", "Coords", "Active", "Updated"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filtered.map((r) => {
              const hasCoords = r.lat != null && r.lng != null;
              return (
                <tr key={r.id}>
                  <td>
                    {/* if you want to reuse your edit page, link it here */}
                    <strong>{r.name}</strong>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>{r.id}</div>
                  </td>

                  <td>{groupNameById.get(r.group_id) || "—"}</td>

                  <td>
                    {(r.postcode || "—") + (r.country ? ` · ${r.country}` : "")}
                  </td>

                  <td>{hasCoords ? "✓" : "—"}</td>

                  <td>{r.is_active ? "Yes" : "No"}</td>

                  <td>{r.updated_at ? new Date(r.updated_at).toLocaleDateString() : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
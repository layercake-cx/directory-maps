import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { signOut } from "../../lib/auth";
import AdminLayout from "./AdminLayout.jsx";

function slugify(input) {
  return (input || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function AdminMapDashboard() {
  const { clientId, mapId } = useParams();
  const navigate = useNavigate();

  const [client, setClient] = useState(null);
  const [map, setMap] = useState(null);

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [defaultLat, setDefaultLat] = useState("");
  const [defaultLng, setDefaultLng] = useState("");
  const [defaultZoom, setDefaultZoom] = useState("");
  const [showListPanel, setShowListPanel] = useState(true);
  const [enableClustering, setEnableClustering] = useState(true);
  const [markerStyle, setMarkerStyle] = useState("pin");
  const [markerColor, setMarkerColor] = useState("#4A9BAA");

  const suggestedSlug = useMemo(() => slugify(name), [name]);
  const finalSlug = (slug || suggestedSlug).trim();

  const embedSrc = useMemo(() => {
    return `${window.location.origin}/#/embed?map=${encodeURIComponent(mapId)}`;
  }, [mapId]);

  const embedIframe = useMemo(() => {
    return `<iframe
  src="${embedSrc}"
  width="100%"
  height="700"
  style="border:0;border-radius:12px"
  loading="lazy">
</iframe>`;
  }, [embedSrc]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr("");
        setMsg("");

        const [{ data: c, error: ce }, { data: m, error: me }] = await Promise.all([
          supabase.from("clients").select("id,name,slug").eq("id", clientId).single(),
          supabase
            .from("maps")
            .select("id,client_id,name,slug,default_lat,default_lng,default_zoom,show_list_panel,enable_clustering,marker_style,marker_color,theme_json")
            .eq("id", mapId)
            .single(),
        ]);

        if (ce) throw ce;
        if (me) throw me;

        if (m.client_id !== clientId) {
          throw new Error("This map does not belong to the selected client.");
        }

        if (!cancelled) {
          setClient(c);
          setMap(m);

          setName(m.name ?? "");
          setSlug(m.slug ?? "");
          setDefaultLat(String(m.default_lat ?? ""));
          setDefaultLng(String(m.default_lng ?? ""));
          setDefaultZoom(String(m.default_zoom ?? ""));
          setShowListPanel(!!m.show_list_panel);
          setEnableClustering(!!m.enable_clustering);
          setMarkerStyle(m.marker_style ?? "pin");
          setMarkerColor(m.marker_color ?? "#4A9BAA");
        }
      } catch (e) {
        if (!cancelled) setErr(e.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clientId, mapId]);

  async function copyEmbed() {
    await navigator.clipboard.writeText(embedIframe);
    setMsg("Embed code copied.");
    window.setTimeout(() => setMsg(""), 1600);
  }

  function openEmbed() {
    window.open(embedSrc, "_blank", "noopener,noreferrer");
  }

  async function saveMap(e) {
    e?.preventDefault?.();
    setErr("");
    setMsg("");

    const cleanName = name.trim();
    if (!cleanName) return setErr("Map name is required.");
    if (!finalSlug) return setErr("Map slug is required.");

    const lat = Number(defaultLat);
    const lng = Number(defaultLng);
    const zoom = Number(defaultZoom);

    if (Number.isNaN(lat) || Number.isNaN(lng)) return setErr("Default lat/lng must be numbers.");
    if (!Number.isInteger(zoom) || zoom < 1 || zoom > 20) return setErr("Zoom must be an integer between 1 and 20.");

    try {
      setSaving(true);

      const { error } = await supabase
        .from("maps")
        .update({
          name: cleanName,
          slug: finalSlug,
          default_lat: lat,
          default_lng: lng,
          default_zoom: zoom,
          show_list_panel: showListPanel,
          enable_clustering: enableClustering,
          marker_style: markerStyle,
          marker_color: markerColor,
        })
        .eq("id", mapId);

      if (error) throw error;

      setMsg("Saved.");
      window.setTimeout(() => setMsg(""), 1600);
    } catch (e2) {
      setErr(e2.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  async function deleteMap() {
    const ok = window.confirm("Delete this map? This will also delete its groups and listings if FK cascade is set.");
    if (!ok) return;

    try {
      setSaving(true);
      setErr("");
      setMsg("");

      const { error } = await supabase.from("maps").delete().eq("id", mapId);
      if (error) throw error;

      navigate(`/admin/clients/${encodeURIComponent(clientId)}`);
    } catch (e2) {
      setErr(e2.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;

  return (
    <AdminLayout
      title={`Admin · ${client?.name ?? "Client"} · ${map?.name ?? "Map"}`}
      rightActions={
        <button onClick={signOut} type="button">
          Sign out
        </button>
      }
    >
      <div className="admin-card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              <Link to={`/admin/clients/${encodeURIComponent(clientId)}`}>← Back to client</Link>
            </div>
            <h2 style={{ margin: "8px 0 4px 0" }}>{map?.name ?? "Map dashboard"}</h2>
            <div style={{ fontSize: 13, opacity: 0.8 }}>
              <strong>Map ID:</strong> {mapId}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button className="btn" type="button" onClick={copyEmbed}>
              Copy embed code
            </button>
            <button className="btn" type="button" onClick={openEmbed}>
              Launch map
            </button>
            <button className="btn btn-primary" type="button" onClick={saveMap} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <Link
  className="btn"
  to={`/admin/clients/${encodeURIComponent(clientId)}/maps/${encodeURIComponent(mapId)}/listings`}
>
  View listings
</Link>
          </div>
        </div>

        {err ? <p style={{ marginTop: 12 }}>{err}</p> : null}
        {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}

        <div style={{ marginTop: 18, display: "grid", gap: 18 }}>
          {/* Edit map details */}
          <section>
            <h3 style={{ margin: "0 0 10px 0", fontSize: 16 }}>Map details</h3>

            <form onSubmit={saveMap}>
              <div style={{ display: "grid", gap: 12 }}>
                <Field label="Name">
                  <input value={name} onChange={(e) => setName(e.target.value)} />
                </Field>

                <Field label="Slug">
                  <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder={suggestedSlug} />
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                    Suggested: <strong>{suggestedSlug || "—"}</strong>
                  </div>
                </Field>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <Field label="Default lat">
                    <input value={defaultLat} onChange={(e) => setDefaultLat(e.target.value)} />
                  </Field>
                  <Field label="Default lng">
                    <input value={defaultLng} onChange={(e) => setDefaultLng(e.target.value)} />
                  </Field>
                  <Field label="Default zoom">
                    <input value={defaultZoom} onChange={(e) => setDefaultZoom(e.target.value)} />
                  </Field>
                </div>

                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={showListPanel}
                      onChange={(e) => setShowListPanel(e.target.checked)}
                    />
                    Show list panel
                  </label>

                  <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={enableClustering}
                      onChange={(e) => setEnableClustering(e.target.checked)}
                    />
                    Enable clustering
                  </label>
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <button className="btn btn-primary" type="submit" disabled={saving}>
                    {saving ? "Saving…" : "Save changes"}
                  </button>

                  <button className="btn" type="button" onClick={deleteMap} disabled={saving}>
                    Delete map
                  </button>
                </div>
              </div>
            </form>
          </section>

          {/* Design config placeholder */}
          <section>
            <h3 style={{ margin: "0 0 10px 0", fontSize: 16 }}>Design</h3>

            <div style={{ display: "grid", gap: 12 }}>
                <Field label="Marker style">
                <select value={markerStyle} onChange={(e) => setMarkerStyle(e.target.value)}>
                    <option value="pin">Pin</option>
                    <option value="dot">Dot</option>
                    <option value="circle">Circle</option>
                </select>
                </Field>

                <Field label="Marker colour (default)">
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <input
                    type="color"
                    value={markerColor}
                    onChange={(e) => setMarkerColor(e.target.value)}
                    style={{ width: 48, height: 40, padding: 0, border: "1px solid #e5e7eb", borderRadius: 10 }}
                    />
                    <input value={markerColor} onChange={(e) => setMarkerColor(e.target.value)} />
                </div>
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                    Groups can override this with their own colour.
                </div>
                </Field>
            </div>
          </section>

          {/* Embed info (handy to see the URL) */}
          <section>
            <h3 style={{ margin: "0 0 10px 0", fontSize: 16 }}>Embed URL</h3>
            <div style={{ fontSize: 13 }}>
              <code style={{ display: "block", padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}>
                {embedSrc}
              </code>
            </div>
          </section>

          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>Data</h3>

                <Link
                className="btn btn-primary"
                to={`/admin/clients/${encodeURIComponent(clientId)}/maps/${encodeURIComponent(mapId)}/data`}
                >
                Manage data
                </Link>
            </div>

            <p style={{ marginTop: 8, opacity: 0.8 }}>
                Upload a spreadsheet to populate listings for this map. Missing coordinates can be geocoded during import.
            </p>

            {/* Optional: you can show a tiny preview table later; the full screen handles it properly */}
            </section>
        </div>
      </div>
    </AdminLayout>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 13, marginBottom: 6, opacity: 0.8 }}>{label}</div>
      <div className="admin-controls" style={{ marginTop: 0 }}>
        {children}
      </div>
    </div>
  );
}
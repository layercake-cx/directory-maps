import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { getClientIdForCurrentUser } from "../../lib/clientAuth";

function slugify(input) {
  return (input || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function ClientMapNew() {
  const navigate = useNavigate();

  const [clientId, setClientId] = useState("");

  const [id, setId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  const [defaultLat, setDefaultLat] = useState("51.5072");
  const [defaultLng, setDefaultLng] = useState("-0.1276");
  const [defaultZoom, setDefaultZoom] = useState("4");

  const [showListPanel, setShowListPanel] = useState(true);
  const [enableClustering, setEnableClustering] = useState(true);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const suggestedSlug = useMemo(() => slugify(name), [name]);
  const finalSlug = (slug || suggestedSlug).trim();

  useEffect(() => {
    (async () => {
      try {
        const idFromUser = await getClientIdForCurrentUser();
        setClientId(idFromUser ?? "");
      } catch (e) {
        setErr(e?.message ?? String(e));
      }
    })();
  }, []);

  async function createMap(e) {
    e.preventDefault();
    setErr("");

    const cleanName = name.trim();
    if (!cleanName) return setErr("Map name is required.");
    if (!finalSlug) return setErr("Map slug is required.");
    if (!clientId) return setErr("Missing client id.");

    const lat = Number(defaultLat);
    const lng = Number(defaultLng);
    const zoom = Number(defaultZoom);

    if (Number.isNaN(lat) || Number.isNaN(lng)) return setErr("Default lat/lng must be numbers.");
    if (!Number.isInteger(zoom) || zoom < 1 || zoom > 20) return setErr("Zoom must be an integer between 1 and 20.");

    try {
      setSaving(true);

      const { error } = await supabase.from("maps").insert({
        id,
        client_id: clientId,
        name: cleanName,
        slug: finalSlug,
        default_lat: lat,
        default_lng: lng,
        default_zoom: zoom,
        show_list_panel: showListPanel,
        enable_clustering: enableClustering,
      });

      if (error) throw error;

      navigate("/client");
    } catch (e2) {
      setErr(e2.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-main">
      <div style={{ marginBottom: 12 }}>
        <Link to="/client">← Back to your maps</Link>
      </div>

      <h2 style={{ marginTop: 0 }}>Create map</h2>

      <form onSubmit={createMap}>
        <div style={{ display: "grid", gap: 14 }}>
          <Field label="Map name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. UK Directory" />
          </Field>

          <Field label="Slug">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={suggestedSlug || "e.g. uk-directory"}
            />
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
              Used in URLs. Suggested: <strong>{suggestedSlug || "—"}</strong>
            </div>
          </Field>

          <Field label="ID">
            <input value={id} onChange={(e) => setId(e.target.value)} />
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
              Internal identifier (text). Default is random UUID string.
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

          {err ? <p style={{ margin: 0 }}>{err}</p> : null}

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? "Creating…" : "Create map"}
            </button>

            <Link className="btn" to="/client">
              Cancel
            </Link>
          </div>
        </div>
      </form>
    </div>
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


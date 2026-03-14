import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { signOut } from "../../lib/auth";
import { getClientIdForCurrentUser } from "../../lib/clientAuth";
import AdminLayout from "../admin/AdminLayout.jsx";
import DirectoryMap from "../../components/DirectoryMap.jsx";
import LogoImage from "../../components/LogoImage.jsx";
import { markerIconDataUrl } from "../../lib/markerIcons";
import "../admin/admin.css";

const TABS = ["detail", "design", "data", "publish"];
const MAP_TYPES = [
  { id: "roadmap", label: "Roadmap" },
  { id: "roadmap_silver", label: "Roadmap (Silver)" },
  { id: "roadmap_dark", label: "Roadmap (Dark)" },
  { id: "satellite", label: "Satellite" },
  { id: "hybrid", label: "Hybrid" },
  { id: "terrain", label: "Terrain" },
];
const PIN_STYLES = [
  { id: "pin", label: "Pin" },
  { id: "teardrop", label: "Teardrop" },
  { id: "dot", label: "Dot" },
  { id: "circle", label: "Circle" },
  { id: "custom", label: "Custom" },
];

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

const EYEDROPPER_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 19l-2 2-4-4-2-2 2-2 4 4 2 2z" />
    <path d="M18 13l-1.5 1.5 2 2 1.5-1.5-2-2z" />
    <path d="M4 8L2 6l6-6 2 2-6 6z" />
    <path d="M14 4l2 2-4 4-2-2 4-4z" />
  </svg>
);

function ColorRow({ value, onChange, ariaLabel }) {
  const colorInputRef = React.useRef(null);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "nowrap" }}>
      <input
        ref={colorInputRef}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 28, height: 28, padding: 0, border: "1px solid var(--lc-border)", borderRadius: 6, cursor: "pointer", flexShrink: 0 }}
        aria-label={ariaLabel}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 72, padding: "6px 8px", fontSize: 12, border: "1px solid var(--lc-border)", borderRadius: 6 }}
        aria-label={`${ariaLabel} hex`}
      />
      <button
        type="button"
        onClick={() => colorInputRef.current?.click()}
        title="Pick colour"
        aria-label="Open colour picker"
        style={{ padding: 6, border: "1px solid var(--lc-border)", borderRadius: 6, background: "var(--lc-card)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        {EYEDROPPER_ICON}
      </button>
    </div>
  );
}

export default function ClientMapDashboard() {
  const { mapId } = useParams();
  const navigate = useNavigate();

  const [client, setClient] = useState(null);
  const [map, setMap] = useState(null);
  const [listings, setListings] = useState([]);
  const [groups, setGroups] = useState([]);

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [overlayTab, setOverlayTab] = useState(null);

  // form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [defaultLat, setDefaultLat] = useState("");
  const [defaultLng, setDefaultLng] = useState("");
  const [defaultZoom, setDefaultZoom] = useState("");
  const [showListPanel, setShowListPanel] = useState(true);
  const [enableClustering, setEnableClustering] = useState(true);
  const [clusterRadius, setClusterRadius] = useState(80);
  const [markerStyle, setMarkerStyle] = useState("pin");
  const [markerColor, setMarkerColor] = useState("#4A9BAA");
  const [customPinUrl, setCustomPinUrl] = useState("");
  const [clusterColor, setClusterColor] = useState("#4A9BAA");
  const [pinBorderColor, setPinBorderColor] = useState("#ffffff");
  const [pinBorderSize, setPinBorderSize] = useState(0);
  const [pinFaviconUrl, setPinFaviconUrl] = useState("");
  const [buttonColor, setButtonColor] = useState("#4A9BAA");

  const [locationQuery, setLocationQuery] = useState("");
  const [geocoding, setGeocoding] = useState(false);

  const [customPinUploading, setCustomPinUploading] = useState(false);
  const [selectedListing, setSelectedListing] = useState(null);
  const [selectedMarkerPoint, setSelectedMarkerPoint] = useState(null);
  const [clampedPanelPosition, setClampedPanelPosition] = useState(null);
  const pinOverlayRef = useRef(null);
  const [publishedConfig, setPublishedConfig] = useState(null);
  const [publishedAt, setPublishedAt] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [mapTypeId, setMapTypeId] = useState("roadmap");
  const [mapOptionsOpen, setMapOptionsOpen] = useState(false);
  const mapOptionsRef = useRef(null);

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

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const mapCenter = useMemo(() => {
    const lat = Number(defaultLat);
    const lng = Number(defaultLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return { lat: 51.5074, lng: -0.1278 };
    return { lat, lng };
  }, [defaultLat, defaultLng]);

  const groupColorById = useMemo(() => {
    const m = new Map();
    (groups || []).forEach((g) => {
      if (g.id && g.color) m.set(g.id, g.color);
    });
    return m;
  }, [groups]);

  const listingsWithColor = useMemo(() => {
    return (listings || []).map((l) => ({
      ...l,
      group_color: l.group_id ? groupColorById.get(l.group_id) : null,
    }));
  }, [listings, groupColorById]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr("");
        setMsg("");

        const currentClientId = await getClientIdForCurrentUser();
        if (!currentClientId) {
          setErr("No client account linked. Use the client dashboard first.");
          setLoading(false);
          return;
        }

        let m = null;
        const [{ data: c, error: ce }, { data: g, error: ge }, { data: l, error: le }] = await Promise.all([
          supabase.from("clients").select("id,name,slug").eq("id", currentClientId).single(),
          supabase.from("groups").select("id,name,color").eq("map_id", mapId).order("sort_order", { ascending: true }),
          supabase
            .from("listings")
            .select("id,name,lat,lng,group_id,is_active,logo_url,website_url,email,phone")
            .eq("map_id", mapId),
        ]);
        if (ce) throw ce;
        if (ge) throw ge;
        if (le) throw le;

        const { data: mapRow, error: me } = await supabase
          .from("maps")
          .select(
            "id,client_id,name,slug,default_lat,default_lng,default_zoom,show_list_panel,enable_clustering,cluster_radius,marker_style,marker_color,theme_json,custom_pin_url,published_config,published_at",
          )
          .eq("id", mapId)
          .eq("client_id", currentClientId)
          .single();

        const msg = String(me?.message || "");
        if (me && (msg.includes("cluster_radius") || msg.includes("custom_pin_url") || msg.includes("published_"))) {
          const { data: mapRowFallback, error: me2 } = await supabase
            .from("maps")
            .select(
              "id,client_id,name,slug,default_lat,default_lng,default_zoom,show_list_panel,enable_clustering,marker_style,marker_color,theme_json",
            )
            .eq("id", mapId)
            .eq("client_id", currentClientId)
            .single();
          if (me2) throw me2;
          m = mapRowFallback;
        } else {
          if (me) throw me;
          m = mapRow;
        }

        if (!cancelled) {
          setClient(c);
          setMap(m);
          setGroups(g ?? []);
          setListings(l ?? []);

          setName(m.name ?? "");
          setSlug(m.slug ?? "");
          setDefaultLat(String(m.default_lat ?? ""));
          setDefaultLng(String(m.default_lng ?? ""));
          setDefaultZoom(String(m.default_zoom ?? ""));
          setShowListPanel(!!m.show_list_panel);
          setEnableClustering(!!m.enable_clustering);
          setClusterRadius(m.cluster_radius ?? 80);
          setMarkerStyle(m.marker_style ?? "pin");
          setMarkerColor(m.marker_color ?? "#4A9BAA");
          setCustomPinUrl(m.custom_pin_url ?? "");
          try {
            const theme = typeof m.theme_json === "string" ? JSON.parse(m.theme_json || "{}") : m.theme_json || {};
            setClusterColor(theme.clusterColor ?? "#4A9BAA");
            setPinBorderColor(theme.pinBorderColor ?? "#ffffff");
            setPinBorderSize(Math.max(0, Math.min(8, Number(theme.pinBorderSize) ?? 0)));
            setPinFaviconUrl(theme.pin_favicon_url ?? "");
            setButtonColor(theme.buttonColor ?? "#4A9BAA");
          } catch (_) {
            setClusterColor("#4A9BAA");
            setPinBorderColor("#ffffff");
            setPinBorderSize(0);
          }
        try {
          const raw = m.published_config;
          let parsed = null;
          if (raw) {
            if (typeof raw === "string") {
              parsed = JSON.parse(raw);
            } else if (typeof raw === "object") {
              parsed = raw;
            }
          }
          setPublishedConfig(parsed);
        } catch {
          setPublishedConfig(null);
        }
        setPublishedAt(m.published_at ?? null);
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
  }, [mapId]);

  useLayoutEffect(() => {
    if (!selectedMarkerPoint || !pinOverlayRef.current) return;
    const el = pinOverlayRef.current;
    const parent = el.offsetParent;
    if (!parent) return;
    const pad = 12;
    const containerW = parent.clientWidth;
    const containerH = parent.clientHeight;
    const panelH = el.offsetHeight;
    const centerY = selectedMarkerPoint.y;
    const idealTop = centerY - panelH / 2;
    const top = Math.max(pad, Math.min(idealTop, containerH - panelH - pad));
    const gap = 31;
    const right = containerW - selectedMarkerPoint.x + gap;
    setClampedPanelPosition({ top, right });
  }, [selectedMarkerPoint, selectedListing]);

  useEffect(() => {
    if (!mapOptionsOpen) return;
    function handleClickOutside(e) {
      if (mapOptionsRef.current && !mapOptionsRef.current.contains(e.target)) setMapOptionsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [mapOptionsOpen]);

  function openOverlay(tab) {
    setOverlayTab((current) => (current === tab ? null : tab));
  }

  function closeOverlay() {
    setOverlayTab(null);
  }

  async function copyEmbed() {
    await navigator.clipboard.writeText(embedIframe);
    setMsg("Embed code copied.");
    window.setTimeout(() => setMsg(""), 1600);
  }

  function openEmbed() {
    window.open(`${window.location.origin}/#/embed?map=${encodeURIComponent(mapId)}`, "_blank");
  }

  async function saveMap(e) {
    e?.preventDefault?.();
    setErr("");
    setMsg("");

    const cleanName = name.trim();
    if (!cleanName) return setErr("Map name is required.");
    if (!slug.trim()) return setErr("Map slug is required.");

    const lat = Number(defaultLat);
    const lng = Number(defaultLng);
    const zoom = Number(defaultZoom);

    if (Number.isNaN(lat) || Number.isNaN(lng)) return setErr("Default lat/lng must be numbers.");
    if (!Number.isInteger(zoom) || zoom < 1 || zoom > 20) return setErr("Zoom must be an integer between 1 and 20.");

    try {
      setSaving(true);

      const existingTheme =
        !map?.theme_json
          ? {}
          : typeof map.theme_json === "string"
          ? (() => {
              try {
                return JSON.parse(map.theme_json);
              } catch (_) {
                return {};
              }
            })()
          : map.theme_json;
      const themeJson = {
        ...existingTheme,
        clusterColor: clusterColor || "#4A9BAA",
        pinBorderColor: pinBorderColor || "#ffffff",
        pinBorderSize: Math.max(0, Math.min(8, Number(pinBorderSize) || 0)),
        pin_favicon_url: (pinFaviconUrl || "").trim() || null,
        buttonColor: (buttonColor || "").trim() || "#4A9BAA",
      };
      const payloadBase = {
        name: cleanName,
        slug: slug.trim(),
        default_lat: lat,
        default_lng: lng,
        default_zoom: zoom,
        show_list_panel: showListPanel,
        enable_clustering: enableClustering,
        marker_style: markerStyle,
        marker_color: markerColor,
        theme_json: themeJson,
      };
      const payloadWithExtras = {
        ...payloadBase,
        cluster_radius: Math.max(20, Math.min(200, Number(clusterRadius) || 80)),
        custom_pin_url: customPinUrl || null,
      };
      let { error } = await supabase.from("maps").update(payloadWithExtras).eq("id", mapId);
      const msg = String(error?.message || "");
      if (error && (msg.includes("cluster_radius") || msg.includes("custom_pin_url"))) {
        ({ error } = await supabase.from("maps").update(payloadBase).eq("id", mapId));
      }
      if (error) throw error;

      setMsg("Saved.");
      window.setTimeout(() => setMsg(""), 1600);
    } catch (e2) {
      setErr(e2.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  const currentPublishConfig = useMemo(
    () => ({
      default_lat: Number(defaultLat) || null,
      default_lng: Number(defaultLng) || null,
      default_zoom: Number(defaultZoom) || null,
      show_list_panel: showListPanel,
      enable_clustering: enableClustering,
      cluster_radius: Math.max(20, Math.min(200, Number(clusterRadius) || 80)),
      marker_style: markerStyle,
      marker_color: markerColor,
      custom_pin_url: customPinUrl || null,
      theme_json: (() => {
        if (!map?.theme_json && !clusterColor && !pinBorderColor && !pinBorderSize && !(pinFaviconUrl || "").trim()) return null;
        let base =
          !map?.theme_json || typeof map.theme_json === "string"
            ? (() => {
                try {
                  return JSON.parse(map?.theme_json || "{}");
                } catch {
                  return {};
                }
              })()
            : map.theme_json || {};
        base = {
          ...base,
          clusterColor: clusterColor || "#4A9BAA",
          pinBorderColor: pinBorderColor || "#ffffff",
          pinBorderSize: Math.max(0, Math.min(8, Number(pinBorderSize) || 0)),
          pin_favicon_url: (pinFaviconUrl || "").trim() || null,
          buttonColor: (buttonColor || "").trim() || "#4A9BAA",
        };
        return base;
      })(),
    }),
    [defaultLat, defaultLng, defaultZoom, showListPanel, enableClustering, clusterRadius, markerStyle, markerColor, customPinUrl, map, clusterColor, pinBorderColor, pinBorderSize, pinFaviconUrl, buttonColor],
  );

  const hasUnpublishedChanges = useMemo(() => {
    const a = currentPublishConfig;
    const b = publishedConfig || null;
    return JSON.stringify(a) !== JSON.stringify(b);
  }, [currentPublishConfig, publishedConfig]);

  async function publishMap() {
    if (!map) return;
    try {
      setPublishing(true);
      setErr("");
      const payloadFull = {
        published_config: currentPublishConfig,
        published_at: new Date().toISOString(),
      };
      let { error } = await supabase.from("maps").update(payloadFull).eq("id", mapId);
      const msg = String(error?.message || "");
      if (error && msg.includes("published_")) {
        ({ error } = await supabase.from("maps").update({ published_config: currentPublishConfig }).eq("id", mapId));
      }
      if (error) throw error;
      setPublishedConfig(currentPublishConfig);
      setPublishedAt(payloadFull.published_at ?? null);
      setMsg("Published.");
      window.setTimeout(() => setMsg(""), 2000);
    } catch (e2) {
      setErr(e2.message ?? String(e2));
    } finally {
      setPublishing(false);
    }
  }

  async function lookupLocation(e) {
    e?.preventDefault?.();
    const q = locationQuery.trim();
    if (!q) return;
    if (!apiKey) {
      setErr("Cannot look up location: missing VITE_GOOGLE_MAPS_API_KEY.");
      return;
    }
    try {
      setGeocoding(true);
      setErr("");
      const url =
        "https://maps.googleapis.com/maps/api/geocode/json?address=" + encodeURIComponent(q) + "&key=" + encodeURIComponent(apiKey);
      const res = await fetch(url);
      const json = await res.json();
      if (json.status !== "OK" || !json.results?.length) {
        throw new Error(`No results for "${q}" (status: ${json.status || "ERROR"})`);
      }
      const loc = json.results[0].geometry.location;
      setDefaultLat(String(loc.lat));
      setDefaultLng(String(loc.lng));
      const approxType = json.results[0].types?.[0] || "";
      const zoomGuess =
        approxType.includes("country") || approxType.includes("continent")
          ? 5
          : approxType.includes("administrative_area_level_1") || approxType.includes("administrative_area_level_2")
          ? 7
          : 10;
      setDefaultZoom(String(zoomGuess));
      setMsg(`Location set from "${q}".`);
      window.setTimeout(() => setMsg(""), 2000);
    } catch (e2) {
      setErr(e2.message ?? String(e2));
    } finally {
      setGeocoding(false);
    }
  }

  async function deleteMap() {
    const ok = window.confirm("Delete this map? This will also delete its groups and listings if FK cascade is set.");
    if (!ok) return;

    try {
      setSaving(true);
      setErr("");
      setMsg("");
      const clientId = await getClientIdForCurrentUser();
      if (!clientId) throw new Error("No client account linked.");
      const { error } = await supabase.from("maps").delete().eq("id", mapId).eq("client_id", clientId);
      if (error) throw error;
      navigate("/client");
    } catch (e2) {
      setErr(e2.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  async function handleCustomPinFile(e) {
    const file = e?.target?.files?.[0];
    if (!file) return;
    const name = (file.name || "").toLowerCase();
    const isSvg = name.endsWith(".svg");
    const isPng = name.endsWith(".png");
    if (!isSvg && !isPng) {
      setErr("Use SVG or PNG only.");
      return;
    }
    if (file.size > 200 * 1024) {
      setErr("File too large (max 200 KB).");
      return;
    }
    setErr("");
    setCustomPinUploading(true);
    try {
      const ext = isSvg ? "svg" : "png";
      const path = `${mapId}/pin.${ext}`;
      const { error: uploadError } = await supabase.storage.from("map-pins").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("map-pins").getPublicUrl(path);
      setCustomPinUrl(urlData.publicUrl);
      setMarkerStyle("custom");
      setMsg("Custom pin uploaded.");
      window.setTimeout(() => setMsg(""), 2000);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setCustomPinUploading(false);
      e.target.value = "";
    }
  }

  if (loading) return <div className="page-main">Loading…</div>;

  return (
    <AdminLayout
      title={`${client?.name ?? "Client"} · ${map?.name ?? "Map"}`}
      backTo="/client"
      mainClassName="admin-main--map-page"
      rightActions={
        <>
          <button className="btn btn-primary" type="button" onClick={saveMap} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={signOut} type="button">
            Sign out
          </button>
        </>
      }
    >
      <div className="admin-map-page">
        <div className="admin-map-page__toolbar">
          <Link to="/client">← Back</Link>
          <div className="admin-map-page__toolbar-tabs">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                className={`admin-map-page__tab ${overlayTab === t ? "is-open" : ""}`}
                onClick={() => openOverlay(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          {msg ? <span className="admin-map-page__toolbar-msg">{msg}</span> : null}
          <div className="admin-map-page__map-options-wrap" ref={mapOptionsRef}>
            <button
              type="button"
              className={`admin-map-page__map-options-btn ${mapOptionsOpen ? "is-open" : ""}`}
              onClick={() => setMapOptionsOpen((o) => !o)}
              aria-expanded={mapOptionsOpen}
              aria-haspopup="true"
            >
              Map options
            </button>
            {mapOptionsOpen && (
              <div className="admin-map-page__map-options-panel" role="menu">
                {MAP_TYPES.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={mapTypeId === id}
                    className={`admin-map-page__map-options-item ${mapTypeId === id ? "is-selected" : ""}`}
                    onClick={() => {
                      setMapTypeId(id);
                      setMapOptionsOpen(false);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="btn btn-primary" type="button" onClick={openEmbed}>
            Launch map
          </button>
          <Link className="btn btn-primary" to={`/client/maps/${encodeURIComponent(mapId)}/listings`}>
            Listings
          </Link>
        </div>

        <div className="admin-map-page__map-wrap">
          {apiKey ? (
            <DirectoryMap
              apiKey={apiKey}
              center={mapCenter}
              zoom={Number(defaultZoom) || 10}
              mapTypeId={mapTypeId}
              listings={listingsWithColor}
              onSelect={(listing, point) => {
                setSelectedListing(listing);
                setSelectedMarkerPoint(point ?? null);
                setClampedPanelPosition(null);
              }}
              defaultMarkerColor={markerColor}
              markerStyle={markerStyle}
              customMarkerIconUrl={markerStyle === "custom" && customPinUrl ? customPinUrl : null}
              height="100%"
              enableClustering={enableClustering}
              clusterRadius={clusterRadius}
              clusterColor={clusterColor}
              pinBorderColor={pinBorderColor}
              pinBorderSize={pinBorderSize}
              pinFaviconUrl={(pinFaviconUrl || "").trim() || null}
            />
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "var(--lc-muted)",
              }}
            >
              Set VITE_GOOGLE_MAPS_API_KEY to show the map.
            </div>
          )}

          {selectedListing ? (
            <div
              ref={pinOverlayRef}
              className="admin-map-pin-overlay"
              role="dialog"
              aria-label="Listing details"
              style={
                selectedMarkerPoint
                  ? {
                      left: "auto",
                      right: clampedPanelPosition?.right ?? 0,
                      top: clampedPanelPosition?.top ?? selectedMarkerPoint.y,
                      bottom: "auto",
                      transform: clampedPanelPosition != null ? "none" : "translateY(-50%)",
                      maxWidth: "min(320px, calc(100% - 24px))",
                    }
                  : undefined
              }
            >
              <button
                type="button"
                className="admin-map-pin-overlay__close"
                onClick={() => { setSelectedListing(null); setSelectedMarkerPoint(null); setClampedPanelPosition(null); }}
                aria-label="Close"
              >
                ×
              </button>
              <div className="admin-map-pin-overlay__body">
                {selectedListing.logo_url ? (
                  <LogoImage
                    src={selectedListing.logo_url}
                    wrapClassName="admin-map-pin-overlay__image-wrap"
                    imgClassName="admin-map-pin-overlay__image"
                    maxWidth={280}
                    maxHeight={80}
                  />
                ) : null}
                <h3 className="admin-map-pin-overlay__name">{selectedListing.name || "—"}</h3>
                {selectedListing.website_url ? (
                  <p className="admin-map-pin-overlay__row">
                    <a
                      href={
                        selectedListing.website_url.startsWith("http")
                          ? selectedListing.website_url
                          : `https://${selectedListing.website_url}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Website
                    </a>
                  </p>
                ) : null}
                {selectedListing.email ? (
                  <p className="admin-map-pin-overlay__row">
                    <a href={`mailto:${selectedListing.email}`}>{selectedListing.email}</a>
                  </p>
                ) : null}
                {selectedListing.phone ? (
                  <p className="admin-map-pin-overlay__row">{selectedListing.phone}</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {/* Overlay */}
        <div className={`admin-map-overlay ${overlayTab ? "is-open" : ""}`} aria-hidden={!overlayTab}>
          <div className="admin-map-overlay__backdrop" onClick={closeOverlay} aria-label="Close overlay" />
          <div
            className="admin-map-overlay__panel"
            role="dialog"
            aria-label={overlayTab ? `${overlayTab} settings` : ""}
          >
            <header className="admin-map-overlay__header">
              <h2 className="admin-map-overlay__title">
                {overlayTab ? overlayTab.charAt(0).toUpperCase() + overlayTab.slice(1) : ""}
              </h2>
              <button
                type="button"
                className="admin-map-overlay__close"
                onClick={closeOverlay}
                aria-label="Close"
              >
                ×
              </button>
            </header>
            <div className="admin-map-overlay__body">
              {err && <p style={{ color: "#b91c1c", marginBottom: 12 }}>{err}</p>}

              {overlayTab === "detail" && (
                <form onSubmit={saveMap}>
                  <div style={{ display: "grid", gap: 12 }}>
                    <Field label="Map name">
                      <input value={name} onChange={(e) => setName(e.target.value)} />
                    </Field>
                    <Field label="Slug">
                      <input value={slug} onChange={(e) => setSlug(e.target.value)} />
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
                    <Field label="Find location (city or country)">
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <input
                          value={locationQuery}
                          onChange={(e) => setLocationQuery(e.target.value)}
                          placeholder="e.g. London, UK or Canada"
                        />
                        <button
                          className="btn"
                          type="button"
                          onClick={lookupLocation}
                          disabled={geocoding}
                        >
                          {geocoding ? "Searching…" : "Search"}
                        </button>
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                        Looks up lat/lng using Google Geocoding and updates the defaults.
                      </div>
                    </Field>
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
                    {enableClustering && (
                      <div>
                        <div style={{ fontSize: 13, marginBottom: 6, opacity: 0.85 }}>
                          Clustering level (radius): <strong>{clusterRadius}</strong> px
                        </div>
                        <input
                          type="range"
                          min={40}
                          max={200}
                          step={10}
                          value={clusterRadius}
                          onChange={(e) => setClusterRadius(Number(e.target.value))}
                          style={{ width: "100%", maxWidth: 280 }}
                        />
                        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                          Higher = more grouping. Updates the map as you drag.
                        </div>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                      <button className="btn btn-primary" type="submit" disabled={saving}>
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button className="btn" type="button" onClick={deleteMap} disabled={saving}>
                        Delete map
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {overlayTab === "design" && (
                <div style={{ display: "grid", gap: 20 }}>
                  <div>
                    <div style={{ fontSize: 13, marginBottom: 10, opacity: 0.85 }}>Pin style</div>
                    <div className="pin-style-grid">
                      {PIN_STYLES.map(({ id, label }) => {
                        const isSelected = markerStyle === id;
                        const isCustom = id === "custom";
                        const src =
                          isCustom && customPinUrl
                            ? customPinUrl
                            : !isCustom
                            ? markerIconDataUrl(id, markerColor, {
                                borderColor: pinBorderColor,
                                borderWidth: pinBorderSize,
                                pinFaviconUrl: (id === "pin" || id === "teardrop") ? pinFaviconUrl : undefined,
                              })
                            : null;
                        return (
                          <button
                            key={id}
                            type="button"
                            className={`pin-style-option ${isSelected ? "is-selected" : ""}`}
                            onClick={() => setMarkerStyle(id)}
                            aria-pressed={isSelected}
                          >
                            <div className="pin-style-option__preview">
                              {src ? (
                                <img src={src} alt="" aria-hidden />
                              ) : (
                                <span style={{ fontSize: 11, color: "var(--lc-muted)" }}>Upload</span>
                              )}
                            </div>
                            <span className="pin-style-option__label">{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <Field label="Marker colour (default)">
                    <ColorRow value={markerColor} onChange={setMarkerColor} ariaLabel="Pin colour" />
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                      Applies to Pin, Dot, Circle. Changes update the map behind.
                    </div>
                  </Field>
                  <Field label="Pin border">
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <ColorRow value={pinBorderColor} onChange={setPinBorderColor} ariaLabel="Pin border colour" />
                      <span style={{ fontSize: 13, opacity: 0.8 }}>Size:</span>
                      <input
                        type="range"
                        min={0}
                        max={8}
                        step={1}
                        value={pinBorderSize}
                        onChange={(e) => setPinBorderSize(Number(e.target.value))}
                        style={{ width: 80 }}
                      />
                      <span style={{ fontSize: 13 }}>{pinBorderSize}px</span>
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                      0 = no border. Updates the map as you change.
                    </div>
                  </Field>
                  {(markerStyle === "pin" || markerStyle === "teardrop") && (
                    <Field label="Image inside pin">
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                        <label className="btn" style={{ margin: 0 }}>
                          {pinFaviconUrl ? "Change image…" : "Upload image"}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (file.size > 48 * 1024) {
                                setErr("Image must be under 48KB (favicon-sized).");
                                return;
                              }
                              const reader = new FileReader();
                              reader.onload = () => {
                                setPinFaviconUrl(reader.result || "");
                                setErr("");
                              };
                              reader.readAsDataURL(file);
                              e.target.value = "";
                            }}
                            style={{ position: "absolute", width: 0, height: 0, opacity: 0 }}
                          />
                        </label>
                        {pinFaviconUrl && (
                          <>
                            <span style={{ fontSize: 12, opacity: 0.8 }}>
                              <img src={pinFaviconUrl} alt="" style={{ maxWidth: 24, maxHeight: 24, objectFit: "contain", verticalAlign: "middle" }} />
                            </span>
                            <button type="button" className="btn" style={{ margin: 0 }} onClick={() => setPinFaviconUrl("")}>Clear</button>
                          </>
                        )}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                        Optional. Small image (favicon-sized, under 48KB) shown inside the pin.
                      </div>
                    </Field>
                  )}
                  {enableClustering && (
                    <Field label="Cluster colour">
                      <ColorRow value={clusterColor} onChange={setClusterColor} ariaLabel="Cluster colour" />
                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                        Colour of cluster circles when clustering is on.
                      </div>
                    </Field>
                  )}
                  <Field label="Website button colour">
                    <ColorRow value={buttonColor} onChange={setButtonColor} ariaLabel="Website button colour" />
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                      Colour of the &quot;Visit website&quot; button on the embedded map. Independent of pin colour.
                    </div>
                  </Field>
                  <div>
                    <div style={{ fontSize: 13, marginBottom: 6, opacity: 0.85 }}>Custom pin</div>
                    <p style={{ fontSize: 12, opacity: 0.8, margin: "0 0 10px 0" }}>
                      SVG or PNG. Max 64×64 recommended. PNG colours are not changed by the map.
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                      <input
                        type="url"
                        value={customPinUrl}
                        onChange={(e) => setCustomPinUrl(e.target.value)}
                        placeholder="Image URL (or upload below)"
                        style={{
                          minWidth: 200,
                          padding: "8px 12px",
                          borderRadius: 10,
                          border: "1px solid var(--lc-border)",
                        }}
                      />
                      <label className="btn" style={{ margin: 0 }}>
                        {customPinUploading ? "Uploading…" : "Upload SVG/PNG"}
                        <input
                          type="file"
                          accept=".svg,.png,image/svg+xml,image/png"
                          onChange={handleCustomPinFile}
                          disabled={customPinUploading}
                          style={{ position: "absolute", width: 0, height: 0, opacity: 0 }}
                        />
                      </label>
                    </div>
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <button
                      className="btn btn-primary"
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        saveMap({ preventDefault: () => {} });
                      }}
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              )}

              {overlayTab === "data" && (
                <div style={{ display: "grid", gap: 12 }}>
                  <p style={{ margin: 0, opacity: 0.9 }}>
                    Upload a spreadsheet or connect a Google Sheet to populate listings. Missing coordinates can be geocoded during
                    import.
                  </p>
                  <Link className="btn btn-primary" to={`/client/maps/${encodeURIComponent(mapId)}/data`}>
                    Manage data
                  </Link>
                </div>
              )}

              {overlayTab === "publish" && (
                <div style={{ display: "grid", gap: 14 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontSize: 13, opacity: 0.85 }}>
                      {publishedAt ? (
                        <>
                          Last published: <strong>{new Date(publishedAt).toLocaleString()}</strong>
                        </>
                      ) : (
                        "This map has not been published yet."
                      )}
                    </div>
                    <button
                      className={`btn btn-primary${!hasUnpublishedChanges || publishing ? " is-disabled" : ""}`}
                      type="button"
                      onClick={publishMap}
                      disabled={!hasUnpublishedChanges || publishing}
                    >
                      {publishing ? "Publishing…" : hasUnpublishedChanges ? "Publish changes" : "Published"}
                    </button>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, marginBottom: 6, opacity: 0.85 }}>Embed URL</div>
                    <code
                      style={{
                        display: "block",
                        padding: 10,
                        border: "1px solid var(--lc-border)",
                        borderRadius: 10,
                        fontSize: 12,
                        wordBreak: "break-all",
                      }}
                    >
                      {embedSrc}
                    </code>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, marginBottom: 6, opacity: 0.85 }}>Embed code</div>
                    <pre
                      style={{
                        margin: 0,
                        padding: 10,
                        border: "1px solid var(--lc-border)",
                        borderRadius: 10,
                        fontSize: 12,
                        overflow: "auto",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {embedIframe}
                    </pre>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button className="btn" type="button" onClick={copyEmbed}>
                      Copy embed code
                    </button>
                    <button className="btn" type="button" onClick={openEmbed}>
                      Launch map
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

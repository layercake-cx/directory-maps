import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { signOut } from "../../lib/auth";
import { getClientIdForCurrentUser } from "../../lib/clientAuth";
import AdminLayout from "../admin/AdminLayout.jsx";
import PublishedMapView from "../../components/PublishedMapView.jsx";
import LogoImage from "../../components/LogoImage.jsx";
import { markerIconDataUrl } from "../../lib/markerIcons";
import "../admin/admin.css";

const TABS = ["detail", "design", "data", "publish", "search"];
const MAP_TYPES = [
  { id: "roadmap", label: "Roadmap" },
  { id: "roadmap_silver", label: "Roadmap (Silver)" },
  { id: "roadmap_dark", label: "Roadmap (Dark)" },
  { id: "roadmap_muted", label: "Roadmap (Muted)" },
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
  const [showSearch, setShowSearch] = useState(true);
  const [showGroupDropdowns, setShowGroupDropdowns] = useState(true);
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
  const [panelBackgroundColor, setPanelBackgroundColor] = useState("#e4f0ff");
  const [panelBackgroundOpacity, setPanelBackgroundOpacity] = useState(0.88);
  const [panelLinkColor, setPanelLinkColor] = useState("#4A9BAA");

  const [locationQuery, setLocationQuery] = useState("");
  const [geocoding, setGeocoding] = useState(false);

  const [customPinUploading, setCustomPinUploading] = useState(false);
  const [selectedListing, setSelectedListing] = useState(null);
  const [selectedMarkerPoint, setSelectedMarkerPoint] = useState(null);
  const [clampedPanelPosition, setClampedPanelPosition] = useState(null);
  const [centerOnListingId, setCenterOnListingId] = useState(null);
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
            setPinBorderSize(Math.max(0, Math.min(15, Number(theme.pinBorderSize) ?? 0)));
            setPinFaviconUrl(theme.pin_favicon_url ?? "");
            setButtonColor(theme.buttonColor ?? "#4A9BAA");
            setPanelBackgroundColor(theme.panelBackgroundColor ?? "#e4f0ff");
            setPanelBackgroundOpacity(theme.panelBackgroundOpacity ?? 0.88);
            setPanelLinkColor(theme.panelLinkColor ?? "#4A9BAA");
            setShowSearch(theme.showSearch !== false);
            setShowGroupDropdowns(theme.showGroupDropdowns !== false);
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
        pinBorderSize: Math.max(0, Math.min(15, Number(pinBorderSize) || 0)),
        pin_favicon_url: (pinFaviconUrl || "").trim() || null,
        buttonColor: (buttonColor || "").trim() || "#4A9BAA",
        panelBackgroundColor: (panelBackgroundColor || "").trim() || "#e4f0ff",
        panelBackgroundOpacity: Math.max(0, Math.min(1, Number(panelBackgroundOpacity) ?? 0.88)),
        panelLinkColor: (panelLinkColor || "").trim() || "#4A9BAA",
        showSearch,
        showGroupDropdowns,
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
          pinBorderSize: Math.max(0, Math.min(15, Number(pinBorderSize) || 0)),
          pin_favicon_url: (pinFaviconUrl || "").trim() || null,
          buttonColor: (buttonColor || "").trim() || "#4A9BAA",
          panelBackgroundColor: (panelBackgroundColor || "").trim() || "#e4f0ff",
          panelBackgroundOpacity: Math.max(0, Math.min(1, Number(panelBackgroundOpacity) ?? 0.88)),
          panelLinkColor: (panelLinkColor || "").trim() || "#4A9BAA",
          showSearch,
          showGroupDropdowns,
        };
        return base;
      })(),
    }),
    [defaultLat, defaultLng, defaultZoom, showListPanel, showSearch, showGroupDropdowns, enableClustering, clusterRadius, markerStyle, markerColor, customPinUrl, map, clusterColor, pinBorderColor, pinBorderSize, pinFaviconUrl, buttonColor, panelBackgroundColor, panelBackgroundOpacity, panelLinkColor],
  );

  const hasUnpublishedChanges = useMemo(() => {
    const a = currentPublishConfig;
    const b = publishedConfig || null;
    return JSON.stringify(a) !== JSON.stringify(b);
  }, [currentPublishConfig, publishedConfig]);

  const editTheme = useMemo(() => {
    const hex = (panelBackgroundColor || "#e4f0ff").trim().replace(/^#/, "");
    const m = hex.match(/.{2}/g);
    const r = m ? parseInt(m[0], 16) : 228;
    const g = m ? parseInt(m[1], 16) : 240;
    const b = m ? parseInt(m[2], 16) : 255;
    const a = Math.max(0, Math.min(1, Number(panelBackgroundOpacity) ?? 0.88));
    return {
      panelBg: `rgba(${r},${g},${b},${a})`,
      panelLinkColor: (panelLinkColor || "").trim() || "#4A9BAA",
      buttonColor: (buttonColor || "").trim() || "#4A9BAA",
    };
  }, [panelBackgroundColor, panelBackgroundOpacity, panelLinkColor, buttonColor]);

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
        <div className="admin-map-page__map-wrap">
          {overlayTab ? (
            <div
              className="admin-map-overlay__backdrop"
              onClick={closeOverlay}
              onKeyDown={(e) => e.key === "Escape" && closeOverlay()}
              aria-label="Close panel"
              role="button"
              tabIndex={0}
            />
          ) : null}
          {apiKey ? (
            <PublishedMapView
              apiKey={apiKey}
              center={mapCenter}
              zoom={Number(defaultZoom) || 10}
              mapTypeId={mapTypeId}
              listings={listings}
              groups={groups}
              showListPanel={showListPanel}
              showSearch={showSearch}
              showGroupDropdowns={showGroupDropdowns}
              enableClustering={enableClustering}
              clusterRadius={clusterRadius}
              markerStyle={markerStyle}
              markerColor={markerColor}
              customPinUrl={markerStyle === "custom" && customPinUrl ? customPinUrl : null}
              clusterColor={clusterColor}
              pinBorderColor={pinBorderColor}
              pinBorderSize={pinBorderSize}
              pinFaviconUrl={(pinFaviconUrl || "").trim() || null}
              theme={editTheme}
              selectedListing={selectedListing}
              selectedMarkerPoint={selectedMarkerPoint}
              clampedPanelPosition={clampedPanelPosition}
              setClampedPanelPosition={setClampedPanelPosition}
              pinOverlayRef={pinOverlayRef}
              onSelectMarker={(listing, point) => {
                setSelectedListing(listing);
                setSelectedMarkerPoint(point ?? null);
                setClampedPanelPosition(null);
              }}
              onClosePin={() => { setSelectedListing(null); setSelectedMarkerPoint(null); setClampedPanelPosition(null); }}
              centerOnListingId={centerOnListingId}
              setCenterOnListingId={setCenterOnListingId}
              showSendMessage={false}
              height="100%"
              listingsWithColor={listingsWithColor}
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
        </div>

        <div className="admin-map-page__right">
          <div className="admin-map-page__controls">
            <h2 className="admin-map-page__controls-title">Map Settings</h2>
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                className={`admin-map-page__tab ${overlayTab === t ? "is-open" : ""}`}
                onClick={() => openOverlay(t)}
              >
                {t === "detail" ? "General" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
            <div className="admin-map-page__map-options-wrap" ref={mapOptionsRef}>
              <button
                type="button"
                className={`admin-map-page__map-options-btn ${mapOptionsOpen ? "is-open" : ""}`}
                onClick={() => setMapOptionsOpen((o) => !o)}
                aria-expanded={mapOptionsOpen}
                aria-haspopup="true"
              >
                Map type
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
            <div className="admin-map-page__controls-footer">
              <button type="button" className="admin-map-page__control-btn admin-map-page__control-btn--primary" onClick={openEmbed}>
                Launch map
              </button>
              <Link to="/client" className="admin-map-page__control-btn">
                Exit
              </Link>
              {msg ? <span className="admin-map-page__toolbar-msg">{msg}</span> : null}
            </div>
          </div>

          <div
            className={`admin-map-overlay__panel ${overlayTab ? "admin-map-overlay__panel--open" : ""}`}
            role="dialog"
            aria-label={overlayTab ? `${overlayTab} settings` : ""}
            aria-hidden={!overlayTab}
          >
            <header className="admin-map-overlay__header">
              <h2 className="admin-map-overlay__title">
                {overlayTab ? (overlayTab === "detail" ? "General" : overlayTab.charAt(0).toUpperCase() + overlayTab.slice(1)) : ""}
              </h2>
              <button type="button" className="admin-map-overlay__close" onClick={closeOverlay} aria-label="Close">
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
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <h3 style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, opacity: 0.9 }}>Pins</h3>
                      <div>
                        <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.85 }}>Style</div>
                        <div className="pin-style-grid">
                          {PIN_STYLES.map(({ id, label }) => {
                            const isSelected = markerStyle === id;
                            const isCustom = id === "custom";
                            const src = isCustom && customPinUrl ? customPinUrl : !isCustom ? markerIconDataUrl(id, markerColor, { borderColor: pinBorderColor, borderWidth: pinBorderSize, pinFaviconUrl: (id === "pin" || id === "teardrop") ? pinFaviconUrl : undefined }) : null;
                            return (
                              <button key={id} type="button" className={`pin-style-option ${isSelected ? "is-selected" : ""}`} onClick={() => setMarkerStyle(id)} aria-pressed={isSelected}>
                                <div className="pin-style-option__preview">{src ? <img src={src} alt="" aria-hidden /> : <span style={{ fontSize: 11, color: "var(--lc-muted)" }}>Upload</span>}</div>
                                <span className="pin-style-option__label">{label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <Field label="Marker colour"><ColorRow value={markerColor} onChange={setMarkerColor} ariaLabel="Pin colour" /></Field>
                      <Field label="Pin border">
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <ColorRow value={pinBorderColor} onChange={setPinBorderColor} ariaLabel="Pin border colour" />
                          <input type="range" min={0} max={15} step={1} value={pinBorderSize} onChange={(e) => setPinBorderSize(Number(e.target.value))} style={{ width: 64 }} />
                          <span style={{ fontSize: 12 }}>{pinBorderSize}px</span>
                        </div>
                      </Field>
                      {(markerStyle === "pin" || markerStyle === "teardrop") && (
                        <Field label="Image inside pin">
                          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                            <label className="btn" style={{ margin: 0 }}>{pinFaviconUrl ? "Change…" : "Upload"}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 48 * 1024) { setErr("Image must be under 48KB."); return; } const reader = new FileReader(); reader.onload = () => { setPinFaviconUrl(reader.result || ""); setErr(""); }; reader.readAsDataURL(file); e.target.value = ""; }} style={{ position: "absolute", width: 0, height: 0, opacity: 0 }} /></label>
                            {pinFaviconUrl && <><span style={{ fontSize: 12, opacity: 0.8 }}><img src={pinFaviconUrl} alt="" style={{ maxWidth: 20, maxHeight: 20, objectFit: "contain", verticalAlign: "middle" }} /></span><button type="button" className="btn" style={{ margin: 0 }} onClick={() => setPinFaviconUrl("")}>Clear</button></>}
                          </div>
                        </Field>
                      )}
                      {enableClustering && <Field label="Cluster colour"><ColorRow value={clusterColor} onChange={setClusterColor} ariaLabel="Cluster colour" /></Field>}
                      <div>
                        <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.85 }}>Custom pin URL</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                          <input type="url" value={customPinUrl} onChange={(e) => setCustomPinUrl(e.target.value)} placeholder="Optional" style={{ flex: "1", minWidth: 120, padding: "6px 10px", fontSize: 13, borderRadius: 8, border: "1px solid var(--lc-border)" }} />
                          <label className="btn" style={{ margin: 0 }}>{customPinUploading ? "…" : "Upload"}<input type="file" accept=".svg,.png,image/svg+xml,image/png" onChange={handleCustomPinFile} disabled={customPinUploading} style={{ position: "absolute", width: 0, height: 0, opacity: 0 }} /></label>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <h3 style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, opacity: 0.9 }}>Panel</h3>
                      <Field label="Background colour"><ColorRow value={panelBackgroundColor} onChange={setPanelBackgroundColor} ariaLabel="Panel background" /></Field>
                      <Field label="Background opacity">
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input type="range" min={0} max={1} step={0.05} value={panelBackgroundOpacity} onChange={(e) => setPanelBackgroundOpacity(Number(e.target.value))} style={{ width: 80 }} />
                          <span style={{ fontSize: 12 }}>{Math.round(panelBackgroundOpacity * 100)}%</span>
                        </div>
                      </Field>
                      <Field label="Link colour"><ColorRow value={panelLinkColor} onChange={setPanelLinkColor} ariaLabel="Panel link colour" /></Field>
                      <Field label="Website button colour"><ColorRow value={buttonColor} onChange={setButtonColor} ariaLabel="Website button colour" /></Field>
                    </div>
                  </div>
                  <div style={{ borderTop: "1px solid var(--lc-border)", paddingTop: 12 }}>
                    <button className="btn btn-primary" type="button" onClick={(e) => { e.preventDefault(); saveMap({ preventDefault: () => {} }); }} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
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

              {overlayTab === "search" && (
                <div style={{ display: "grid", gap: 14 }}>
                  <p style={{ margin: 0, fontSize: 13, opacity: 0.9 }}>Control what appears in the list panel when the map is published.</p>
                  <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input type="checkbox" checked={showSearch} onChange={(e) => setShowSearch(e.target.checked)} />
                    Show search bar
                  </label>
                  <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input type="checkbox" checked={showGroupDropdowns} onChange={(e) => setShowGroupDropdowns(e.target.checked)} />
                    Show group dropdowns
                  </label>
                  <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                    <button className="btn btn-primary" type="button" onClick={() => saveMap()} disabled={saving}>
                      {saving ? "Saving…" : "Save"}
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

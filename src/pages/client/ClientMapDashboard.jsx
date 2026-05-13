import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { signOut } from "../../lib/auth";
import { getClientIdForCurrentUser } from "../../lib/clientAuth";
import { useAuth } from "../../hooks/useAuth.js";
import PublishedMapView from "../../components/PublishedMapView.jsx";
import LogoImage from "../../components/LogoImage.jsx";
import { markerIconDataUrl, normalizePinSize, pinPreviewScale } from "../../lib/markerIcons";
import {
  buildPublicationConfig,
  normalizePublicationConfig,
  publicationConfigsEqual,
} from "../../lib/mapPublication.js";
import PricingPlans from "../../components/PricingPlans.jsx";
import "../admin/admin.css";

const TABS = ["detail", "design", "panels", "data", "publish", "search"];
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
  { id: "ringpin", label: "Ring pin" },
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
  const { user } = useAuth();

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
  const [pinSize, setPinSize] = useState("medium");
  const [markerColor, setMarkerColor] = useState("#4A9BAA");
  const [customPinUrl, setCustomPinUrl] = useState("");
  const [clusterColor, setClusterColor] = useState("#4A9BAA");
  const [pinBorderColor, setPinBorderColor] = useState("#ffffff");
  const [pinBorderSize, setPinBorderSize] = useState(0);
  const [pinFaviconUrl, setPinFaviconUrl] = useState("");
  const [buttonColor, setButtonColor] = useState("#4A9BAA");
  const [panelBackgroundColor, setPanelBackgroundColor] = useState("#ffffff");
  const [panelBackgroundOpacity, setPanelBackgroundOpacity] = useState(0.88);
  const [panelBorderRadius, setPanelBorderRadius] = useState(12);
  const [pinDetailLayout, setPinDetailLayout] = useState("map");
  const [panelLinkColor, setPanelLinkColor] = useState("#4A9BAA");

  const [locationQuery, setLocationQuery] = useState("");
  const [geocoding, setGeocoding] = useState(false);

  const [customPinUploading, setCustomPinUploading] = useState(false);
  const [selectedListing, setSelectedListing] = useState(null);
  const [selectedMarkerPoint, setSelectedMarkerPoint] = useState(null);
  const [clampedPanelPosition, setClampedPanelPosition] = useState(null);
  const [centerOnListingId, setCenterOnListingId] = useState(null);
  const pinOverlayRef = useRef(null);
  const [publishedSnapshot, setPublishedSnapshot] = useState(null);
  const [publicationHistory, setPublicationHistory] = useState([]);
  const [publishNote, setPublishNote] = useState("");
  const [publishedAt, setPublishedAt] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [mapTypeId, setMapTypeId] = useState("roadmap");
  const [mapOptionsOpen, setMapOptionsOpen] = useState(false);
  const mapOptionsRef = useRef(null);

  const [messageDrawerOpen, setMessageDrawerOpen] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
    testToEmail: "",
  });
  const [contactFormSubmitting, setContactFormSubmitting] = useState(false);
  const [contactFormSent, setContactFormSent] = useState(false);
  const [contactFormError, setContactFormError] = useState("");

  // Placeholder for future real billing integration.
  // Layercake domain emails bypass the paywall for internal testing.
  const emailDomain = (user?.email ?? "").split("@")[1] ?? "";
  const hasActiveSubscription = emailDomain.toLowerCase().includes("layercake");

  const embedSrc = useMemo(() => {
    return `${window.location.origin}/#/embed?map=${encodeURIComponent(mapId)}`;
  }, [mapId]);

  const embedIframe = useMemo(() => {
    return `<iframe
  src="${embedSrc}"
  width="100%"
  height="800"
  style="border:0;border-radius:12px"
  loading="lazy">
</iframe>`;
  }, [embedSrc]);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const ENVIRONMENT = import.meta.env.VITE_ENVIRONMENT || "preview";
  const isProductionEnv = ENVIRONMENT === "production";
  const mapCenter = useMemo(() => {
    const lat = Number(defaultLat);
    const lng = Number(defaultLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return { lat: 51.5074, lng: -0.1278 };
    return { lat, lng };
  }, [defaultLat, defaultLng]);

  const groupOverridesById = useMemo(() => {
    const m = new Map();
    (groups || []).forEach((g) => {
      if (!g.id) return;
      const raw = g.theme_json;
      const theme =
        typeof raw === "string"
          ? (() => {
              try {
                return JSON.parse(raw || "{}");
              } catch {
                return {};
              }
            })()
          : raw || {};
      if (!theme || typeof theme !== "object") {
        m.set(g.id, {});
        return;
      }
      m.set(g.id, {
        marker_style: theme.marker_style ?? theme.markerStyle ?? null,
        marker_color: theme.marker_color ?? theme.markerColor ?? g.color ?? null,
        custom_pin_url: theme.custom_pin_url ?? null,
        pin_favicon_url: theme.pin_favicon_url ?? null,
        pin_favicon_mode: theme.pin_favicon_mode ?? "inherit",
        pinBorderColor: theme.pinBorderColor ?? null,
        pinBorderSize: theme.pinBorderSize != null ? theme.pinBorderSize : null,
        pinSize:
          theme.pinSize != null && theme.pinSize !== "" ? normalizePinSize(theme.pinSize) : null,
      });
    });
    return m;
  }, [groups]);

  const listingsWithColor = useMemo(() => {
    return (listings || []).map((l) => {
      const overrides = l.group_id ? groupOverridesById.get(l.group_id) || {} : {};
      return {
        ...l,
        group_color: overrides.marker_color || null,
        group_marker_style: overrides.marker_style || null,
        group_custom_pin_url: overrides.custom_pin_url || null,
        group_pin_favicon_url: overrides.pin_favicon_url || null,
        group_pin_favicon_mode: overrides.pin_favicon_mode || "inherit",
        group_pin_border_color: overrides.pinBorderColor || null,
        group_pin_border_size:
          typeof overrides.pinBorderSize === "number" ? overrides.pinBorderSize : null,
        group_pin_size: overrides.pinSize != null && overrides.pinSize !== "" ? overrides.pinSize : null,
      };
    });
  }, [listings, groupOverridesById]);

  const draftPublicationConfig = useMemo(
    () =>
      buildPublicationConfig({
        groups,
        defaultLat,
        defaultLng,
        defaultZoom,
        showListPanel,
        enableClustering,
        clusterRadius,
        markerStyle,
        markerColor,
        customPinUrl,
        clusterColor,
        pinBorderColor,
        pinBorderSize,
        pinFaviconUrl,
        buttonColor,
        panelBackgroundColor,
        panelBackgroundOpacity,
        panelBorderRadius,
        pinDetailLayout,
        panelLinkColor,
        pinSize,
        showSearch,
        showGroupDropdowns,
        mapThemeJsonBase: map?.theme_json,
      }),
    [
      groups,
      defaultLat,
      defaultLng,
      defaultZoom,
      showListPanel,
      enableClustering,
      clusterRadius,
      markerStyle,
      markerColor,
      customPinUrl,
      clusterColor,
      pinBorderColor,
      pinBorderSize,
      pinFaviconUrl,
      buttonColor,
      panelBackgroundColor,
      panelBackgroundOpacity,
      panelBorderRadius,
      pinDetailLayout,
      panelLinkColor,
      pinSize,
      showSearch,
      showGroupDropdowns,
      map?.theme_json,
    ],
  );

  const hasUnpublishedChanges = useMemo(() => {
    const draft = draftPublicationConfig;
    const pub = publishedSnapshot;
    if (!pub) return true;
    return !publicationConfigsEqual(draft, pub);
  }, [draftPublicationConfig, publishedSnapshot]);

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
          supabase
            .from("groups")
            .select("id,name,sort_order,color,theme_json")
            .eq("map_id", mapId)
            .order("sort_order", { ascending: true }),
          supabase
            .from("listings")
            .select("id,name,lat,lng,group_id,is_active,logo_url,website_url,email,phone,address,notes_html,allow_html")
            .eq("map_id", mapId),
        ]);
        if (ce) throw ce;
        if (ge) throw ge;
        if (le) throw le;

        const { data: mapRow, error: me } = await supabase
          .from("maps")
          .select(
            "id,client_id,name,slug,default_lat,default_lng,default_zoom,show_list_panel,enable_clustering,cluster_radius,marker_style,marker_color,theme_json,custom_pin_url,published_config,published_at,current_publication_id",
          )
          .eq("id", mapId)
          .eq("client_id", currentClientId)
          .single();

        const msg = String(me?.message || "");
        if (
          me &&
          (msg.includes("cluster_radius") ||
            msg.includes("custom_pin_url") ||
            msg.includes("published_") ||
            msg.includes("current_publication"))
        ) {
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
            setPinFaviconUrl(
              String(theme.pin_favicon_url ?? theme.pinFaviconUrl ?? "").trim(),
            );
            setButtonColor(theme.buttonColor ?? "#4A9BAA");
            setPanelBackgroundColor(theme.panelBackgroundColor ?? "#ffffff");
            setPanelBackgroundOpacity(theme.panelBackgroundOpacity ?? 0.88);
            setPanelBorderRadius(Math.max(0, Math.min(28, Number(theme.panelBorderRadius) ?? 12)));
            setPinDetailLayout(theme.pinDetailLayout === "drawer" ? "drawer" : "map");
            setPanelLinkColor(theme.panelLinkColor ?? "#4A9BAA");
            setPinSize(normalizePinSize(theme.pinSize));
            setShowSearch(theme.showSearch !== false);
            setShowGroupDropdowns(theme.showGroupDropdowns !== false);
          } catch (_) {
            setClusterColor("#4A9BAA");
            setPinBorderColor("#ffffff");
            setPinBorderSize(0);
            setPinSize("medium");
          }
        try {
          let snapshot = null;
          let pubAt = m.published_at ?? null;
          if (m.current_publication_id) {
            const { data: pub, error: pubErr } = await supabase
              .from("map_publications")
              .select("config,published_at")
              .eq("id", m.current_publication_id)
              .single();
            if (!pubErr && pub?.config) {
              snapshot = normalizePublicationConfig(pub.config);
              pubAt = pub.published_at;
            }
          }
          if (!snapshot && m.published_config) {
            const raw = m.published_config;
            let parsed = null;
            if (typeof raw === "string") {
              try {
                parsed = JSON.parse(raw);
              } catch {
                parsed = null;
              }
            } else if (typeof raw === "object") {
              parsed = raw;
            }
            snapshot = normalizePublicationConfig(parsed);
          }
          setPublishedSnapshot(snapshot);
          setPublishedAt(pubAt);
          const { data: hist, error: histErr } = await supabase.rpc("list_map_publications", {
            p_map_id: mapId,
          });
          if (!histErr) setPublicationHistory(hist ?? []);
          else setPublicationHistory([]);
        } catch {
          setPublishedSnapshot(null);
          setPublicationHistory([]);
        }
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

  function parseGroupThemeJson(raw) {
    if (raw == null) return {};
    if (typeof raw === "object" && !Array.isArray(raw)) return { ...raw };
    if (typeof raw === "string") {
      try {
        const o = JSON.parse(raw || "{}");
        return typeof o === "object" && o !== null && !Array.isArray(o) ? o : {};
      } catch {
        return {};
      }
    }
    return {};
  }

  function effectiveCategoryPinColor(groupRow) {
    const t = parseGroupThemeJson(groupRow.theme_json);
    const v = t.marker_color ?? t.markerColor ?? groupRow.color ?? markerColor ?? "#4A9BAA";
    return String(v).trim() || "#4A9BAA";
  }

  async function persistCategoryPinColor(groupRow, hex) {
    try {
      setErr("");
      const t = parseGroupThemeJson(groupRow.theme_json);
      const nextTheme = { ...t, marker_color: hex };
      const { error } = await supabase
        .from("groups")
        .update({ color: hex, theme_json: nextTheme })
        .eq("id", groupRow.id)
        .eq("map_id", mapId);
      if (error) throw error;
      setGroups((prev) =>
        (prev || []).map((g) => (g.id === groupRow.id ? { ...g, color: hex, theme_json: nextTheme } : g)),
      );
    } catch (e2) {
      setErr(e2.message ?? String(e2));
    }
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
        pinSize: normalizePinSize(pinSize),
        buttonColor: (buttonColor || "").trim() || "#4A9BAA",
        panelBackgroundColor: (panelBackgroundColor || "").trim() || "#ffffff",
        panelBackgroundOpacity: Math.max(0, Math.min(1, Number(panelBackgroundOpacity) ?? 0.88)),
        panelBorderRadius: Math.max(0, Math.min(28, Number(panelBorderRadius) || 12)),
        pinDetailLayout: pinDetailLayout === "drawer" ? "drawer" : "map",
        panelLinkColor: (panelLinkColor || "").trim() || "#4A9BAA",
        showSearch,
        showGroupDropdowns,
      };
      delete themeJson.pinFaviconUrl;
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

      setMap((prev) =>
        prev ? { ...prev, theme_json: themeJson, custom_pin_url: customPinUrl || null } : prev,
      );

      setMsg("Saved.");
      window.setTimeout(() => setMsg(""), 1600);
    } catch (e2) {
      setErr(e2.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  const editTheme = useMemo(() => {
    const hex = (panelBackgroundColor || "#ffffff").trim().replace(/^#/, "");
    const m = hex.match(/.{2}/g);
    const r = m ? parseInt(m[0], 16) : 255;
    const g = m ? parseInt(m[1], 16) : 255;
    const b = m ? parseInt(m[2], 16) : 255;
    const a = Math.max(0, Math.min(1, Number(panelBackgroundOpacity) ?? 0.88));
    return {
      panelBg: `rgba(${r},${g},${b},${a})`,
      panelLinkColor: (panelLinkColor || "").trim() || "#4A9BAA",
      buttonColor: (buttonColor || "").trim() || "#4A9BAA",
      pinDetailLayout: pinDetailLayout === "drawer" ? "drawer" : "map",
      panelBorderRadius: Math.max(0, Math.min(28, Number(panelBorderRadius) || 12)),
      pinSize: normalizePinSize(pinSize),
    };
  }, [panelBackgroundColor, panelBackgroundOpacity, panelLinkColor, buttonColor, pinDetailLayout, panelBorderRadius, pinSize]);

  async function publishMap() {
    if (!map) return;
    try {
      setPublishing(true);
      setErr("");
      const draftConfig = draftPublicationConfig;
      const { data, error } = await supabase.rpc("publish_map", {
        p_map_id: mapId,
        p_config: draftConfig,
        p_note: publishNote.trim() || null,
      });
      if (error) throw error;
      setPublishedSnapshot(normalizePublicationConfig(data.config));
      setPublishedAt(data.published_at);
      setPublishNote("");
      setMap((prev) =>
        prev
          ? {
              ...prev,
              current_publication_id: data.id,
              published_config: data.config?.map ?? draftConfig.map,
              published_at: data.published_at,
            }
          : prev,
      );
      const { data: hist } = await supabase.rpc("list_map_publications", { p_map_id: mapId });
      setPublicationHistory(hist ?? []);
      setMsg("Published.");
      window.setTimeout(() => setMsg(""), 2000);
    } catch (e2) {
      setErr(e2.message ?? String(e2));
    } finally {
      setPublishing(false);
    }
  }

  async function rollbackToPublication(pubRowId) {
    try {
      setRollingBack(true);
      setErr("");
      const { data, error } = await supabase.rpc("rollback_map_to", {
        p_map_id: mapId,
        p_publication_id: pubRowId,
      });
      if (error) throw error;
      setPublishedSnapshot(normalizePublicationConfig(data.config));
      setPublishedAt(data.published_at);
      setMap((prev) =>
        prev
          ? {
              ...prev,
              current_publication_id: data.id,
              published_config: data.config?.map,
              published_at: data.published_at,
            }
          : prev,
      );
      const { data: hist } = await supabase.rpc("list_map_publications", { p_map_id: mapId });
      setPublicationHistory(hist ?? []);
      setMsg("Restored that version as current. Use “Discard draft” to reset the editor.");
      window.setTimeout(() => setMsg(""), 3200);
    } catch (e2) {
      setErr(e2.message ?? String(e2));
    } finally {
      setRollingBack(false);
    }
  }

  async function discardDraft() {
    const cfg = publishedSnapshot;
    if (!cfg?.map) return;
    try {
      setDiscarding(true);
      setErr("");
      const m = cfg.map;
      const themeJson =
        typeof m.theme_json === "string"
          ? (() => {
              try {
                return JSON.parse(m.theme_json || "{}");
              } catch {
                return {};
              }
            })()
          : m.theme_json || {};

      const payloadBase = {
        default_lat: m.default_lat,
        default_lng: m.default_lng,
        default_zoom: m.default_zoom,
        show_list_panel: m.show_list_panel,
        enable_clustering: m.enable_clustering,
        marker_style: m.marker_style,
        marker_color: m.marker_color,
        theme_json: themeJson,
      };
      const payloadWithExtras = {
        ...payloadBase,
        cluster_radius: Math.max(20, Math.min(200, Number(m.cluster_radius) || 80)),
        custom_pin_url: m.custom_pin_url ?? null,
      };
      let { error } = await supabase.from("maps").update(payloadWithExtras).eq("id", mapId);
      const msg = String(error?.message || "");
      if (error && (msg.includes("cluster_radius") || msg.includes("custom_pin_url"))) {
        ({ error } = await supabase.from("maps").update(payloadBase).eq("id", mapId));
      }
      if (error) throw error;

      for (const gr of groups || []) {
        const snap = cfg.groups?.byId?.[gr.id] ?? cfg.groups?.byName?.[gr.name];
        const { error: gErr } = await supabase
          .from("groups")
          .update({
            color: snap?.color ?? null,
            theme_json: snap?.theme_json ?? null,
          })
          .eq("id", gr.id)
          .eq("map_id", mapId);
        if (gErr) throw gErr;
      }

      setDefaultLat(String(m.default_lat ?? ""));
      setDefaultLng(String(m.default_lng ?? ""));
      setDefaultZoom(String(m.default_zoom ?? ""));
      setShowListPanel(m.show_list_panel !== false);
      setEnableClustering(!!m.enable_clustering);
      setClusterRadius(m.cluster_radius ?? 80);
      setMarkerStyle(m.marker_style ?? "pin");
      setMarkerColor(m.marker_color ?? "#4A9BAA");
      setCustomPinUrl(m.custom_pin_url ?? "");
      setClusterColor(themeJson.clusterColor ?? "#4A9BAA");
      setPinBorderColor(themeJson.pinBorderColor ?? "#ffffff");
      setPinBorderSize(Math.max(0, Math.min(15, Number(themeJson.pinBorderSize) ?? 0)));
      setPinFaviconUrl(String(themeJson.pin_favicon_url ?? themeJson.pinFaviconUrl ?? "").trim());
      setButtonColor(themeJson.buttonColor ?? "#4A9BAA");
      setPanelBackgroundColor(themeJson.panelBackgroundColor ?? "#ffffff");
      setPanelBackgroundOpacity(themeJson.panelBackgroundOpacity ?? 0.88);
      setPanelBorderRadius(Math.max(0, Math.min(28, Number(themeJson.panelBorderRadius) ?? 12)));
      setPinDetailLayout(themeJson.pinDetailLayout === "drawer" ? "drawer" : "map");
      setPanelLinkColor(themeJson.panelLinkColor ?? "#4A9BAA");
      setPinSize(normalizePinSize(themeJson.pinSize));
      setShowSearch(themeJson.showSearch !== false);
      setShowGroupDropdowns(themeJson.showGroupDropdowns !== false);

      const { data: gReload } = await supabase
        .from("groups")
        .select("id,name,sort_order,color,theme_json")
        .eq("map_id", mapId)
        .order("sort_order", { ascending: true });
      setGroups(gReload ?? []);

      setMap((prev) =>
        prev
          ? {
              ...prev,
              ...payloadWithExtras,
              theme_json: themeJson,
            }
          : prev,
      );
      setMsg("Draft discarded — editor matches the published version.");
      window.setTimeout(() => setMsg(""), 2200);
    } catch (e2) {
      setErr(e2.message ?? String(e2));
    } finally {
      setDiscarding(false);
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
    <main className="admin-main admin-main--map-page">
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
              onMarkerScreenPosition={setSelectedMarkerPoint}
              onSelectMarker={(listing, point) => {
                setSelectedListing(listing);
                setSelectedMarkerPoint(point ?? null);
                setClampedPanelPosition(null);
              }}
              onClosePin={() => { setSelectedListing(null); setSelectedMarkerPoint(null); setClampedPanelPosition(null); }}
              centerOnListingId={centerOnListingId}
              setCenterOnListingId={setCenterOnListingId}
              showSendMessage={true}
              onOpenSendMessage={() => {
                if (!selectedListing?.email) return;
                setMessageDrawerOpen(true);
                setContactFormSent(false);
                setContactFormError("");
              }}
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
            {(!listings || listings.length === 0) && (
              <div style={{ margin: "6px 0 8px 0", padding: "6px 8px", borderRadius: 8, background: "rgba(74,155,170,0.06)", fontSize: 11, lineHeight: 1.4 }}>
                Start by loading your places in <strong>Data</strong> →{" "}
                <button
                  type="button"
                  onClick={() => openOverlay("data")}
                  style={{ border: "none", background: "none", padding: 0, margin: 0, color: "var(--lc-brand, #4A9BAA)", cursor: "pointer", font: "inherit" }}
                >
                  open data panel
                </button>
                .
              </div>
            )}
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
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <h3 style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, opacity: 0.9 }}>Pins</h3>
                      <div>
                        <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.85 }}>Style</div>
                        <div className="pin-style-grid">
                          {PIN_STYLES.map(({ id, label }) => {
                            const isSelected = markerStyle === id;
                            const isCustom = id === "custom";
                            const src = isCustom && customPinUrl ? customPinUrl : !isCustom ? markerIconDataUrl(id, markerColor, { borderColor: pinBorderColor, borderWidth: pinBorderSize, pinFaviconUrl: (id === "pin" || id === "teardrop" || id === "ringpin") ? pinFaviconUrl : undefined }) : null;
                            return (
                              <button key={id} type="button" className={`pin-style-option ${isSelected ? "is-selected" : ""}`} onClick={() => setMarkerStyle(id)} aria-pressed={isSelected}>
                                <div className="pin-style-option__preview">{src ? <img src={src} alt="" aria-hidden style={{ transform: `scale(${pinPreviewScale(pinSize)})`, transformOrigin: "center bottom" }} /> : <span style={{ fontSize: 11, color: "var(--lc-muted)" }}>Upload</span>}</div>
                                <span className="pin-style-option__label">{label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <Field label="Pin size">
                        <div className="pin-size-segmented" role="group" aria-label="Pin size">
                          {[
                            { id: "small", label: "Small" },
                            { id: "medium", label: "Medium" },
                            { id: "large", label: "Large" },
                          ].map(({ id, label: szLabel }) => (
                            <button
                              key={id}
                              type="button"
                              className={`pin-size-segmented__btn${pinSize === id ? " is-selected" : ""}`}
                              onClick={() => setPinSize(id)}
                              aria-pressed={pinSize === id}
                            >
                              {szLabel}
                            </button>
                          ))}
                        </div>
                      </Field>
                      <Field label="Marker colour"><ColorRow value={markerColor} onChange={setMarkerColor} ariaLabel="Pin colour" /></Field>
                      {groups?.length ? (
                        <div style={{ borderTop: "1px solid var(--lc-border)", paddingTop: 12, marginTop: 4 }}>
                          <h3 style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, opacity: 0.9 }}>Categories</h3>
                          <p style={{ margin: "0 0 10px", fontSize: 12, lineHeight: 1.45, opacity: 0.82 }}>
                            Pin colour per group (listings use the group from your data). Changes save immediately.
                          </p>
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {groups.map((gr) => (
                              <Field key={gr.id} label={gr.name || "Untitled group"}>
                                <ColorRow
                                  value={effectiveCategoryPinColor(gr)}
                                  onChange={(v) => persistCategoryPinColor(gr, v)}
                                  ariaLabel={`Pin colour for ${gr.name || "group"}`}
                                />
                              </Field>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <Field label="Pin border">
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <ColorRow value={pinBorderColor} onChange={setPinBorderColor} ariaLabel="Pin border colour" />
                          <input type="range" min={0} max={15} step={1} value={pinBorderSize} onChange={(e) => setPinBorderSize(Number(e.target.value))} style={{ width: 64 }} />
                          <span style={{ fontSize: 12 }}>{pinBorderSize}px</span>
                        </div>
                      </Field>
                      {(markerStyle === "pin" || markerStyle === "teardrop" || markerStyle === "ringpin") && (
                        <Field label="Image inside pin">
                          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                            <label className="btn" style={{ margin: 0, position: "relative", overflow: "hidden" }}>{pinFaviconUrl ? "Change…" : "Upload"}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 48 * 1024) { setErr("Image must be under 48KB."); return; } const reader = new FileReader(); reader.onload = () => { setPinFaviconUrl(reader.result || ""); setErr(""); }; reader.readAsDataURL(file); e.target.value = ""; }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }} /></label>
                            {pinFaviconUrl && <><span style={{ fontSize: 12, opacity: 0.8 }}><img src={pinFaviconUrl} alt="" style={{ maxWidth: 20, maxHeight: 20, objectFit: "contain", verticalAlign: "middle" }} /></span><button type="button" className="btn" style={{ margin: 0, position: "relative", zIndex: 1 }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPinFaviconUrl(""); }}>Clear</button></>}
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
                  <div style={{ borderTop: "1px solid var(--lc-border)", paddingTop: 12 }}>
                    <button className="btn btn-primary" type="button" onClick={(e) => { e.preventDefault(); saveMap({ preventDefault: () => {} }); }} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                  </div>
                </div>
              )}

              {overlayTab === "panels" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>
                    Style the listing detail panel and choose whether it appears beside the pin on the map or in a side drawer (drawer
                    mode shows extended description text when you have added it in Data).
                  </p>
                  <Field label="Listing detail display">
                    <div className="panel-detail-layout-options">
                      <label
                        className={`panel-detail-layout-option${pinDetailLayout === "map" ? " is-selected" : ""}`}
                      >
                        <input type="radio" name="pinDetailLayout" checked={pinDetailLayout === "map"} onChange={() => setPinDetailLayout("map")} />
                        <span className="panel-detail-layout-option__text">
                          <span className="panel-detail-layout-option__title">Map panel</span>
                          <span className="panel-detail-layout-option__desc">Floating card next to the pin on the map.</span>
                        </span>
                      </label>
                      <label
                        className={`panel-detail-layout-option${pinDetailLayout === "drawer" ? " is-selected" : ""}`}
                      >
                        <input type="radio" name="pinDetailLayout" checked={pinDetailLayout === "drawer"} onChange={() => setPinDetailLayout("drawer")} />
                        <span className="panel-detail-layout-option__text">
                          <span className="panel-detail-layout-option__title">Side drawer</span>
                          <span className="panel-detail-layout-option__desc">
                            Slides in from the edge with a scrollable area for descriptions and full details.
                          </span>
                        </span>
                      </label>
                    </div>
                  </Field>
                  <Field label="Panel background colour"><ColorRow value={panelBackgroundColor} onChange={setPanelBackgroundColor} ariaLabel="Panel background" /></Field>
                  <Field label="Translucency">
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input type="range" min={0} max={1} step={0.05} value={panelBackgroundOpacity} onChange={(e) => setPanelBackgroundOpacity(Number(e.target.value))} style={{ width: 120 }} />
                      <span style={{ fontSize: 12 }}>{Math.round(panelBackgroundOpacity * 100)}%</span>
                    </div>
                  </Field>
                  <Field label="Corner roundness">
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input type="range" min={0} max={28} step={1} value={panelBorderRadius} onChange={(e) => setPanelBorderRadius(Number(e.target.value))} style={{ width: 120 }} />
                      <span style={{ fontSize: 12 }}>{panelBorderRadius}px</span>
                    </div>
                  </Field>
                  <Field label="Link colour"><ColorRow value={panelLinkColor} onChange={setPanelLinkColor} ariaLabel="Panel link colour" /></Field>
                  <Field label="Website button colour"><ColorRow value={buttonColor} onChange={setButtonColor} ariaLabel="Website button colour" /></Field>
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
                  {!hasActiveSubscription ? (
                    <div style={{ display: "grid", gap: 16 }}>
                      <div>
                        <p style={{ margin: "0 0 8px 0", fontSize: 13, opacity: 0.85 }}>
                          To publish this map and use the embed, choose a subscription plan below. You can still design
                          and preview your map without a plan.
                        </p>
                      </div>
                      <PricingPlans originSection="Client publish tab" />
                    </div>
                  ) : (
                    <>
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
                            "This map has not been published yet. Embeds stay blank until you publish."
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <button
                            type="button"
                            className="btn"
                            onClick={discardDraft}
                            disabled={discarding || !publishedSnapshot || !hasUnpublishedChanges}
                          >
                            {discarding ? "Resetting…" : "Discard draft"}
                          </button>
                          <button
                            className={`btn btn-primary${!hasUnpublishedChanges || publishing ? " is-disabled" : ""}`}
                            type="button"
                            onClick={publishMap}
                            disabled={!hasUnpublishedChanges || publishing}
                          >
                            {publishing ? "Publishing…" : hasUnpublishedChanges ? "Publish changes" : "Published"}
                          </button>
                        </div>
                      </div>
                      <label style={{ display: "grid", gap: 6 }}>
                        <span style={{ fontSize: 13, opacity: 0.85 }}>Publish note (optional)</span>
                        <input
                          type="text"
                          value={publishNote}
                          onChange={(e) => setPublishNote(e.target.value)}
                          placeholder="e.g. Launch checklist complete"
                          style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid var(--lc-border)", maxWidth: 420 }}
                        />
                      </label>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>
                        Saving stores draft settings only. Publishing versions what embeds show for map layout and group styling;
                        synced listing data updates live.
                      </div>
                      {publicationHistory.length > 0 ? (
                        <div style={{ display: "grid", gap: 8 }}>
                          <div style={{ fontSize: 13, opacity: 0.85 }}>Publish history</div>
                          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
                            {publicationHistory.map((row) => {
                              const isCurrent = row.id === map?.current_publication_id;
                              return (
                                <li
                                  key={row.id}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 10,
                                    flexWrap: "wrap",
                                    padding: "8px 10px",
                                    border: "1px solid var(--lc-border)",
                                    borderRadius: 10,
                                    fontSize: 13,
                                  }}
                                >
                                  <span>
                                    <strong>v{row.version}</strong>
                                    {" · "}
                                    {new Date(row.published_at).toLocaleString()}
                                    {row.note ? ` · ${row.note}` : ""}
                                    {isCurrent ? (
                                      <>
                                        {" "}
                                        <span style={{ opacity: 0.85 }}>(current)</span>
                                      </>
                                    ) : null}
                                  </span>
                                  {!isCurrent ? (
                                    <button
                                      type="button"
                                      className="btn"
                                      disabled={rollingBack}
                                      onClick={() => rollbackToPublication(row.id)}
                                    >
                                      Restore
                                    </button>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ) : null}
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
                    </>
                  )}
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

        {/* Message drawer (same behaviour as embed) */}
        <div
          className={`embed-message-drawer ${messageDrawerOpen ? "embed-message-drawer--open" : ""}`}
          aria-hidden={!messageDrawerOpen}
        >
          <div
            className="embed-message-drawer__backdrop"
            onClick={() => setMessageDrawerOpen(false)}
            aria-label="Close"
          />
          <div className="embed-message-drawer__panel" role="dialog" aria-label="Send a message">
            <div className="embed-message-drawer__header">
              <h3 className="embed-message-drawer__title">Send message</h3>
              <button
                type="button"
                className="embed-message-drawer__close"
                onClick={() => setMessageDrawerOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            {selectedListing ? (
              <p className="embed-message-drawer__to">To: {selectedListing.name || "—"}</p>
            ) : null}
            {contactFormSent ? (
              <div className="embed-message-drawer__success">
                <p>Your message has been sent. A copy has been emailed to you.</p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setMessageDrawerOpen(false);
                    setContactFormSent(false);
                  }}
                >
                  Close
                </button>
              </div>
            ) : (
              <form
                className="embed-message-drawer__form"
                onSubmit={async (e) => {
                e.preventDefault();
                if (!selectedListing?.email) return;
                if (!isProductionEnv && !contactForm.testToEmail.trim()) {
                  setContactFormError("Enter a test recipient email when in test/preview.");
                  return;
                }
                setContactFormError("");
                  setContactFormSubmitting(true);
                  try {
                    const { data, error } = await supabase.functions.invoke("send_contact_message", {
                      body: {
                        toEmail: isProductionEnv
                          ? selectedListing.email
                          : (contactForm.testToEmail || "").trim(),
                        listingName: selectedListing.name || "",
                        senderName: (contactForm.name || "").trim(),
                        senderEmail: (contactForm.email || "").trim(),
                        senderPhone: (contactForm.phone || "").trim(),
                        message: (contactForm.message || "").trim(),
                      },
                    });
                    if (error) throw error;
                    if (data?.error) throw new Error(data.error);
                    setContactFormSent(true);
                    setContactForm({
                      name: "",
                      email: "",
                      phone: "",
                      message: "",
                      testToEmail: contactForm.testToEmail,
                    });
                  } catch (err) {
                    setContactFormError(err?.message ?? "Failed to send message. Try again.");
                  } finally {
                    setContactFormSubmitting(false);
                  }
                }}
              >
                {!isProductionEnv && (
                  <div
                    style={{
                      marginBottom: 10,
                      fontSize: 12,
                      color: "#b45309",
                      background: "#fef3c7",
                      padding: "8px 10px",
                      borderRadius: 6,
                    }}
                  >
                    <strong>Test mode:</strong> Messages will be sent to the test address below, not to the listing email.
                  </div>
                )}
                {!isProductionEnv && (
                  <label className="embed-message-drawer__label">
                    <span>Test recipient email</span>
                    <input
                      type="email"
                      value={contactForm.testToEmail}
                      onChange={(e) =>
                        setContactForm((f) => ({
                          ...f,
                          testToEmail: e.target.value,
                        }))
                      }
                      placeholder="test-recipient@example.com"
                      required
                    />
                  </label>
                )}
                <label className="embed-message-drawer__label">
                  <span>Name</span>
                  <input
                    type="text"
                    value={contactForm.name}
                    onChange={(e) =>
                      setContactForm((f) => ({
                        ...f,
                        name: e.target.value,
                      }))
                    }
                    placeholder="Your name"
                  />
                </label>
                <label className="embed-message-drawer__label">
                  <span>Email</span>
                  <input
                    type="email"
                    value={contactForm.email}
                    onChange={(e) =>
                      setContactForm((f) => ({
                        ...f,
                        email: e.target.value,
                      }))
                    }
                    placeholder="your@email.com"
                    required
                  />
                </label>
                <label className="embed-message-drawer__label">
                  <span>Phone</span>
                  <input
                    type="tel"
                    value={contactForm.phone}
                    onChange={(e) =>
                      setContactForm((f) => ({
                        ...f,
                        phone: e.target.value,
                      }))
                    }
                    placeholder="Optional"
                  />
                </label>
                <label className="embed-message-drawer__label">
                  <span>Message</span>
                  <textarea
                    value={contactForm.message}
                    onChange={(e) =>
                      setContactForm((f) => ({
                        ...f,
                        message: e.target.value,
                      }))
                    }
                    placeholder="Your message…"
                    rows={4}
                    required
                  />
                </label>
                {contactFormError ? (
                  <p className="embed-message-drawer__error">{contactFormError}</p>
                ) : null}
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={contactFormSubmitting}
                  style={{ marginTop: 8 }}
                >
                  {contactFormSubmitting ? "Sending…" : "Send message"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

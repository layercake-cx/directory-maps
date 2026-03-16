import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import PublishedMapView from "../components/PublishedMapView.jsx";

export default function EmbedMap() {
  const [params] = useSearchParams();
  const mapId = params.get("map");

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [map, setMap] = useState(null);
  const [listings, setListings] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedListing, setSelectedListing] = useState(null);
  const [centerOnListingId, setCenterOnListingId] = useState(null);
  const [selectedMarkerPoint, setSelectedMarkerPoint] = useState(null);
  const [clampedPanelPosition, setClampedPanelPosition] = useState(null);
  const pinOverlayRef = useRef(null);
  const [messageDrawerOpen, setMessageDrawerOpen] = useState(false);
  const [contactForm, setContactForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [contactFormSubmitting, setContactFormSubmitting] = useState(false);
  const [contactFormSent, setContactFormSent] = useState(false);
  const [contactFormError, setContactFormError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr("");

        if (!mapId) {
          setErr("Missing map parameter. Use /#/embed?map=<MAP_ID>");
          return;
        }

        const [{ data: m, error: mErr }, { data: l, error: lErr }, { data: g, error: gErr }] = await Promise.all([
          supabase
            .from("maps")
            .select(
              "id,name,default_lat,default_lng,default_zoom,show_list_panel,enable_clustering,marker_style,marker_color,theme_json,cluster_radius,custom_pin_url,published_config,published_at",
            )
            .eq("id", mapId)
            .single(),
          supabase.from("public_listings").select("*").eq("map_id", mapId),
          supabase.from("groups").select("id,name,sort_order").eq("map_id", mapId).order("sort_order", { ascending: true }),
        ]);

        let mapRow = m;
        let mapErr = mErr;
        const msg = String(mapErr?.message || "");
        if (mapErr && (msg.includes("cluster_radius") || msg.includes("custom_pin_url") || msg.includes("published_"))) {
          const { data: fallback, error: mErr2 } = await supabase
            .from("maps")
            .select(
              "id,name,default_lat,default_lng,default_zoom,show_list_panel,enable_clustering,marker_style,marker_color,theme_json",
            )
            .eq("id", mapId)
            .single();
          if (mErr2) throw mErr2;
          mapRow = fallback;
          mapErr = null;
        }

        if (mapErr) throw mapErr;
        if (lErr) throw lErr;
        if (gErr) throw gErr;

        if (!cancelled) {
          setMap(mapRow);
          setListings(l ?? []);
          setGroups(g ?? []);
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

  const publishedConfig = useMemo(() => {
    if (!map?.published_config) return null;
    const raw = map.published_config;
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
    if (typeof raw === "object" && raw !== null) return raw;
    return null;
  }, [map]);

  const effectiveDefaults = useMemo(() => {
    const src = publishedConfig || map || {};
    return {
      lat: Number(src.default_lat ?? map?.default_lat ?? 0),
      lng: Number(src.default_lng ?? map?.default_lng ?? 0),
      zoom: Number(src.default_zoom ?? map?.default_zoom ?? 3),
      showListPanel: (src.show_list_panel ?? map?.show_list_panel) !== false,
      enableClustering: !!(src.enable_clustering ?? map?.enable_clustering),
      markerStyle: src.marker_style ?? map?.marker_style ?? "pin",
      markerColor: src.marker_color ?? map?.marker_color ?? "#4A9BAA",
      clusterRadius:
        typeof src.cluster_radius === "number"
          ? src.cluster_radius
          : typeof map?.cluster_radius === "number"
          ? map.cluster_radius
          : 80,
      customPinUrl: src.custom_pin_url ?? map?.custom_pin_url ?? null,
      themeSource: src.theme_json ?? map?.theme_json ?? null,
    };
  }, [publishedConfig, map]);

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (err) return <div style={{ padding: 16 }}>{err}</div>;
  if (!map) return <div style={{ padding: 16 }}>Map not found.</div>;
  if (!apiKey) return <div style={{ padding: 16 }}>Missing VITE_GOOGLE_MAPS_API_KEY</div>;

  const primaryColor = effectiveDefaults.markerColor || "#4A9BAA";
  const theme = (() => {
    try {
      return typeof effectiveDefaults.themeSource === "string"
        ? JSON.parse(effectiveDefaults.themeSource || "{}")
        : effectiveDefaults.themeSource || {};
    } catch (_) {
      return {};
    }
  })();
  const buttonColor = (theme.buttonColor && String(theme.buttonColor).trim()) || primaryColor;
  const panelLinkColor = (theme.panelLinkColor && String(theme.panelLinkColor).trim()) || primaryColor;
  const panelBgHex = (theme.panelBackgroundColor && String(theme.panelBackgroundColor).trim()) || "#e4f0ff";
  const panelBgOpacity = Math.max(0, Math.min(1, Number(theme.panelBackgroundOpacity) ?? 0.88));
  const hexToRgba = (hex, a) => {
    const m = hex.replace(/^#/, "").match(/.{2}/g);
    if (!m) return `rgba(228, 240, 255, ${a})`;
    const [r, g, b] = m.map((x) => parseInt(x, 16));
    return `rgba(${r},${g},${b},${a})`;
  };
  const panelBg = hexToRgba(panelBgHex, panelBgOpacity);
  const parsedTheme = (() => {
    try {
      return typeof effectiveDefaults.themeSource === "string"
        ? JSON.parse(effectiveDefaults.themeSource || "{}")
        : effectiveDefaults.themeSource || {};
    } catch (_) {
      return {};
    }
  })();

  return (
    <>
      <PublishedMapView
        apiKey={apiKey}
        center={{ lat: effectiveDefaults.lat, lng: effectiveDefaults.lng }}
        zoom={effectiveDefaults.zoom}
        listings={listings}
        groups={groups}
        showListPanel={effectiveDefaults.showListPanel}
        showSearch={parsedTheme.showSearch !== false}
        showGroupDropdowns={parsedTheme.showGroupDropdowns !== false}
        enableClustering={effectiveDefaults.enableClustering}
        clusterRadius={effectiveDefaults.clusterRadius}
        markerStyle={effectiveDefaults.markerStyle}
        markerColor={effectiveDefaults.markerColor}
        customPinUrl={effectiveDefaults.customPinUrl}
        clusterColor={parsedTheme.clusterColor || "#4A9BAA"}
        pinBorderColor={parsedTheme.pinBorderColor || "#ffffff"}
        pinBorderSize={Math.max(0, Math.min(15, Number(parsedTheme.pinBorderSize) ?? 0))}
        pinFaviconUrl={(parsedTheme.pin_favicon_url && String(parsedTheme.pin_favicon_url).trim()) || null}
        theme={{ panelBg, panelLinkColor, buttonColor }}
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
        showSendMessage={true}
        onOpenSendMessage={() => { setMessageDrawerOpen(true); setContactFormSent(false); setContactFormError(""); }}
        height="100vh"
      />

      {/* Message drawer */}
      <div className={`embed-message-drawer ${messageDrawerOpen ? "embed-message-drawer--open" : ""}`} aria-hidden={!messageDrawerOpen}>
        <div className="embed-message-drawer__backdrop" onClick={() => setMessageDrawerOpen(false)} aria-label="Close" />
        <div className="embed-message-drawer__panel" role="dialog" aria-label="Send a message">
          <div className="embed-message-drawer__header">
            <h3 className="embed-message-drawer__title">Send message</h3>
            <button type="button" className="embed-message-drawer__close" onClick={() => setMessageDrawerOpen(false)} aria-label="Close">×</button>
          </div>
          {selectedListing ? (
            <p className="embed-message-drawer__to">To: {selectedListing.name || "—"}</p>
          ) : null}
          {contactFormSent ? (
            <div className="embed-message-drawer__success">
              <p>Your message has been sent. A copy has been emailed to you.</p>
              <button type="button" className="btn btn-primary" onClick={() => { setMessageDrawerOpen(false); setContactFormSent(false); }}>Close</button>
            </div>
          ) : (
            <form
              className="embed-message-drawer__form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!selectedListing?.email) return;
                setContactFormError("");
                setContactFormSubmitting(true);
                try {
                  const { data, error } = await supabase.functions.invoke("send_contact_message", {
                    body: {
                      toEmail: selectedListing.email,
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
                  setContactForm({ name: "", email: "", phone: "", message: "" });
                } catch (err) {
                  setContactFormError(err?.message ?? "Failed to send message. Try again.");
                } finally {
                  setContactFormSubmitting(false);
                }
              }}
            >
              <label className="embed-message-drawer__label">
                <span>Name</span>
                <input type="text" value={contactForm.name} onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))} placeholder="Your name" />
              </label>
              <label className="embed-message-drawer__label">
                <span>Email</span>
                <input type="email" value={contactForm.email} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} placeholder="your@email.com" required />
              </label>
              <label className="embed-message-drawer__label">
                <span>Phone</span>
                <input type="tel" value={contactForm.phone} onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Optional" />
              </label>
              <label className="embed-message-drawer__label">
                <span>Message</span>
                <textarea value={contactForm.message} onChange={(e) => setContactForm((f) => ({ ...f, message: e.target.value }))} placeholder="Your message…" rows={4} required />
              </label>
              {contactFormError ? <p className="embed-message-drawer__error">{contactFormError}</p> : null}
              <button type="submit" className="btn btn-primary" disabled={contactFormSubmitting} style={{ marginTop: 8 }}>
                {contactFormSubmitting ? "Sending…" : "Send message"}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

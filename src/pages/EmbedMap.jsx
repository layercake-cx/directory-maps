import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import { createMapEngagementRecorder } from "../lib/mapEngagement.js";
import { formatContactMessageError, submitContactMessage } from "../lib/contactMessage.js";
import PublishedMapView from "../components/PublishedMapView.jsx";
import { normalizePinSize } from "../lib/markerIcons";
import { mergeGroupWithPublication, normalizePublicationConfig } from "../lib/mapPublication.js";
import { buildMapStyles, normalizeMapStyleSettings } from "../lib/mapStyleSettings.js";

/**
 * Anon-only Supabase client for the embed page.
 *
 * The shared `supabase` singleton (src/lib/supabase.js) persists the user's
 * auth session in localStorage. When a logged-in admin or client tests the
 * embed in the same browser, that singleton sends an authenticated JWT to
 * PostgREST. The `map_engagement_events` insert policy is `to anon` only —
 * authenticated users have no insert policy and get a 403.
 *
 * Using a separate client with `persistSession: false` means the embed always
 * hits PostgREST as the anon role, matching real-world embed behaviour and
 * keeping engagement inserts working regardless of the viewer's login state.
 */
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL ?? "https://placeholder.supabase.co",
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? "placeholder-key",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);

/**
 * Attempt to load the static CDN snapshot for a map (schemaVersion 2).
 * Returns the parsed snapshot object, or null if unavailable / timed out.
 * Never throws — callers must handle null and fall back to live Supabase queries.
 */
async function fetchSnapshot(mapId) {
  const base = import.meta.env.VITE_SNAPSHOT_BASE_URL;
  if (!base) return null;

  // Cache-bust with a per-load timestamp so stale CDN edge caches (which
  // ignore the s-maxage=0 we now set on upload) are always bypassed.
  const url = `${base}/maps/${mapId}/snapshot.json?t=${Date.now()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000); // 3 s timeout

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    // Only accept schemaVersion 2 snapshots (contain listings)
    if (data?.schemaVersion !== 2) return null;
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default function EmbedMap({ mapId: mapIdProp } = {}) {
  const [params] = useSearchParams();
  const mapId = mapIdProp ?? params.get("map");

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const ENVIRONMENT = import.meta.env.VITE_ENVIRONMENT || "preview";
  const isProductionEnv = ENVIRONMENT === "production";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [map, setMap] = useState(null);
  const [listings, setListings] = useState([]);
  const [groups, setGroups] = useState([]);
  /** Normalized publication snapshot (map + group styling); listings stay live. */
  const [publicationConfig, setPublicationConfig] = useState(null);
  const [selectedListing, setSelectedListing] = useState(null);
  const [centerOnListingId, setCenterOnListingId] = useState(null);
  const [selectedMarkerPoint, setSelectedMarkerPoint] = useState(null);
  const [clampedPanelPosition, setClampedPanelPosition] = useState(null);
  const pinOverlayRef = useRef(null);
  const [messagingEnabled, setMessagingEnabled] = useState(true);
  const [messagingPrompt, setMessagingPrompt] = useState("");
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

  useEffect(() => {
    document.documentElement.classList.add("embed-map-page");
    document.body.classList.add("embed-map-page");
    return () => {
      document.documentElement.classList.remove("embed-map-page");
      document.body.classList.remove("embed-map-page");
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr("");

        if (!mapId) {
          setErr("Missing map parameter. Use /embed?map=<MAP_ID>");
          return;
        }

        // ── Try static CDN snapshot first ──────────────────────────────────
        // If VITE_SNAPSHOT_BASE_URL is set and the snapshot file exists, we
        // hydrate entirely from it — no Supabase queries needed for display.
        // This keeps the map visible even during database outages.
        const snapshot = await fetchSnapshot(mapId);

        if (snapshot && !cancelled) {
          const resolvedPublication = normalizePublicationConfig(snapshot.config);
          // Build a minimal map-shape from the publication config so the rest
          // of the component (which expects a `map` row) works unchanged.
          // Spread first, then override id so the URL param always wins
          // (guards against a snapshot config that carries its own id field).
          const mapShape = {
            ...snapshot.config?.map,
            id: mapId,
          };
          setMap(mapShape);
          setListings(snapshot.listings ?? []);
          setGroups(snapshot.groups ?? []);
          setPublicationConfig(resolvedPublication);
          // For snapshots, read messaging settings from snapshot config if present,
          // otherwise fall through to a live lookup via client_id on the map shape.
          const snapshotClientId = snapshot.config?.map?.client_id;
          if (typeof snapshot.config?.messaging_enabled === "boolean") {
            setMessagingEnabled(snapshot.config.messaging_enabled);
            setMessagingPrompt(snapshot.config.messaging_prompt ?? "");
          } else if (snapshotClientId) {
            const { data: ms } = await supabase
              .from("client_messaging_settings")
              .select("messaging_enabled,messaging_prompt")
              .eq("client_id", snapshotClientId)
              .single();
            if (ms && !cancelled) {
              setMessagingEnabled(!!ms.messaging_enabled);
              setMessagingPrompt(ms.messaging_prompt ?? "");
            }
          }
          // else: no client_id in snapshot — leave default (true) for backward compat
          return; // skip main Supabase queries
        }

        // ── Fallback: live Supabase queries (original behaviour) ───────────
        const [{ data: m, error: mErr }, { data: l, error: lErr }, { data: g, error: gErr }] = await Promise.all([
          supabase
            .from("maps")
            .select(
              "id,name,client_id,default_lat,default_lng,default_zoom,show_list_panel,enable_clustering,marker_style,marker_color,theme_json,cluster_radius,custom_pin_url,published_config,published_at,current_publication_id",
            )
            .eq("id", mapId)
            .single(),
          supabase.from("public_listings").select("*").eq("map_id", mapId),
          supabase
            .from("groups")
            .select("id,name,sort_order,color,theme_json")
            .eq("map_id", mapId)
            .order("sort_order", { ascending: true }),
        ]);

        let mapRow = m;
        let mapErr = mErr;
        let msg = String(mapErr?.message || "");
        if (
          mapErr &&
          (msg.includes("cluster_radius") ||
            msg.includes("custom_pin_url") ||
            msg.includes("published_") ||
            msg.includes("current_publication"))
        ) {
          const { data: fallback, error: mErr2 } = await supabase
            .from("maps")
            .select(
              "id,name,default_lat,default_lng,default_zoom,show_list_panel,enable_clustering,marker_style,marker_color,theme_json,published_config,published_at",
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

        let resolvedPublication = null;
        if (mapRow?.current_publication_id) {
          const { data: pubRow, error: pubErr } = await supabase
            .from("map_publications")
            .select("config")
            .eq("id", mapRow.current_publication_id)
            .single();
          if (!pubErr && pubRow?.config) {
            resolvedPublication = normalizePublicationConfig(pubRow.config);
          }
        }
        if (!resolvedPublication && mapRow?.published_config) {
          resolvedPublication = normalizePublicationConfig(mapRow.published_config);
        }

        // ── Fetch messaging settings for the embed gate ────────────────────
        if (mapRow?.client_id && !cancelled) {
          const { data: ms } = await supabase
            .from("client_messaging_settings")
            .select("messaging_enabled,messaging_prompt")
            .eq("client_id", mapRow.client_id)
            .single();
          if (ms && !cancelled) {
            setMessagingEnabled(!!ms.messaging_enabled);
            setMessagingPrompt(ms.messaging_prompt ?? "");
          }
        }

        if (!cancelled) {
          setMap(mapRow);
          setListings(l ?? []);
          setGroups(g ?? []);
          setPublicationConfig(resolvedPublication);
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

  const groupsForEmbed = useMemo(() => {
    const pubGroups = publicationConfig?.groups;
    if (!pubGroups) {
      return (groups || []).map((gr) => ({ ...gr, theme_json: null, color: null }));
    }
    return (groups || []).map((gr) => mergeGroupWithPublication(gr, pubGroups));
  }, [groups, publicationConfig]);

  const effectiveDefaults = useMemo(() => {
    const src = publicationConfig?.map || {};
    return {
      lat: Number(src.default_lat ?? 0),
      lng: Number(src.default_lng ?? 0),
      zoom: Number(src.default_zoom ?? 3),
      showListPanel: src.show_list_panel !== false,
      enableClustering: !!src.enable_clustering,
      markerStyle: src.marker_style ?? "pin",
      markerColor: src.marker_color ?? "#4A9BAA",
      clusterRadius: typeof src.cluster_radius === "number" ? src.cluster_radius : 80,
      customPinUrl: src.custom_pin_url ?? null,
      themeSource: src.theme_json ?? null,
    };
  }, [publicationConfig]);

  const listingsWithOverrides = useMemo(() => {
    const overridesById = new Map();
    (groupsForEmbed || []).forEach((gr) => {
      if (!gr.id) return;
      const raw = gr.theme_json;
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
        overridesById.set(gr.id, {});
        return;
      }
      overridesById.set(gr.id, {
        marker_style: theme.marker_style ?? theme.markerStyle ?? null,
        marker_color: theme.marker_color ?? theme.markerColor ?? null,
        custom_pin_url: theme.custom_pin_url ?? null,
        pin_favicon_url: theme.pin_favicon_url ?? null,
        pin_favicon_mode: theme.pin_favicon_mode ?? "inherit",
        pinBorderColor: theme.pinBorderColor ?? null,
        pinBorderSize: theme.pinBorderSize != null ? theme.pinBorderSize : null,
        pinDropShadow: theme.pinDropShadow != null ? theme.pinDropShadow : null,
        pinSize:
          theme.pinSize != null && theme.pinSize !== "" ? normalizePinSize(theme.pinSize) : null,
      });
    });

    return (listings || []).map((l) => {
      const o = l.group_id ? overridesById.get(l.group_id) || {} : {};
      return {
        ...l,
        group_color: o.marker_color || null,
        group_marker_style: o.marker_style || null,
        group_custom_pin_url: o.custom_pin_url || null,
        group_pin_favicon_url: o.pin_favicon_url || null,
        group_pin_favicon_mode: o.pin_favicon_mode || "inherit",
        group_pin_border_color: o.pinBorderColor || null,
        group_pin_border_size:
          typeof o.pinBorderSize === "number" ? o.pinBorderSize : null,
        group_pin_drop_shadow:
          typeof o.pinDropShadow === "number" ? o.pinDropShadow : null,
        group_pin_size: o.pinSize != null && o.pinSize !== "" ? o.pinSize : null,
      };
    });
  }, [listings, groupsForEmbed]);

  const recordEngagement = useMemo(
    () => (map?.id ? createMapEngagementRecorder({ supabase, mapId: map.id, surface: "embed" }) : null),
    [map?.id],
  );

  useEffect(() => {
    if (!recordEngagement || !map?.id || !publicationConfig) return;
    recordEngagement("session_start", {});
  }, [recordEngagement, map?.id, publicationConfig]);

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (err) return <div style={{ padding: 16 }}>{err}</div>;
  if (!map) return <div style={{ padding: 16 }}>Map not found.</div>;
  if (!publicationConfig) {
    return (
      <div style={{ padding: 16 }}>
        This map has not been published yet. Open the dashboard, publish the map, then reload this embed.
      </div>
    );
  }
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
  const panelBgHex = (theme.panelBackgroundColor && String(theme.panelBackgroundColor).trim()) || "#ffffff";
  const panelBgOpacity = Math.max(0, Math.min(1, Number(theme.panelBackgroundOpacity) ?? 0.88));
  const panelBorderRadius = Math.max(0, Math.min(28, Number(theme.panelBorderRadius) ?? 12));
  const pinDetailLayout = theme.pinDetailLayout === "drawer" ? "drawer" : "map";
  const embedPinSize = normalizePinSize(theme.pinSize);
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
  const parsedMapTypeId = parsedTheme.mapTypeId ?? "roadmap";
  const parsedMapStyleSettings = normalizeMapStyleSettings({
    ...(parsedTheme.mapStyleSettings || {}),
    baseType:
      parsedTheme.mapStyleSettings?.baseType ??
      (parsedMapTypeId === "satellite" || parsedMapTypeId === "hybrid" || parsedMapTypeId === "terrain"
        ? parsedMapTypeId
        : "roadmap"),
  });
  const embedMapStyles = buildMapStyles(
    parsedMapStyleSettings.colors.land,
    parsedMapStyleSettings.colors.water,
    parsedMapStyleSettings.colors.roads,
    parsedMapStyleSettings.detail,
    parsedMapStyleSettings.overlays
  );

  return (
    <>
      <div className="embed-map-root">
        <PublishedMapView
          apiKey={apiKey}
          center={{ lat: effectiveDefaults.lat, lng: effectiveDefaults.lng }}
          zoom={effectiveDefaults.zoom}
          mapTypeId={parsedMapTypeId}
          listings={listings}
          listingsWithColor={listingsWithOverrides}
          groups={groupsForEmbed}
          recordEngagement={recordEngagement ?? undefined}
          showListPanel={effectiveDefaults.showListPanel}
          showSearch={parsedTheme.showSearch !== false}
          showGroupDropdowns={parsedTheme.showGroupDropdowns !== false}
          showMapTitle={!!parsedTheme.showMapTitle}
          mapName={map?.name ?? ""}
          enableClustering={effectiveDefaults.enableClustering}
          clusterRadius={effectiveDefaults.clusterRadius}
          markerStyle={effectiveDefaults.markerStyle}
          markerColor={effectiveDefaults.markerColor}
          customPinUrl={effectiveDefaults.customPinUrl}
          clusterColor={parsedTheme.clusterColor || "#4A9BAA"}
          clusterOpacity={Math.max(0, Math.min(1, Number(parsedTheme.clusterOpacity) ?? 1))}
          pinBorderColor={parsedTheme.pinBorderColor || "#ffffff"}
          pinBorderSize={Math.max(0, Math.min(15, Number(parsedTheme.pinBorderSize) ?? 0))}
          pinDropShadow={Math.max(0, Math.min(30, Number(parsedTheme.pinDropShadow ?? parsedTheme.pinDropShadowPx ?? 0) || 0))}
          pinShadowDistance={Math.max(0, Math.min(30, Number(parsedTheme.pinShadowDistance ?? 20)))}
          pinShadowOpacity={Math.max(0, Math.min(100, Number(parsedTheme.pinShadowOpacity ?? 100)))}
          pinFaviconUrl={(() => {
            const u = parsedTheme.pin_favicon_url ?? parsedTheme.pinFaviconUrl;
            return u && String(u).trim() ? String(u).trim() : null;
          })()}
          mapStyles={embedMapStyles}
          showTrafficLayer={parsedMapStyleSettings.overlays.traffic}
          showTransitLayer={parsedMapStyleSettings.overlays.transit}
          showBikeLayer={parsedMapStyleSettings.overlays.bikeLanes}
          theme={{ panelBg, panelLinkColor, buttonColor, panelBorderRadius, pinDetailLayout, pinSize: embedPinSize }}
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
          showSendMessage={messagingEnabled}
          onOpenSendMessage={() => { setMessageDrawerOpen(true); setContactFormSent(false); setContactFormError(""); }}
          height="100vh"
          gestureHandling="cooperative"
        />
      </div>

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
          {messagingPrompt ? (
            <p className="embed-message-drawer__prompt">{messagingPrompt}</p>
          ) : null}
          {contactFormSent ? (
            <div className="embed-message-drawer__success">
              <p>Your message has been sent. You have been CC&apos;d on the email.</p>
              <button type="button" className="btn btn-primary" onClick={() => { setMessageDrawerOpen(false); setContactFormSent(false); }}>Close</button>
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
                  await submitContactMessage(supabase, {
                    mapId,
                    listingId: selectedListing.id,
                    listingName: selectedListing.name || "",
                    toEmail: isProductionEnv
                      ? selectedListing.email
                      : (contactForm.testToEmail || "").trim(),
                    senderName: (contactForm.name || "").trim(),
                    senderEmail: (contactForm.email || "").trim(),
                    senderPhone: (contactForm.phone || "").trim(),
                    message: (contactForm.message || "").trim(),
                    surface: "embed",
                  });
                  recordEngagement?.("message_sent", { listingId: selectedListing.id });
                  setContactFormSent(true);
                  setContactForm({ name: "", email: "", phone: "", message: "", testToEmail: contactForm.testToEmail });
                } catch (err) {
                  setContactFormError(formatContactMessageError(err));
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

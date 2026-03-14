import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import DirectoryMap from "../components/DirectoryMap.jsx";
import LogoImage from "../components/LogoImage.jsx";

function buildSearchIndex(listing, groupName = "") {
  const parts = [
    listing.name,
    listing.email,
    listing.phone,
    listing.website_url,
    listing.address,
    listing.postcode,
    listing.country,
    listing.city,
    groupName,
  ].filter(Boolean);
  return parts.join(" ").toLowerCase();
}

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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [openGroupIds, setOpenGroupIds] = useState(new Set());
  const [selectedMarkerPoint, setSelectedMarkerPoint] = useState(null);
  const [clampedPanelPosition, setClampedPanelPosition] = useState(null);
  const pinOverlayRef = useRef(null);

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

  const groupNameById = useMemo(() => {
    const m = new Map();
    groups.forEach((gr) => m.set(gr.id, gr.name || ""));
    return m;
  }, [groups]);

  const searchIndex = useMemo(() => {
    return (listings || []).map((listing) => ({
      listing,
      searchText: buildSearchIndex(listing, groupNameById.get(listing.group_id) || ""),
    }));
  }, [listings, groupNameById]);

  const suggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return searchIndex
      .filter(({ searchText }) => searchText.includes(q))
      .map(({ listing }) => listing)
      .slice(0, 10);
  }, [searchIndex, searchQuery]);

  const listingsByGroup = useMemo(() => {
    const active = (listings || []).filter((l) => l.is_active !== false);
    const byGroup = new Map();
    byGroup.set(null, []);
    groups.forEach((gr) => byGroup.set(gr.id, []));
    active.forEach((listing) => {
      const key = listing.group_id ?? null;
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key).push(listing);
    });
    groups.forEach((gr) => byGroup.get(gr.id)?.sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    byGroup.get(null)?.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return byGroup;
  }, [listings, groups]);

  function toggleGroup(id) {
    setOpenGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectListing(listing) {
    setSelectedListing(listing);
    setCenterOnListingId(listing.id);
    setSelectedMarkerPoint(null);
    setClampedPanelPosition(null);
    setSearchQuery("");
  }

  function zoomToSelectedAddress() {
    if (!selectedListing) return;
    setCenterOnListingId(selectedListing.id);
  }

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

  return (
    <div style={{ width: "100%", height: "100vh", position: "relative" }}>
      <DirectoryMap
        apiKey={apiKey}
        center={{ lat: effectiveDefaults.lat, lng: effectiveDefaults.lng }}
        zoom={effectiveDefaults.zoom}
        listings={listings}
        onSelect={(listing, point) => {
          setSelectedListing(listing);
          setSelectedMarkerPoint(point ?? null);
          setClampedPanelPosition(null);
        }}
        centerOnListingId={centerOnListingId}
        defaultMarkerColor={effectiveDefaults.markerColor}
        markerStyle={effectiveDefaults.markerStyle}
        customMarkerIconUrl={effectiveDefaults.customPinUrl}
        enableClustering={effectiveDefaults.enableClustering}
        clusterRadius={effectiveDefaults.clusterRadius}
        clusterColor={(() => {
          try {
            const t =
              typeof effectiveDefaults.themeSource === "string"
                ? JSON.parse(effectiveDefaults.themeSource || "{}")
                : effectiveDefaults.themeSource || {};
            return t.clusterColor || "#4A9BAA";
          } catch (_) {
            return "#4A9BAA";
          }
        })()}
        pinBorderColor={(() => {
          try {
            const t =
              typeof effectiveDefaults.themeSource === "string"
                ? JSON.parse(effectiveDefaults.themeSource || "{}")
                : effectiveDefaults.themeSource || {};
            return t.pinBorderColor || "#ffffff";
          } catch (_) {
            return "#ffffff";
          }
        })()}
        pinBorderSize={(() => {
          try {
            const t =
              typeof effectiveDefaults.themeSource === "string"
                ? JSON.parse(effectiveDefaults.themeSource || "{}")
                : effectiveDefaults.themeSource || {};
            return Math.max(0, Math.min(5, Number(t.pinBorderSize) ?? 0));
          } catch (_) {
            return 0;
          }
        })()}
        pinFaviconUrl={(() => {
          try {
            const t =
              typeof effectiveDefaults.themeSource === "string"
                ? JSON.parse(effectiveDefaults.themeSource || "{}")
                : effectiveDefaults.themeSource || {};
            const url = t.pin_favicon_url;
            return url && typeof url === "string" ? url.trim() || null : null;
          } catch (_) {
            return null;
          }
        })()}
      />

      {effectiveDefaults.showListPanel && (
        <div className="embed-list-panel">
          <div className="embed-list-panel__search-wrap">
            <input
              type="text"
              className="embed-list-panel__search"
              placeholder="Search…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
              aria-label="Search listings"
            />
            {searchFocused && suggestions.length > 0 && (
              <ul className="embed-list-panel__suggestions" role="listbox">
                {suggestions.map((listing) => (
                  <li
                    key={listing.id}
                    className="embed-list-panel__suggestion"
                    role="option"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectListing(listing);
                    }}
                  >
                    {listing.name || "—"}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="embed-list-panel__groups">
            {groups.map((gr) => {
              const entries = listingsByGroup.get(gr.id) || [];
              if (entries.length === 0) return null;
              const isOpen = openGroupIds.has(gr.id);
              return (
                <div key={gr.id} className="embed-list-panel__group">
                  <button
                    type="button"
                    className="embed-list-panel__group-head"
                    onClick={() => toggleGroup(gr.id)}
                    aria-expanded={isOpen}
                  >
                    <span className="embed-list-panel__group-name">{gr.name || "—"}</span>
                    <span className="embed-list-panel__group-count">{entries.length}</span>
                    <span className="embed-list-panel__group-chevron" aria-hidden>
                      {isOpen ? "▼" : "▶"}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="embed-list-panel__group-body">
                      <ul className="embed-list-panel__entries" role="list">
                        {entries.map((listing) => (
                          <li key={listing.id}>
                            <button
                              type="button"
                              className="embed-list-panel__entry"
                              onClick={() => selectListing(listing)}
                            >
                              {listing.name || "—"}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
            {(listingsByGroup.get(null) || []).length > 0 && (
              <div className="embed-list-panel__group">
                <button
                  type="button"
                  className="embed-list-panel__group-head"
                  onClick={() => toggleGroup("ungrouped")}
                  aria-expanded={openGroupIds.has("ungrouped")}
                >
                  <span className="embed-list-panel__group-name">Ungrouped</span>
                  <span className="embed-list-panel__group-count">
                    {(listingsByGroup.get(null) || []).length}
                  </span>
                  <span className="embed-list-panel__group-chevron" aria-hidden>
                    {openGroupIds.has("ungrouped") ? "▼" : "▶"}
                  </span>
                </button>
                {openGroupIds.has("ungrouped") && (
                  <div className="embed-list-panel__group-body">
                    <ul className="embed-list-panel__entries" role="list">
                      {(listingsByGroup.get(null) || []).map((listing) => (
                        <li key={listing.id}>
                          <button
                            type="button"
                            className="embed-list-panel__entry"
                            onClick={() => selectListing(listing)}
                          >
                            {listing.name || "—"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {selectedListing ? (
        <div
          ref={pinOverlayRef}
          className="map-pin-overlay"
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
                  maxWidth: "min(340px, calc(100% - 24px))",
                }
              : undefined
          }
        >
          <button
            type="button"
            className="map-pin-overlay__close"
            onClick={() => setSelectedListing(null)}
            aria-label="Close"
          >
            ×
          </button>
          <div className="map-pin-overlay__logo">
            {selectedListing.logo_url ? (
              <LogoImage
                src={selectedListing.logo_url}
                wrapClassName="map-pin-overlay__image-wrap"
                imgClassName="map-pin-overlay__image"
                maxWidth={280}
                maxHeight={90}
              />
            ) : (
              <div className="map-pin-overlay__logo-placeholder">Logo</div>
            )}
          </div>
          <div className="map-pin-overlay__body" style={{ background: "rgba(255, 255, 255, 0.9)" }}>
            <h3 className="map-pin-overlay__name">{selectedListing.name || "—"}</h3>
            {selectedListing.address ? (
              <p className="map-pin-overlay__row map-pin-overlay__address">
                <button
                  type="button"
                  className="map-pin-overlay__address-btn"
                  onClick={zoomToSelectedAddress}
                >
                  {selectedListing.address}
                </button>
              </p>
            ) : null}
            {selectedListing.email ? (
              <p className="map-pin-overlay__row">
                <span>Email: </span>
                <a href={`mailto:${selectedListing.email}`}>{selectedListing.email}</a>
              </p>
            ) : null}
            {selectedListing.phone ? (
              <p className="map-pin-overlay__row">
                <span>Phone: </span>
                {selectedListing.phone}
              </p>
            ) : null}
            {selectedListing.website_url ? (
              <p className="map-pin-overlay__row">
                <a
                  href={
                    selectedListing.website_url.startsWith("http")
                      ? selectedListing.website_url
                      : `https://${selectedListing.website_url}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Website: {selectedListing.website_url}
                </a>
              </p>
            ) : null}
            {selectedListing.website_url ? (
              <div className="map-pin-overlay__actions">
                <a
                  href={
                    selectedListing.website_url.startsWith("http")
                      ? selectedListing.website_url
                      : `https://${selectedListing.website_url}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="map-pin-overlay__visit-btn"
                  style={{ backgroundColor: primaryColor }}
                >
                  Visit website
                </a>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

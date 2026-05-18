import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import DirectoryMap from "./DirectoryMap.jsx";
import LogoImage from "./LogoImage.jsx";
import { normalizePinSize } from "../lib/markerIcons";
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

/** Serialize Geocoding API JSON `results[]` item (same shape as ClientMapDashboard `lookupLocation`). */
function geocodeJsonResultToPlace(r) {
  const out = {
    key: r.place_id || r.formatted_address,
    formattedAddress: r.formatted_address,
    types: r.types || [],
    viewport: null,
    location: null,
  };
  const geom = r.geometry;
  function num(v) {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (geom?.viewport) {
    const vp = geom.viewport;
    const ne = vp.northeast;
    const sw = vp.southwest;
    const n = ne && num(ne.lat);
    const e = ne && num(ne.lng);
    const s = sw && num(sw.lat);
    const w = sw && num(sw.lng);
    if (n != null && e != null && s != null && w != null) {
      out.viewport = { north: n, east: e, south: s, west: w };
    }
  }
  if (!out.viewport && geom?.bounds) {
    const b = geom.bounds;
    const ne = b.northeast;
    const sw = b.southwest;
    const n = ne && num(ne.lat);
    const e = ne && num(ne.lng);
    const s = sw && num(sw.lat);
    const w = sw && num(sw.lng);
    if (n != null && e != null && s != null && w != null) {
      out.viewport = { north: n, east: e, south: s, west: w };
    }
  }
  if (geom?.location) {
    const loc = geom.location;
    const lat = typeof loc.lat === "function" ? loc.lat() : num(loc.lat);
    const lng = typeof loc.lng === "function" ? loc.lng() : num(loc.lng);
    if (lat != null && lng != null) {
      out.location = { lat, lng };
    }
  }
  if (!out.location && out.viewport) {
    const b = out.viewport;
    out.location = { lat: (b.north + b.south) / 2, lng: (b.east + b.west) / 2 };
  }
  return out;
}

function zoomForGeocodeTypes(types) {
  const t = types || [];
  if (t.includes("continent")) return 3;
  if (t.includes("country")) return 5;
  if (t.includes("administrative_area_level_1")) return 6;
  if (t.includes("locality")) return 10;
  if (t.includes("postal_code")) return 12;
  return 8;
}

function ListingCardContent({
  listing,
  buttonColor,
  showSendMessage,
  onOpenSendMessage,
  zoomToSelectedAddress,
  onClosePin,
  extended,
  recordEngagement,
}) {
  const notes = listing.notes_html ? String(listing.notes_html).trim() : "";
  return (
    <>
      <button type="button" className="map-pin-overlay__close" onClick={onClosePin} aria-label="Close">
        ×
      </button>
      <div className="map-pin-overlay__logo">
        {listing.logo_url ? (
          <LogoImage
            src={listing.logo_url}
            wrapClassName="map-pin-overlay__image-wrap"
            imgClassName="map-pin-overlay__image"
            maxWidth={280}
            maxHeight={90}
          />
        ) : (
          <div className="map-pin-overlay__logo-placeholder">Logo</div>
        )}
      </div>
      <div className={`map-pin-overlay__body${extended ? " map-pin-overlay__body--extended" : ""}`}>
        <h3 className="map-pin-overlay__name">{listing.name || "—"}</h3>
        {listing.address ? (
          <p className="map-pin-overlay__row map-pin-overlay__address">
            <button type="button" className="map-pin-overlay__address-btn" onClick={zoomToSelectedAddress}>
              {listing.address}
            </button>
          </p>
        ) : null}
        {listing.email ? (
          <p className="map-pin-overlay__row">
            <span>Email: </span>
            <a
              href={`mailto:${listing.email}`}
              onClick={() => recordEngagement?.("email_click", { listingId: listing.id })}
            >
              {listing.email}
            </a>
          </p>
        ) : null}
        {listing.phone ? (
          <p className="map-pin-overlay__row">
            <span>Phone: </span>
            {listing.phone}
          </p>
        ) : null}
        <div className="map-pin-overlay__actions" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {listing.website_url ? (
            <a
              href={listing.website_url.startsWith("http") ? listing.website_url : `https://${listing.website_url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="map-pin-overlay__visit-btn"
              style={{ backgroundColor: buttonColor }}
              onClick={() => recordEngagement?.("website_click", { listingId: listing.id })}
            >
              Visit website
            </a>
          ) : null}
          {showSendMessage && listing.email ? (
            <button
              type="button"
              className="map-pin-overlay__visit-btn"
              style={{ backgroundColor: buttonColor }}
              onClick={() => {
                recordEngagement?.("message_compose_open", { listingId: listing.id });
                onOpenSendMessage?.();
              }}
            >
              Send message
            </button>
          ) : null}
        </div>
        {notes ? (
          <div className={`map-pin-overlay__notes${extended ? "" : " map-pin-overlay__notes--compact"}`}>
            {listing.allow_html ? (
              <div className="map-pin-overlay__notes-html" dangerouslySetInnerHTML={{ __html: notes }} />
            ) : (
              <div className="map-pin-overlay__notes-plain">{notes}</div>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}

/**
 * Renders the map + list panel + pin overlay exactly as published/embed.
 * Use in EmbedMap, AdminMapDashboard, and ClientMapDashboard so edit view matches published view.
 */
export default function PublishedMapView({
  apiKey,
  center,
  zoom,
  mapTypeId,
  listings = [],
  groups = [],
  showListPanel = true,
  showSearch = true,
  showGroupDropdowns = true,
  enableClustering = true,
  clusterRadius = 80,
  markerStyle = "pin",
  markerColor = "#4A9BAA",
  customPinUrl = null,
  clusterColor = "#4A9BAA",
  clusterOpacity = 1,
  pinBorderColor = "#ffffff",
  pinBorderSize = 0,
  pinFaviconUrl = null,
  theme = {},
  selectedListing,
  selectedMarkerPoint,
  clampedPanelPosition,
  setClampedPanelPosition,
  pinOverlayRef,
  onSelectMarker,
  /** Called when map pans/zooms while a listing panel is open — keeps overlay aligned to the pin */
  onMarkerScreenPosition,
  onClosePin,
  centerOnListingId = null,
  setCenterOnListingId,
  showSendMessage = false,
  onOpenSendMessage,
  height = "100%",
  listingsWithColor, // optional: listings with group color applied (for admin/client); falls back to listings
  /** @see DirectoryMap — `cooperative` avoids wheel zoom over the map while keeping pinch/2-finger zoom; embed passes this explicitly */
  gestureHandling = "cooperative",
  /** Optional: e.g. {@link createMapEngagementRecorder} from embed for analytics */
  recordEngagement,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [openGroupIds, setOpenGroupIds] = useState(new Set());
  const [hiddenGroupIds, setHiddenGroupIds] = useState(new Set());
  const [placeSuggestions, setPlaceSuggestions] = useState([]);
  const [placeSearchLoading, setPlaceSearchLoading] = useState(false);
  const [cameraRequest, setCameraRequest] = useState(null);
  const cameraSeqRef = useRef(0);
  const searchWrapRef = useRef(null);
  /** Skip duplicate listing_panel_open when list pick triggers DirectoryMap center + onSelect with pixel */
  const suppressListingOpenEngagementRef = useRef(false);
  /** Dedupe debounced search query events per session */
  const lastSearchQueryLoggedRef = useRef("");
  /** Combined keyboard highlight: 0…places-1 = geocode rows, places… = directory listings (-1 = none) */
  const [searchHighlightIndex, setSearchHighlightIndex] = useState(-1);

  const mapFitBoundsPadding = useMemo(
    () => ({
      top: 44,
      right: 44,
      bottom: 44,
      left: showListPanel !== false ? 300 : 48,
    }),
    [showListPanel]
  );

  const panelBg = theme.panelBg ?? "rgba(228, 240, 255, 0.88)";
  const panelLinkColor = theme.panelLinkColor ?? "#4A9BAA";
  const buttonColor = theme.buttonColor ?? markerColor ?? "#4A9BAA";
  const pinDetailLayout = theme.pinDetailLayout === "drawer" ? "drawer" : "map";
  const panelBorderRadius = Math.max(0, Math.min(28, Number(theme.panelBorderRadius) || 12));
  const pinSize = normalizePinSize(theme.pinSize);

  const list = listingsWithColor ?? listings;

  const effectiveListings = useMemo(() => {
    if (!list) return [];
    return list.filter((l) => {
      const key = l.group_id ?? null;
      return !hiddenGroupIds.has(key);
    });
  }, [list, hiddenGroupIds]);

  const groupNameById = useMemo(() => {
    const m = new Map();
    (groups || []).forEach((gr) => m.set(gr.id, gr.name || ""));
    return m;
  }, [groups]);

  const searchIndex = useMemo(() => {
    return (effectiveListings || []).map((listing) => ({
      listing,
      searchText: buildSearchIndex(listing, groupNameById.get(listing.group_id) || ""),
    }));
  }, [effectiveListings, groupNameById]);

  const suggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return searchIndex
      .filter(({ searchText }) => searchText.includes(q))
      .map(({ listing }) => listing)
      .slice(0, 10);
  }, [searchIndex, searchQuery]);

  function recordSearchEngagement(action, extra = {}) {
    if (!recordEngagement) return;
    const query = searchQuery.trim().slice(0, 500);
    if (!query) return;
    recordEngagement("search", {
      meta: { query, action, ...extra },
    });
  }

  useEffect(() => {
    if (!recordEngagement) return;
    const query = searchQuery.trim();
    if (query.length < 2) return;
    const handle = window.setTimeout(() => {
      if (searchQuery.trim() !== query) return;
      if (lastSearchQueryLoggedRef.current === query) return;
      lastSearchQueryLoggedRef.current = query;
      recordSearchEngagement("query", {
        listing_count: suggestions.length,
        place_count: placeSuggestions.length,
      });
    }, 600);
    return () => window.clearTimeout(handle);
  }, [searchQuery, recordEngagement, suggestions.length, placeSuggestions.length]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) lastSearchQueryLoggedRef.current = "";
  }, [searchQuery]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!apiKey || q.length < 2) {
      setPlaceSuggestions([]);
      setPlaceSearchLoading(false);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      if (cancelled) return;
      setPlaceSearchLoading(true);
      (async () => {
        try {
          const url =
            "https://maps.googleapis.com/maps/api/geocode/json?address=" +
            encodeURIComponent(q) +
            "&language=en&key=" +
            encodeURIComponent(apiKey);
          const res = await fetch(url);
          const json = await res.json();
          if (cancelled) return;
          setPlaceSearchLoading(false);
          if (json.status !== "OK" || !json.results?.length) {
            setPlaceSuggestions([]);
            return;
          }
          const mapped = json.results
            .slice(0, 5)
            .map(geocodeJsonResultToPlace)
            .filter((p) => p.viewport || p.location);
          setPlaceSuggestions(mapped);
        } catch {
          if (!cancelled) {
            setPlaceSearchLoading(false);
            setPlaceSuggestions([]);
          }
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
      setPlaceSearchLoading(false);
    };
  }, [searchQuery, apiKey]);

  const listingsByGroup = useMemo(() => {
    const active = (listings || []).filter((l) => l.is_active !== false);
    const byGroup = new Map();
    byGroup.set(null, []);
    (groups || []).forEach((gr) => byGroup.set(gr.id, []));
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
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        recordEngagement?.("directory_group_expand", {
          meta: { group_id: id === "ungrouped" ? "ungrouped" : id },
        });
      }
      return next;
    });
  }

  function toggleGroupVisibility(id) {
    setHiddenGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectFromList(listing, source, { skipSearchRecord = false } = {}) {
    if (source === "search" && !skipSearchRecord) {
      recordSearchEngagement("select_listing", { listing_id: listing?.id ?? null });
    }
    recordEngagement?.("listing_panel_open", { listingId: listing?.id, meta: { source } });
    onSelectMarker(listing, null);
    suppressListingOpenEngagementRef.current = true;
    if (setCenterOnListingId) setCenterOnListingId(listing.id);
    setSearchQuery("");
  }

  function handleDirectoryMapSelect(listing, point) {
    if (suppressListingOpenEngagementRef.current) {
      suppressListingOpenEngagementRef.current = false;
    } else if (recordEngagement && listing?.id) {
      recordEngagement("listing_panel_open", { listingId: listing.id, meta: { source: "marker" } });
    }
    onSelectMarker(listing, point);
  }

  function zoomToSelectedAddress() {
    if (selectedListing && setCenterOnListingId) setCenterOnListingId(selectedListing.id);
  }

  function selectPlaceFromGeocode(place, { skipSearchRecord = false } = {}) {
    if (!skipSearchRecord) {
      recordSearchEngagement("select_place", {
        place_address: place?.formattedAddress ?? null,
      });
    }
    cameraSeqRef.current += 1;
    const id = cameraSeqRef.current;
    if (place.viewport) {
      setCameraRequest({ id, bounds: place.viewport });
    } else if (place.location) {
      setCameraRequest({
        id,
        center: place.location,
        zoom: zoomForGeocodeTypes(place.types),
      });
    }
    onClosePin?.();
    setSearchQuery("");
    setSearchFocused(false);
  }

  useLayoutEffect(() => {
    if (pinDetailLayout === "drawer") {
      setClampedPanelPosition?.(null);
      return;
    }
    if (!selectedMarkerPoint || !pinOverlayRef?.current) return;
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
    setClampedPanelPosition?.({ top, right });
  }, [pinDetailLayout, selectedMarkerPoint, selectedListing, pinOverlayRef, setClampedPanelPosition]);

  const searchDropdownOpen = useMemo(() => {
    const t = searchQuery.trim();
    if (t.length < 2) return false;
    const hasListings = suggestions.length > 0;
    const hasPlaces = placeSuggestions.length > 0;
    return (
      (hasListings || hasPlaces || placeSearchLoading) &&
      (searchFocused || hasPlaces || placeSearchLoading)
    );
  }, [searchQuery, suggestions.length, placeSuggestions.length, placeSearchLoading, searchFocused]);

  useEffect(() => {
    if (!searchDropdownOpen) return;
    function onDocMouseDown(e) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
        setSearchFocused(false);
        setPlaceSuggestions([]);
        setPlaceSearchLoading(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [searchDropdownOpen]);

  useEffect(() => {
    if (!searchDropdownOpen) setSearchHighlightIndex(-1);
  }, [searchDropdownOpen]);

  useEffect(() => {
    setSearchHighlightIndex(-1);
  }, [searchQuery, placeSuggestions.length, suggestions.length]);

  const searchNavTotal = placeSuggestions.length + suggestions.length;

  useEffect(() => {
    if (searchHighlightIndex < 0 || !searchDropdownOpen || searchNavTotal === 0) return;
    const el = document.getElementById(`embed-search-opt-${searchHighlightIndex}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [searchHighlightIndex, searchDropdownOpen, searchNavTotal]);

  function applySearchEnter() {
    const query = searchQuery.trim();
    if (!query) return;
    const firstListing = suggestions[0];
    const firstPlace = placeSuggestions[0];
    if (searchHighlightIndex >= 0 && searchNavTotal > 0) {
      const pCount = placeSuggestions.length;
      if (searchHighlightIndex < pCount) {
        const place = placeSuggestions[searchHighlightIndex];
        recordSearchEngagement("submit", {
          result: "place",
          place_address: place?.formattedAddress ?? null,
        });
        selectPlaceFromGeocode(place, { skipSearchRecord: true });
      } else {
        const listing = suggestions[searchHighlightIndex - pCount];
        recordSearchEngagement("submit", {
          result: "listing",
          listing_id: listing?.id ?? null,
        });
        selectFromList(listing, "search", { skipSearchRecord: true });
      }
      return;
    }
    if (firstPlace) {
      recordSearchEngagement("submit", {
        result: "place",
        place_address: firstPlace.formattedAddress ?? null,
      });
      selectPlaceFromGeocode(firstPlace, { skipSearchRecord: true });
    } else if (firstListing) {
      recordSearchEngagement("submit", {
        result: "listing",
        listing_id: firstListing.id ?? null,
      });
      selectFromList(firstListing, "search", { skipSearchRecord: true });
    } else {
      recordSearchEngagement("submit", { result: "none" });
    }
  }

  return (
    <div
      style={{
        width: "100%",
        height,
        position: "relative",
        ["--panel-bg"]: panelBg,
        ["--panel-link"]: panelLinkColor,
        ["--panel-radius"]: `${panelBorderRadius}px`,
      }}
    >
      <DirectoryMap
        apiKey={apiKey}
        center={center}
        zoom={zoom}
        mapTypeId={mapTypeId}
        listings={effectiveListings}
        onSelect={handleDirectoryMapSelect}
        centerOnListingId={centerOnListingId}
        defaultMarkerColor={markerColor}
        markerStyle={markerStyle}
        customMarkerIconUrl={customPinUrl}
        enableClustering={enableClustering}
        clusterRadius={clusterRadius}
        clusterColor={clusterColor}
        clusterOpacity={clusterOpacity}
        pinBorderColor={pinBorderColor}
        pinBorderSize={pinBorderSize}
        pinFaviconUrl={pinFaviconUrl}
        pinSize={pinSize}
        height="100%"
        gestureHandling={gestureHandling}
        cameraRequest={cameraRequest}
        mapFitBoundsPadding={mapFitBoundsPadding}
        screenOverlayListing={pinDetailLayout === "map" ? selectedListing : null}
        onScreenOverlayPosition={onMarkerScreenPosition}
        selectZoom={17}
        selectPanOffsetX={pinDetailLayout === "drawer" ? 200 : 0}
      />

      {showListPanel && (
        <div className="embed-list-panel">
          {showSearch !== false && (
          <div className="embed-list-panel__search-wrap" ref={searchWrapRef}>
            <input
              type="text"
              className="embed-list-panel__search"
              placeholder="Search listings or places…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
              onKeyDown={(e) => {
                const navTotal = placeSuggestions.length + suggestions.length;
                const canNav = searchDropdownOpen && navTotal > 0;

                if (canNav && e.key === "ArrowDown") {
                  e.preventDefault();
                  setSearchHighlightIndex((i) => {
                    if (navTotal === 0) return -1;
                    if (i < 0) return 0;
                    return Math.min(i + 1, navTotal - 1);
                  });
                  return;
                }
                if (canNav && e.key === "ArrowUp") {
                  e.preventDefault();
                  setSearchHighlightIndex((i) => {
                    if (navTotal === 0) return -1;
                    if (i <= 0) return -1;
                    return i - 1;
                  });
                  return;
                }

                if (e.key === "Enter") {
                  e.preventDefault();
                  if (navTotal > 0) {
                    applySearchEnter();
                  } else if (searchQuery.trim().length >= 2) {
                    recordSearchEngagement("submit", { result: "none" });
                  }
                }
              }}
              aria-autocomplete="list"
              aria-controls="embed-search-listbox"
              aria-activedescendant={
                searchHighlightIndex >= 0 ? `embed-search-opt-${searchHighlightIndex}` : undefined
              }
              aria-label="Search listings and map places"
            />
            {searchDropdownOpen && (
              <ul
                id="embed-search-listbox"
                className="embed-list-panel__suggestions"
                role="listbox"
              >
                {placeSearchLoading && placeSuggestions.length === 0 ? (
                  <li className="embed-list-panel__suggestion embed-list-panel__suggestion--loading" role="status">
                    Searching places…
                  </li>
                ) : null}
                {placeSuggestions.map((place, pi) => (
                  <li
                    id={`embed-search-opt-${pi}`}
                    key={place.key}
                    className={`embed-list-panel__suggestion embed-list-panel__suggestion--place${
                      searchHighlightIndex === pi ? " embed-list-panel__suggestion--active" : ""
                    }`}
                    role="option"
                    aria-selected={searchHighlightIndex === pi}
                    onMouseEnter={() => setSearchHighlightIndex(pi)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectPlaceFromGeocode(place);
                    }}
                  >
                    {place.formattedAddress}
                  </li>
                ))}
                {suggestions.length > 0 ? (
                  <>
                    {(placeSuggestions.length > 0 || placeSearchLoading) && (
                      <li className="embed-list-panel__suggestions-divider" aria-hidden>
                        <span className="embed-list-panel__section-label">Directory listings</span>
                      </li>
                    )}
                    {suggestions.map((listing, li) => {
                      const gIdx = placeSuggestions.length + li;
                      return (
                        <li
                          id={`embed-search-opt-${gIdx}`}
                          key={listing.id}
                          className={`embed-list-panel__suggestion${
                            searchHighlightIndex === gIdx ? " embed-list-panel__suggestion--active" : ""
                          }`}
                          role="option"
                          aria-selected={searchHighlightIndex === gIdx}
                          onMouseEnter={() => setSearchHighlightIndex(gIdx)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectFromList(listing, "search");
                      }}
                        >
                          {listing.name || "—"}
                        </li>
                      );
                    })}
                  </>
                ) : null}
              </ul>
            )}
          </div>
          )}
          {showGroupDropdowns !== false && (
          <div className="embed-list-panel__groups">
            {(groups || []).map((gr) => {
              const entries = listingsByGroup.get(gr.id) || [];
              const isOpen = openGroupIds.has(gr.id);
              const isHidden = hiddenGroupIds.has(gr.id);
              return (
                <div key={gr.id} className="embed-list-panel__group">
                  <button
                    type="button"
                    className="embed-list-panel__group-head"
                    onClick={() => toggleGroup(gr.id)}
                    aria-expanded={isOpen}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={!isHidden}
                        onChange={() => toggleGroupVisibility(gr.id)}
                        aria-label={isHidden ? `Show ${gr.name || "category"}` : `Hide ${gr.name || "category"}`}
                        style={{ margin: 0 }}
                      />
                      <span className="embed-list-panel__group-name">{gr.name || "—"}</span>
                    </span>
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
                              onClick={() => selectFromList(listing, "list_panel")}
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
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={!hiddenGroupIds.has(null)}
                      onChange={() => toggleGroupVisibility(null)}
                      aria-label={hiddenGroupIds.has(null) ? "Show ungrouped category" : "Hide ungrouped category"}
                      style={{ margin: 0 }}
                    />
                    <span className="embed-list-panel__group-name">Ungrouped</span>
                  </span>
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
                            onClick={() => selectFromList(listing, "list_panel")}
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
          )}
        </div>
      )}

      {selectedListing && pinDetailLayout === "map" ? (
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
          <ListingCardContent
            listing={selectedListing}
            buttonColor={buttonColor}
            showSendMessage={showSendMessage}
            onOpenSendMessage={onOpenSendMessage}
            zoomToSelectedAddress={zoomToSelectedAddress}
            onClosePin={onClosePin}
            extended={false}
            recordEngagement={recordEngagement}
          />
        </div>
      ) : null}

      {selectedListing && pinDetailLayout === "drawer" ? (
        <div className="map-pin-drawer map-pin-drawer--open" role="presentation">
          <button type="button" className="map-pin-drawer__backdrop" onClick={onClosePin} aria-label="Close listing" />
          <div className="map-pin-drawer__sheet" role="dialog" aria-label="Listing details">
            <div ref={pinOverlayRef} className="map-pin-overlay map-pin-overlay--in-drawer">
              <ListingCardContent
                listing={selectedListing}
                buttonColor={buttonColor}
                showSendMessage={showSendMessage}
                onOpenSendMessage={onOpenSendMessage}
                zoomToSelectedAddress={zoomToSelectedAddress}
                onClosePin={onClosePin}
                extended
                recordEngagement={recordEngagement}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import DirectoryMap from "./DirectoryMap.jsx";
import LogoImage from "./LogoImage.jsx";
import { normalizePinSize } from "../lib/markerIcons";
import { continentForCountry } from "../lib/continents";
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
      <div
        className="map-pin-overlay__logo"
        style={{
          background: listing.logo_bg || "#ffffff",
        }}
      >
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
        {(listing.address || listing.postcode || listing.country) ? (
          <p className="map-pin-overlay__row map-pin-overlay__address">
            {[listing.address, listing.postcode, listing.country].filter(Boolean).join(", ")}
          </p>
        ) : null}
        {listing.email && !showSendMessage ? (
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
  /** Published, filter-bar-visible custom filter fields (with options). Each listing carries `filterValues`. */
  filterFields = [],
  showListPanel = true,
  mapName = "",
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
  pinDropShadow = 0,
  pinShadowDistance = 20,
  pinShadowOpacity = 100,
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
  mapStyles = null,
  showTrafficLayer = false,
  showTransitLayer = false,
  showBikeLayer = false,
  showZoomIndicator = false,
  /** Overlays rendered inside the fullscreen root (e.g. message drawer) */
  mapOverlay = null,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  /** Group ids selected as active filters. Empty set = show every group. */
  const [activeGroupIds, setActiveGroupIds] = useState(() => new Set());
  /** Continent names selected as active filters. Empty set = show every continent. */
  const [activeContinents, setActiveContinents] = useState(() => new Set());
  /**
   * Custom filter field selections, keyed by field id.
   * Select fields → Set(optionId); text fields → string query.
   */
  const [activeFilters, setActiveFilters] = useState(() => ({}));
  /** UI-only typeahead query per field (narrows which option chips show; not itself a filter). */
  const [typeaheadQuery, setTypeaheadQuery] = useState(() => ({}));
  /** Track which text fields we've already logged an engagement for this session. */
  const loggedTextFilterRef = useRef(new Set());
  const [placeSuggestions, setPlaceSuggestions] = useState([]);
  const [placeSearchLoading, setPlaceSearchLoading] = useState(false);
  const [cameraRequest, setCameraRequest] = useState(null);
  const cameraSeqRef = useRef(0);
  const searchWrapRef = useRef(null);

  // Mobile bottom sheet
  const [isMobileSheet, setIsMobileSheet] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches
  );
  const [sheetSnap, setSheetSnap] = useState("peek"); // 'peek' | 'half'
  const [dragY, setDragY] = useState(null); // null = at peek (snap), number = free-positioned Y
  const [isDragging, setIsDragging] = useState(false);
  const sheetRef = useRef(null);
  const handleRef = useRef(null); // touch drag target
  const touchHandlerRef = useRef(null); // latest touch callbacks (avoids stale closures)
  const dragStartRef = useRef(null);
  const PEEK_PX = 108;

  // Listing detail bottom sheet (mobile only)
  const [listingSheetH, setListingSheetH] = useState(null); // null = default height (60% of container)
  const [isListingDragging, setIsListingDragging] = useState(false);
  const listingHandleRef = useRef(null);
  const listingTouchHandlerRef = useRef(null);
  const listingDragStartRef = useRef(null);
  /** Skip duplicate listing_panel_open when list pick triggers DirectoryMap center + onSelect with pixel */
  const suppressListingOpenEngagementRef = useRef(false);
  /** Dedupe debounced search query events per session */
  const lastSearchQueryLoggedRef = useRef("");
  /** Combined keyboard highlight: 0…places-1 = geocode rows, places… = directory listings (-1 = none) */
  const [searchHighlightIndex, setSearchHighlightIndex] = useState(-1);

  const mapFitBoundsPadding = useMemo(
    () =>
      isMobileSheet
        ? { top: 44, right: 44, bottom: PEEK_PX + 24, left: 44 }
        : { top: 44, right: 44, bottom: 44, left: showListPanel !== false ? 300 : 48 },
    [showListPanel, isMobileSheet]
  );

  const panelBg = theme.panelBg ?? "rgba(228, 240, 255, 0.88)";
  const panelLinkColor = theme.panelLinkColor ?? "#4A9BAA";
  const buttonColor = theme.buttonColor ?? markerColor ?? "#4A9BAA";
  const pinDetailLayout = theme.pinDetailLayout === "drawer" ? "drawer" : "map";
  const panelBorderRadius = Math.max(0, Math.min(28, Number(theme.panelBorderRadius) || 12));
  const pinSize = normalizePinSize(theme.pinSize);

  // New search-panel theme settings (configured in the Search tab).
  const logoUrl = (theme.logoUrl && String(theme.logoUrl).trim()) || "";
  const description = (theme.description && String(theme.description).trim()) || "";
  const searchPanelBg = theme.searchPanelBg ?? panelBg;
  const listingBg = theme.listingBg ?? "#ffffff";
  const listingBorder = theme.listingBorder ?? "#e5e7eb";
  // Display options (Search tab): Key shows by default; continent filter is opt-in.
  const showKey = theme.showKey !== false;
  const showContinentFilter = theme.showContinentFilter === true;

  const list = listingsWithColor ?? listings;

  /** Per-group display metadata (name + colours) resolved from group theme overrides. */
  const groupMeta = useMemo(() => {
    const m = new Map();
    (groups || []).forEach((gr) => {
      const grTheme =
        typeof gr.theme_json === "string"
          ? (() => {
              try {
                return JSON.parse(gr.theme_json || "null");
              } catch {
                return null;
              }
            })()
          : gr.theme_json;
      m.set(gr.id, {
        name: gr.name || "",
        color: grTheme?.marker_color ?? gr.color ?? markerColor,
        border: grTheme?.pinBorderColor ?? pinBorderColor,
      });
    });
    return m;
  }, [groups, markerColor, pinBorderColor]);

  /** Continents present across the active listings (for the continent filter chips). */
  const continentsPresent = useMemo(() => {
    const s = new Set();
    (list || []).forEach((l) => {
      if (l.is_active === false) return;
      const c = continentForCountry(l.country);
      if (c) s.add(c);
    });
    return [...s].sort();
  }, [list]);

  /** Filter-bar-visible custom fields, in display order. */
  const visibleFilterFields = useMemo(
    () =>
      (filterFields || [])
        .filter((f) => f && f.show_in_filter_bar)
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [filterFields]
  );

  /** listingId -> fieldId -> { options:Set(optionId), texts:string[] } */
  const listingFilterIndex = useMemo(() => {
    const m = new Map();
    (list || []).forEach((l) => {
      const perField = new Map();
      (l.filterValues || []).forEach((v) => {
        if (!v || v.field_id == null) return;
        if (!perField.has(v.field_id)) perField.set(v.field_id, { options: new Set(), texts: [] });
        const e = perField.get(v.field_id);
        if (v.option_id != null) e.options.add(v.option_id);
        if (v.value_text) e.texts.push(String(v.value_text).toLowerCase());
      });
      m.set(l.id, perField);
    });
    return m;
  }, [list]);

  /** Option ids that at least one listing on the map actually carries. */
  const usedOptionIds = useMemo(() => {
    const s = new Set();
    (list || []).forEach((l) => {
      (l.filterValues || []).forEach((v) => {
        if (v && v.option_id != null) s.add(v.option_id);
      });
    });
    return s;
  }, [list]);

  const effectiveListings = useMemo(() => {
    if (!list) return [];
    return list.filter((l) => {
      if (l.is_active === false) return false;
      if (activeGroupIds.size > 0 && !(l.group_id != null && activeGroupIds.has(l.group_id))) return false;
      if (activeContinents.size > 0) {
        const c = continentForCountry(l.country);
        if (!c || !activeContinents.has(c)) return false;
      }
      // Custom filter fields: AND across fields, OR within a field's chosen values.
      for (const f of visibleFilterFields) {
        const sel = activeFilters[f.id];
        const idx = listingFilterIndex.get(l.id)?.get(f.id);
        if (f.field_type === "text") {
          const q = typeof sel === "string" ? sel.trim().toLowerCase() : "";
          if (q) {
            const texts = idx?.texts || [];
            if (!texts.some((t) => t.includes(q))) return false;
          }
        } else if (sel instanceof Set && sel.size > 0) {
          const opts = idx?.options;
          if (!opts || ![...sel].some((id) => opts.has(id))) return false;
        }
      }
      return true;
    });
  }, [list, activeGroupIds, activeContinents, visibleFilterFields, activeFilters, listingFilterIndex]);

  const groupNameById = useMemo(() => {
    const m = new Map();
    (groups || []).forEach((gr) => m.set(gr.id, gr.name || ""));
    return m;
  }, [groups]);

  /** Group IDs that have at least one active listing — used to hide empty group lozenges. */
  const groupIdsWithEntries = useMemo(() => {
    const s = new Set();
    (list || []).forEach((l) => {
      if (l.is_active !== false && l.group_id != null) s.add(l.group_id);
    });
    return s;
  }, [list]);

  /** Flat, alphabetically-sorted listing list for the panel, filtered by group lozenges + search text. */
  const visibleListings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const arr = (effectiveListings || []).slice();
    const filtered = q
      ? arr.filter((l) => buildSearchIndex(l, groupNameById.get(l.group_id) || "").includes(q))
      : arr;
    return filtered.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [effectiveListings, searchQuery, groupNameById]);

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

  function toggleGroupFilter(id) {
    setActiveGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        recordEngagement?.("directory_group_filter", { meta: { group_id: id } });
      }
      return next;
    });
  }

  function toggleContinent(name) {
    setActiveContinents((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
        recordEngagement?.("directory_continent_filter", { meta: { continent: name } });
      }
      return next;
    });
  }

  function logCustomFilter(field, optionId) {
    recordEngagement?.("directory_custom_filter", {
      meta: { field_id: field.id, field_key: field.key, ...(optionId != null ? { option_id: optionId } : {}) },
    });
  }

  /** Toggle one option of a multi-select / typeahead-select field (OR within field). */
  function toggleFilterOption(field, optionId) {
    setActiveFilters((prev) => {
      const cur = prev[field.id] instanceof Set ? new Set(prev[field.id]) : new Set();
      if (cur.has(optionId)) {
        cur.delete(optionId);
      } else {
        cur.add(optionId);
        logCustomFilter(field, optionId);
      }
      return { ...prev, [field.id]: cur };
    });
  }

  /** Set the single chosen option (dropdown). Empty value clears the field. */
  function setSingleSelectFilter(field, optionId) {
    setActiveFilters((prev) => {
      if (!optionId) return { ...prev, [field.id]: new Set() };
      logCustomFilter(field, optionId);
      return { ...prev, [field.id]: new Set([optionId]) };
    });
  }

  /** Set the free-text query for a text field. Logs once per field per session (no raw text). */
  function setTextFilter(field, text) {
    const has = !!String(text || "").trim();
    if (has && !loggedTextFilterRef.current.has(field.id)) {
      loggedTextFilterRef.current.add(field.id);
      logCustomFilter(field, null);
    }
    setActiveFilters((prev) => ({ ...prev, [field.id]: text }));
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
    if (isMobileSheet) {
      setSheetSnap("peek");
      setDragY(null);
    }
  }

  function handleDirectoryMapSelect(listing, point) {
    if (suppressListingOpenEngagementRef.current) {
      suppressListingOpenEngagementRef.current = false;
    } else if (recordEngagement && listing?.id) {
      recordEngagement("listing_panel_open", { listingId: listing.id, meta: { source: "marker" } });
    }
    onSelectMarker(listing, point);
    if (isMobileSheet) {
      setSearchQuery("");
      setSheetSnap("peek");
      setDragY(null);
    }
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
    if (pinDetailLayout === "drawer" || isMobileSheet) {
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

  // Mobile sheet: detect viewport width and reset snap on resize to desktop
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 640px)");
    const update = ({ matches }) => {
      setIsMobileSheet(matches);
      if (!matches) {
        setSheetSnap("peek");
        setDragY(null);
      }
    };
    update(mql);
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  const searchNavTotal = placeSuggestions.length + suggestions.length;

  useEffect(() => {
    if (searchHighlightIndex < 0 || !searchDropdownOpen || searchNavTotal === 0) return;
    const el = document.getElementById(`embed-search-opt-${searchHighlightIndex}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [searchHighlightIndex, searchDropdownOpen, searchNavTotal]);

  function getContainerH() {
    return sheetRef.current?.offsetParent?.clientHeight ?? window.innerHeight;
  }

  function getPeekY() {
    return getContainerH() * 0.85 - PEEK_PX;
  }

  function getHalfY() {
    const h = getContainerH();
    return h * 0.85 - h * 0.5;
  }

  // Keep drag callbacks in a ref so the listeners (attached once) always read fresh state.
  // Written on every render — no useCallback needed.
  touchHandlerRef.current = {
    onDown(e, el) {
      el.setPointerCapture(e.pointerId); // keep receiving events even outside the element
      dragStartRef.current = {
        clientY: e.clientY,
        startY: dragY ?? getPeekY(),
      };
      setIsDragging(true);
    },
    onMove(e) {
      if (!dragStartRef.current) return;
      const delta = e.clientY - dragStartRef.current.clientY;
      const maxY = getContainerH() * 0.85 - PEEK_PX;
      const newY = Math.max(0, Math.min(maxY, dragStartRef.current.startY + delta));
      setDragY(newY);
    },
    onUp() {
      if (!dragStartRef.current) return;
      dragStartRef.current = null;
      setIsDragging(false);
      const finalY = dragY ?? getPeekY();
      const peekY = getPeekY();
      // Snap back to peek if released close to it; otherwise stay exactly where dropped.
      if (Math.abs(finalY - peekY) < 60) {
        setSheetSnap("peek");
        setDragY(null);
      } else {
        setDragY(finalY);
        setSheetSnap("half");
      }
    },
  };

  // Pointer events work for mouse (DevTools simulation) and touch (real devices).
  useEffect(() => {
    const el = handleRef.current;
    if (!el || !isMobileSheet) return;
    const onDown = (e) => touchHandlerRef.current.onDown(e, el);
    const onMove = (e) => touchHandlerRef.current.onMove(e);
    const onUp = (e) => touchHandlerRef.current.onUp(e);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [isMobileSheet]);

  function expandSheet() {
    if (isMobileSheet && sheetSnap === "peek" && dragY === null) {
      setDragY(getHalfY());
      setSheetSnap("half");
    }
  }

  function getListingStartH() {
    return getContainerH() * 0.6;
  }

  listingTouchHandlerRef.current = {
    onDown(e, el) {
      el.setPointerCapture(e.pointerId);
      listingDragStartRef.current = {
        clientY: e.clientY,
        startH: listingSheetH ?? getListingStartH(),
      };
      setIsListingDragging(true);
    },
    onMove(e) {
      if (!listingDragStartRef.current) return;
      // Dragging up (negative delta) increases height; dragging down decreases it.
      const delta = e.clientY - listingDragStartRef.current.clientY;
      const h = getContainerH();
      const newH = Math.max(80, Math.min(h * 0.92, listingDragStartRef.current.startH - delta));
      setListingSheetH(newH);
    },
    onUp() {
      if (!listingDragStartRef.current) return;
      listingDragStartRef.current = null;
      setIsListingDragging(false);
      const finalH = listingSheetH ?? getListingStartH();
      // Dismiss if dragged down to a sliver
      if (finalH < 100) {
        onClosePin?.();
        setListingSheetH(null);
      }
    },
  };

  const hasSelectedListing = Boolean(selectedListing);
  useEffect(() => {
    const el = listingHandleRef.current;
    if (!el || !isMobileSheet) return;
    const onDown = (e) => listingTouchHandlerRef.current.onDown(e, el);
    const onMove = (e) => listingTouchHandlerRef.current.onMove(e);
    const onUp = (e) => listingTouchHandlerRef.current.onUp(e);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [isMobileSheet, hasSelectedListing]);

  // Reset listing sheet height whenever a new listing opens
  useEffect(() => {
    if (selectedListing) {
      setListingSheetH(null);
      setIsListingDragging(false);
    }
  }, [selectedListing?.id]);

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
      data-map-fullscreen-root
      style={{
        width: "100%",
        height,
        position: "relative",
        ["--panel-bg"]: panelBg,
        ["--panel-link"]: panelLinkColor,
        ["--panel-radius"]: `${panelBorderRadius}px`,
        ["--search-panel-bg"]: searchPanelBg,
        ["--listing-bg"]: listingBg,
        ["--listing-border"]: listingBorder,
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
        pinDropShadow={pinDropShadow}
        pinShadowDistance={pinShadowDistance}
        pinShadowOpacity={pinShadowOpacity}
        pinSize={pinSize}
        height="100%"
        gestureHandling={gestureHandling}
        cameraRequest={cameraRequest}
        mapFitBoundsPadding={mapFitBoundsPadding}
        screenOverlayListing={pinDetailLayout === "map" ? selectedListing : null}
        onScreenOverlayPosition={onMarkerScreenPosition}
        selectZoom={isMobileSheet ? 17 : 15}
        selectPanOffsetX={isMobileSheet ? 0 : pinDetailLayout === "drawer" ? 200 : 0}
        selectPanOffsetY={isMobileSheet ? Math.round((sheetRef.current?.offsetParent?.clientHeight ?? window.innerHeight) * 0.15) : 0}
        mapStyles={mapStyles}
        showTrafficLayer={showTrafficLayer}
        showTransitLayer={showTransitLayer}
        showBikeLayer={showBikeLayer}
        showZoomIndicator={showZoomIndicator}
      />

      {showListPanel && (
        <div
          ref={sheetRef}
          className={`embed-list-panel${isMobileSheet ? ` embed-list-panel--mobile-sheet embed-list-panel--snap-${sheetSnap}` : ""}`}
          style={isMobileSheet ? {
            transform: `translateY(${(dragY ?? getPeekY()).toFixed(1)}px)`,
            transition: isDragging ? "none" : "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
          } : undefined}
        >
          {isMobileSheet && (
            <div
              ref={handleRef}
              className="embed-list-panel__handle"
              onClick={expandSheet}
              aria-label={sheetSnap === "peek" ? "Show map panel" : "Drag to resize panel"}
            >
              {sheetSnap === "peek" && dragY === null ? (
                <svg
                  className="embed-list-panel__handle-chevron"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <polyline points="4 16 12 8 20 16" />
                </svg>
              ) : (
                <div className="embed-list-panel__handle-pill" />
              )}
            </div>
          )}
          <div className="embed-list-panel__header">
            {logoUrl ? (
              <div className="embed-list-panel__logo">
                <LogoImage src={logoUrl} wrapClassName="embed-list-panel__logo-wrap" imgClassName="embed-list-panel__logo-img" maxWidth={220} maxHeight={70} />
              </div>
            ) : null}
            {mapName ? <div className="embed-list-panel__title">{mapName}</div> : null}
            {description ? <div className="embed-list-panel__desc">{description}</div> : null}
          </div>

          <div className="embed-list-panel__divider" aria-hidden />

          <div className="embed-list-panel__filter">
            <div className="embed-list-panel__section-title">Search &amp; filter</div>
          <div className="embed-list-panel__search-wrap" ref={searchWrapRef}>
            <input
              type="text"
              className="embed-list-panel__search"
              placeholder="Search listings or places…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => { setSearchFocused(true); expandSheet(); }}
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
                {placeSuggestions.length > 0 && (
                  <li className="embed-list-panel__suggestions-divider" aria-hidden>
                    <span className="embed-list-panel__section-label">Location</span>
                  </li>
                )}
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
                    <li className="embed-list-panel__suggestions-divider" aria-hidden>
                      <span className="embed-list-panel__section-label">Directory listings</span>
                    </li>
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
            {(groups || []).some((gr) => groupIdsWithEntries.has(gr.id)) && (
              <div className="embed-list-panel__lozenges">
                {(groups || []).filter((gr) => groupIdsWithEntries.has(gr.id)).map((gr) => {
                  const meta = groupMeta.get(gr.id) || { name: gr.name || "—", color: markerColor, border: pinBorderColor };
                  const active = activeGroupIds.has(gr.id);
                  return (
                    <button
                      key={gr.id}
                      type="button"
                      className={`embed-list-panel__lozenge${active ? " embed-list-panel__lozenge--active" : ""}`}
                      onClick={() => toggleGroupFilter(gr.id)}
                      aria-pressed={active}
                      title={active ? `Showing only ${meta.name}` : `Filter by ${meta.name}`}
                      style={{
                        background: active ? meta.color : "transparent",
                        borderColor: active ? meta.border : meta.color,
                        color: active ? "#ffffff" : "var(--page-text, #111827)",
                      }}
                    >
                      {meta.name || "—"}
                    </button>
                  );
                })}
              </div>
            )}
            {showContinentFilter && continentsPresent.length > 0 && (
              <div className="embed-list-panel__lozenges embed-list-panel__lozenges--continents">
                {continentsPresent.map((name) => {
                  const active = activeContinents.has(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      className={`embed-list-panel__lozenge embed-list-panel__lozenge--continent${active ? " embed-list-panel__lozenge--active" : ""}`}
                      onClick={() => toggleContinent(name)}
                      aria-pressed={active}
                      title={active ? `Showing only ${name}` : `Filter by ${name}`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            )}
            {visibleFilterFields.map((field) => {
              const selected = activeFilters[field.id];
              const selectedSet = selected instanceof Set ? selected : null;
              const textValue = typeof selected === "string" ? selected : "";
              // Only surface options that at least one listing actually uses.
              const options = (field.options || []).filter((o) => usedOptionIds.has(o.id));

              // A select field with no populated options adds no value — hide it.
              if (field.field_type !== "text" && options.length === 0) return null;

              if (field.field_type === "text") {
                return (
                  <div key={field.id} className="embed-list-panel__filter-field">
                    <label className="embed-list-panel__filter-label">{field.label}</label>
                    <input
                      type="text"
                      inputMode="text"
                      className="embed-list-panel__filter-input"
                      placeholder={`Filter by ${field.label.toLowerCase()}…`}
                      value={textValue}
                      onChange={(e) => setTextFilter(field, e.target.value)}
                    />
                  </div>
                );
              }

              if (field.display_control === "dropdown") {
                const current = selectedSet && selectedSet.size > 0 ? [...selectedSet][0] : "";
                return (
                  <div key={field.id} className="embed-list-panel__filter-field">
                    <label className="embed-list-panel__filter-label">{field.label}</label>
                    <select
                      className="embed-list-panel__filter-input"
                      value={current}
                      onChange={(e) => setSingleSelectFilter(field, e.target.value)}
                    >
                      <option value="">All</option>
                      {options.map((o) => (
                        <option key={o.id} value={o.id}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                );
              }

              // multi_select or typeahead (select-backed): lozenge toggles, optional filter box
              const q = (typeaheadQuery[field.id] || "").trim().toLowerCase();
              const shownOptions = field.display_control === "typeahead" && q
                ? options.filter((o) => String(o.label).toLowerCase().includes(q))
                : options;
              return (
                <div key={field.id} className="embed-list-panel__filter-field">
                  <label className="embed-list-panel__filter-label">{field.label}</label>
                  {field.display_control === "typeahead" && (
                    <input
                      type="text"
                      className="embed-list-panel__filter-input"
                      placeholder={`Search ${field.label.toLowerCase()}…`}
                      value={typeaheadQuery[field.id] || ""}
                      onChange={(e) => setTypeaheadQuery((prev) => ({ ...prev, [field.id]: e.target.value }))}
                    />
                  )}
                  <div className="embed-list-panel__lozenges">
                    {shownOptions.map((o) => {
                      const active = !!selectedSet && selectedSet.has(o.id);
                      const color = o.color || panelLinkColor;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          className={`embed-list-panel__lozenge${active ? " embed-list-panel__lozenge--active" : ""}`}
                          onClick={() => toggleFilterOption(field, o.id)}
                          aria-pressed={active}
                          title={active ? `Showing only ${o.label}` : `Filter by ${o.label}`}
                          style={{
                            background: active ? color : "transparent",
                            borderColor: color,
                            color: active ? "#ffffff" : "var(--page-text, #111827)",
                          }}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {showKey && !isMobileSheet && (groups || []).some((gr) => groupIdsWithEntries.has(gr.id)) && (
            <>
              <div className="embed-list-panel__divider" aria-hidden />
              <div className="embed-list-panel__key">
                <div className="embed-list-panel__section-title">Key</div>
                <ul className="embed-list-panel__key-list" role="list">
                  {(groups || []).filter((gr) => groupIdsWithEntries.has(gr.id)).map((gr) => {
                    const meta = groupMeta.get(gr.id) || { name: gr.name || "—", color: markerColor, border: pinBorderColor };
                    return (
                      <li key={gr.id} className="embed-list-panel__key-item">
                        <span
                          className="embed-list-panel__key-swatch"
                          style={{ background: meta.color, borderColor: meta.border }}
                          aria-hidden
                        />
                        <span className="embed-list-panel__key-label">{meta.name || "—"}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}

          <div className="embed-list-panel__divider" aria-hidden />

          <div className="embed-list-panel__listings" role="list">
            {visibleListings.map((listing) => {
              const meta = listing.group_id ? groupMeta.get(listing.group_id) : null;
              const locationLine = [listing.city, listing.country].filter(Boolean).join(", ");
              return (
                <button
                  key={listing.id}
                  type="button"
                  className="embed-list-panel__listing"
                  onClick={() => selectFromList(listing, "list_panel")}
                >
                  {listing.logo_url ? (
                    <span className="embed-list-panel__listing-logo" style={{ background: listing.logo_bg || "#ffffff" }}>
                      <LogoImage src={listing.logo_url} wrapClassName="embed-list-panel__listing-logo-wrap" imgClassName="embed-list-panel__listing-logo-img" maxWidth={48} maxHeight={48} />
                    </span>
                  ) : null}
                  <span className="embed-list-panel__listing-body">
                    <span className="embed-list-panel__listing-name">{listing.name || "—"}</span>
                    {locationLine ? <span className="embed-list-panel__listing-loc">{locationLine}</span> : null}
                    {meta?.name ? (
                      <span className="embed-list-panel__listing-group">
                        <span className="embed-list-panel__listing-group-dot" style={{ background: meta.color, borderColor: meta.border }} aria-hidden />
                        {meta.name}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
            {visibleListings.length === 0 ? (
              <div className="embed-list-panel__empty">No listings match your filters.</div>
            ) : null}
          </div>
        </div>
      )}

      {selectedListing && isMobileSheet ? (
        <div
          className="map-pin-mobile-sheet"
          role="dialog"
          aria-label="Listing details"
          style={{
            height: `${(listingSheetH ?? getListingStartH()).toFixed(1)}px`,
            transition: isListingDragging ? "none" : "height 0.35s cubic-bezier(0.32,0.72,0,1)",
          }}
        >
          <div ref={listingHandleRef} className="map-pin-mobile-sheet__handle" aria-label="Drag to resize">
            <div className="map-pin-mobile-sheet__pill" />
          </div>
          <div ref={pinOverlayRef} className="map-pin-mobile-sheet__body">
            <ListingCardContent
              listing={selectedListing}
              buttonColor={buttonColor}
              showSendMessage={showSendMessage}
              onOpenSendMessage={onOpenSendMessage}
              onClosePin={onClosePin}
              extended
              recordEngagement={recordEngagement}
            />
          </div>
        </div>
      ) : null}

      {selectedListing && !isMobileSheet && pinDetailLayout === "map" ? (
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
                  maxWidth: "min(400px, calc(100% - 24px))",
                }
              : undefined
          }
        >
          <ListingCardContent
            listing={selectedListing}
            buttonColor={buttonColor}
            showSendMessage={showSendMessage}
            onOpenSendMessage={onOpenSendMessage}
            onClosePin={onClosePin}
            extended={false}
            recordEngagement={recordEngagement}
          />
        </div>
      ) : null}

      {selectedListing && !isMobileSheet && pinDetailLayout === "drawer" ? (
        <div className="map-pin-drawer map-pin-drawer--open" role="presentation">
          <button type="button" className="map-pin-drawer__backdrop" onClick={onClosePin} aria-label="Close listing" />
          <div className="map-pin-drawer__sheet" role="dialog" aria-label="Listing details">
            <div ref={pinOverlayRef} className="map-pin-overlay map-pin-overlay--in-drawer">
              <ListingCardContent
                listing={selectedListing}
                buttonColor={buttonColor}
                showSendMessage={showSendMessage}
                onOpenSendMessage={onOpenSendMessage}
                onClosePin={onClosePin}
                extended
                recordEngagement={recordEngagement}
              />
            </div>
          </div>
        </div>
      ) : null}

      {mapOverlay}
    </div>
  );
}

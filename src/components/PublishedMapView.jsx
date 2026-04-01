import React, { useLayoutEffect, useMemo, useState } from "react";
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

function ListingCardContent({
  listing,
  buttonColor,
  showSendMessage,
  onOpenSendMessage,
  zoomToSelectedAddress,
  onClosePin,
  extended,
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
            <a href={`mailto:${listing.email}`}>{listing.email}</a>
          </p>
        ) : null}
        {listing.phone ? (
          <p className="map-pin-overlay__row">
            <span>Phone: </span>
            {listing.phone}
          </p>
        ) : null}
        {extended && notes ? (
          <div className="map-pin-overlay__notes">
            {listing.allow_html ? (
              <div className="map-pin-overlay__notes-html" dangerouslySetInnerHTML={{ __html: notes }} />
            ) : (
              <div className="map-pin-overlay__notes-plain">{notes}</div>
            )}
          </div>
        ) : null}
        <div className="map-pin-overlay__actions" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {listing.website_url ? (
            <a
              href={listing.website_url.startsWith("http") ? listing.website_url : `https://${listing.website_url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="map-pin-overlay__visit-btn"
              style={{ backgroundColor: buttonColor }}
            >
              Visit website
            </a>
          ) : null}
          {showSendMessage && listing.email ? (
            <button
              type="button"
              className="map-pin-overlay__visit-btn"
              style={{ backgroundColor: buttonColor }}
              onClick={onOpenSendMessage}
            >
              Send message
            </button>
          ) : null}
        </div>
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
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [openGroupIds, setOpenGroupIds] = useState(new Set());
  const [hiddenGroupIds, setHiddenGroupIds] = useState(new Set());

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
      if (next.has(id)) next.delete(id);
      else next.add(id);
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

  function selectFromList(listing) {
    onSelectMarker(listing, null);
    if (setCenterOnListingId) setCenterOnListingId(listing.id);
    setSearchQuery("");
  }

  function zoomToSelectedAddress() {
    if (selectedListing && setCenterOnListingId) setCenterOnListingId(selectedListing.id);
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
        onSelect={onSelectMarker}
        centerOnListingId={centerOnListingId}
        defaultMarkerColor={markerColor}
        markerStyle={markerStyle}
        customMarkerIconUrl={customPinUrl}
        enableClustering={enableClustering}
        clusterRadius={clusterRadius}
        clusterColor={clusterColor}
        pinBorderColor={pinBorderColor}
        pinBorderSize={pinBorderSize}
        pinFaviconUrl={pinFaviconUrl}
        pinSize={pinSize}
        height="100%"
        screenOverlayListing={pinDetailLayout === "map" ? selectedListing : null}
        onScreenOverlayPosition={onMarkerScreenPosition}
      />

      {showListPanel && (
        <div className="embed-list-panel">
          {showSearch !== false && (
          <div className="embed-list-panel__search-wrap">
            <input
              type="text"
              className="embed-list-panel__search"
              placeholder="Search…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const first = suggestions[0];
                  if (first) {
                    e.preventDefault();
                    selectFromList(first);
                  }
                }
              }}
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
                      selectFromList(listing);
                    }}
                  >
                    {listing.name || "—"}
                  </li>
                ))}
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
                              onClick={() => selectFromList(listing)}
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
                            onClick={() => selectFromList(listing)}
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
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

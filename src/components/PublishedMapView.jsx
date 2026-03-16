import React, { useLayoutEffect, useMemo, useState } from "react";
import DirectoryMap from "./DirectoryMap.jsx";
import LogoImage from "./LogoImage.jsx";

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

  const panelBg = theme.panelBg ?? "rgba(228, 240, 255, 0.88)";
  const panelLinkColor = theme.panelLinkColor ?? "#4A9BAA";
  const buttonColor = theme.buttonColor ?? markerColor ?? "#4A9BAA";

  const list = listingsWithColor ?? listings;

  const groupNameById = useMemo(() => {
    const m = new Map();
    (groups || []).forEach((gr) => m.set(gr.id, gr.name || ""));
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

  function selectFromList(listing) {
    onSelectMarker(listing, null);
    if (setCenterOnListingId) setCenterOnListingId(listing.id);
    setSearchQuery("");
  }

  function zoomToSelectedAddress() {
    if (selectedListing && setCenterOnListingId) setCenterOnListingId(selectedListing.id);
  }

  useLayoutEffect(() => {
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
  }, [selectedMarkerPoint, selectedListing, pinOverlayRef, setClampedPanelPosition]);

  return (
    <div
      style={{
        width: "100%",
        height,
        position: "relative",
        ["--panel-bg"]: panelBg,
        ["--panel-link"]: panelLinkColor,
      }}
    >
      <DirectoryMap
        apiKey={apiKey}
        center={center}
        zoom={zoom}
        mapTypeId={mapTypeId}
        listings={list}
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
        height="100%"
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
            onClick={onClosePin}
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
          <div className="map-pin-overlay__body">
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
            <div className="map-pin-overlay__actions" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {selectedListing.website_url ? (
                <a
                  href={
                    selectedListing.website_url.startsWith("http")
                      ? selectedListing.website_url
                      : `https://${selectedListing.website_url}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="map-pin-overlay__visit-btn"
                  style={{ backgroundColor: buttonColor }}
                >
                  Visit website
                </a>
              ) : null}
              {showSendMessage && selectedListing.email ? (
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
        </div>
      ) : null}
    </div>
  );
}

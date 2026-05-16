import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { BarChart3 } from "lucide-react";
import styles from "./MapsView.module.css";

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.2" />
    <path d="M10 10L14 14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const FilterIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

const MapPlusIcon = () => (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
    <rect x="3" y="3" width="20" height="20" rx="4" fill="#B5D4F4" stroke="#378ADD" strokeWidth="0.8" />
    <path d="M13 8v10M8 13h10" stroke="#185FA5" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

function PlaceholderCard({ onClick }) {
  return (
    <button className={styles.placeholder} onClick={onClick} aria-label="Create new map">
      <span className={styles.placeholderIcon}>
        <PlusIcon />
      </span>
      <span className={styles.placeholderLabel}>New map</span>
    </button>
  );
}

function formatEditedAt(updatedAt) {
  if (!updatedAt) return null;
  const d = new Date(updatedAt);
  const diffDays = Math.floor((Date.now() - d) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const GRID_SLOTS = 6;

const THUMB_W = 300;
const THUMB_H = 130;
const TILE = 256;

function MapTileThumb({ lat, lng, zoom }) {
  if (lat == null || lng == null) return <div className={styles.mapThumbFallback} />;
  const z = Math.max(1, Math.min(18, Math.round(zoom ?? 12)));
  const n = Math.pow(2, z);
  const latRad = (lat * Math.PI) / 180;
  const xf = ((lng + 180) / 360) * n;
  const yf = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const cx = Math.floor(xf), cy = Math.floor(yf);
  const ox = THUMB_W / 2 - (xf - cx) * TILE;
  const oy = THUMB_H / 2 - (yf - cy) * TILE;
  const tiles = [];
  for (let dy = -1; dy <= 2; dy++) {
    for (let dx = -1; dx <= 2; dx++) {
      const tx = ((cx + dx) % n + n) % n;
      const ty = cy + dy;
      if (ty < 0 || ty >= n) continue;
      const left = ox + dx * TILE, top = oy + dy * TILE;
      if (left + TILE < 0 || left > THUMB_W || top + TILE < 0 || top > THUMB_H) continue;
      tiles.push({ tx, ty, left, top });
    }
  }
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#e8e0d8" }}>
      {tiles.map(({ tx, ty, left, top }) => (
        <img key={`${tx}-${ty}`} src={`https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`}
          width={TILE} height={TILE} alt=""
          style={{ position: "absolute", left, top, display: "block", userSelect: "none" }}
          draggable={false} loading="lazy" />
      ))}
    </div>
  );
}

function getDataSource(map) {
  const src = map.map_data_sources?.[0];
  const hasListings = (map.listings?.[0]?.count ?? 0) > 0;
  if (src?.provider === "google_sheets" && src.spreadsheet_id) {
    return { label: "Google Drive", detail: src.sheet_name || null };
  }
  if (src?.provider === "google_sheets") {
    return { label: "Google Drive", detail: "no file selected" };
  }
  if (hasListings) return { label: "Uploaded file", detail: null };
  return { label: "None", detail: "not configured" };
}

export default function MapsView({ maps = [], workspaceName, loading, error }) {
  const navigate = useNavigate();
  const placeholderCount = Math.max(0, GRID_SLOTS - maps.length);

  function handleCreateMap() {
    navigate("/client/maps/new");
  }

  function handleSelectMap(mapId) {
    navigate(`/client/maps/${encodeURIComponent(mapId)}`);
  }

  return (
    <div className={styles.wrap}>
      {/* Top bar */}
      <div className={styles.topbar}>
        <div>
          {workspaceName && <p className={styles.pageLabel}>{workspaceName}</p>}
          <h1 className={styles.pageTitle}>My Maps</h1>
        </div>
        <div className={styles.topbarActions}>
          <div className={styles.search}>
            <SearchIcon />
            <span>Search maps…</span>
          </div>
          <button className={styles.filterBtn}>
            <FilterIcon />
            Filter
          </button>
        </div>
      </div>

      {error ? (
        <p style={{ color: "#b91c1c", fontSize: 13, marginBottom: 16 }}>{error}</p>
      ) : null}

      {loading ? (
        <p style={{ fontSize: 13, opacity: 0.6 }}>Loading…</p>
      ) : (
        <>
          {/* Grid */}
          <div className={styles.grid}>
            {/* Create panel — spans 2 rows */}
            <div
              className={styles.createPanel}
              onClick={handleCreateMap}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && handleCreateMap()}
            >
              <div className={styles.createIconWrap}>
                <MapPlusIcon />
              </div>
              <h2 className={styles.createTitle}>Create a new map</h2>
              <p className={styles.createDesc}>
                Start from scratch and visualise your data as an interactive map.
              </p>
              <button
                className={styles.createBtn}
                onClick={(e) => { e.stopPropagation(); handleCreateMap(); }}
              >
                + New map
              </button>
            </div>

            {/* Existing map cards */}
            {maps.map((map) => {
              const editedAt = formatEditedAt(map.updated_at);
              const isLive = !!map.published_at;
              const ds = getDataSource(map);
              return (
                <div
                  key={map.id}
                  className={styles.mapCard}
                  onClick={() => handleSelectMap(map.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && handleSelectMap(map.id)}
                >
                  <div className={styles.mapThumb}>
                    <MapTileThumb lat={map.default_lat} lng={map.default_lng} zoom={map.default_zoom} />
                  </div>
                  <div className={styles.cardMeta}>
                    <p className={styles.cardName}>{map.name}</p>
                    <div className={styles.cardDetail}>
                      <span className={styles.statusDot} style={{ background: isLive ? "#1D9E75" : "#888780" }} />
                      <span>{isLive ? "Live" : "Draft"}</span>
                      {editedAt ? (
                        <>
                          <span className={styles.separator}>·</span>
                          <span>{editedAt}</span>
                        </>
                      ) : null}
                    </div>
                    <div className={styles.cardActions}>
                      <Link
                        to={`/client/maps/${encodeURIComponent(map.id)}/stats`}
                        className={styles.cardActionLink}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <BarChart3 size={12} strokeWidth={2} aria-hidden />
                        Map Stats
                      </Link>
                    </div>
                    <div className={styles.cardDetail} style={{ marginTop: 3 }}>
                      <Link
                        to={`/client/maps/${map.id}/data`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: 11, color: "var(--lc-muted)", textDecoration: "none" }}
                      >
                        {ds.label}{ds.detail ? ` · ${ds.detail}` : ""}
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Placeholder slots */}
            {Array.from({ length: placeholderCount }).map((_, i) => (
              <PlaceholderCard key={`placeholder-${i}`} onClick={handleCreateMap} />
            ))}
          </div>

          {/* Footer */}
          <div className={styles.footer}>
            <span>{maps.length} {maps.length === 1 ? "map" : "maps"}</span>
            <div className={styles.sortWrap}>
              <span>Sort:</span>
              <select className={styles.sortSelect}>
                <option>Last edited</option>
                <option>Name (A–Z)</option>
                <option>Date created</option>
              </select>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

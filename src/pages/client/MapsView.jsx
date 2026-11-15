import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { BarChart3 } from "lucide-react";
import MapTileThumb from "../../components/MapTileThumb.jsx";
import { Button, Callout, PageLayout, Pill, Section, Skeleton } from "../../components/ui/index.js";
import "../../styles/wave-b/map-pages.css";

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

/** `notice` is an optional node (e.g. a Callout) shown under the page heading. */
export default function MapsView({ maps = [], workspaceName, loading, error, notice = null }) {
  const navigate = useNavigate();

  function handleCreateMap() {
    navigate("/client/maps/new");
  }

  return (
    <PageLayout head={{ title: "Maps", subtitle: "Interactive maps your visitors can explore." }}>
      <div className="mp-stack">
        {notice}

        {error ? <Callout tone="danger">{error}</Callout> : null}

        {loading ? (
          <Skeleton variant="tiles" rows={3} label="Loading maps" />
        ) : (
          <>
            <div className="mp-map-grid">
              <Section className="mp-create-tile" title="Create a new map" as="h2">
                <div className="mp-stack mp-stack--tight">
                  <p className="mp-note">Start from scratch and visualise your data as an interactive map.</p>
                  <div>
                    <Button variant="primary" onClick={handleCreateMap}>New map</Button>
                  </div>
                </div>
              </Section>

              {maps.map((map) => {
                const editedAt = formatEditedAt(map.updated_at);
                const isLive = !!map.published_at;
                const ds = getDataSource(map);
                return (
                  <article key={map.id} className="mp-map-card">
                    <div className="mp-map-thumb">
                      <MapTileThumb lat={map.default_lat} lng={map.default_lng} zoom={map.default_zoom} />
                    </div>
                    <div className="mp-map-meta">
                      <h2 className="mp-map-name">
                        <Link to={`/client/maps/${encodeURIComponent(map.id)}`}>{map.name}</Link>
                      </h2>
                      <div className="mp-map-detail">
                        <Pill tone={isLive ? "live" : "neutral"}>{isLive ? "Live" : "Draft"}</Pill>
                        {editedAt ? <span>{editedAt}</span> : null}
                      </div>
                      <div className="mp-map-links">
                        <Link to={`/client/maps/${encodeURIComponent(map.id)}/stats`}>
                          <BarChart3 size={12} strokeWidth={2} aria-hidden />
                          Map stats
                        </Link>
                        <Link to={`/client/maps/${map.id}/data`}>
                          {ds.label}{ds.detail ? ` · ${ds.detail}` : ""}
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <p className="mp-map-foot">{maps.length} {maps.length === 1 ? "map" : "maps"}</p>
          </>
        )}
      </div>
    </PageLayout>
  );
}

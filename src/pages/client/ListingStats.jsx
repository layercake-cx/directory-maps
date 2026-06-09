import React, { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ExternalLink, Mail, MapPin, MessageSquare, Send } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { getClientIdForCurrentUser } from "../../lib/clientAuth";
import { getMapStatsRoutes } from "../../lib/statsRoutes";
import { useListingEngagement } from "../../hooks/useListingEngagement";
import { formatRelativeTime, parseDaysParam } from "../../lib/engagementAnalytics";
import { ListingTrendChart } from "../../components/engagement/EngagementCharts.jsx";
import {
  DateRangeSelect,
  FunnelChart,
  LoadingState,
  MetricCards,
  Panel,
} from "../../components/engagement/EngagementShared.jsx";
import styles from "./MapStats.module.css";
import listingStyles from "./ListingStats.module.css";
import "../admin/admin.css";

function EventIcon({ eventType }) {
  const props = { size: 16, strokeWidth: 2, "aria-hidden": true };
  switch (eventType) {
    case "listing_panel_open":
      return <MapPin {...props} />;
    case "website_click":
      return <ExternalLink {...props} />;
    case "email_click":
      return <Mail {...props} />;
    case "message_compose_open":
      return <MessageSquare {...props} />;
    case "message_sent":
      return <Send {...props} />;
    default:
      return <MapPin {...props} />;
  }
}

export default function ListingStats() {
  const { mapId, listingId, clientId: adminClientId } = useParams();
  const isAdmin = Boolean(adminClientId);
  const routes = getMapStatsRoutes({ mapId, clientId: adminClientId });
  const [searchParams, setSearchParams] = useSearchParams();
  const days = parseDaysParam(searchParams.get("days"), 30);

  const [listing, setListing] = useState(null);
  const [mapName, setMapName] = useState("");
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const { metrics, loading: engagementLoading, error: engagementError } = useListingEngagement(
    mapId,
    listingId,
    days,
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setPageLoading(true);
        setPageError("");
        let expectedClientId = adminClientId;
        if (!isAdmin) {
          expectedClientId = await getClientIdForCurrentUser();
          if (!expectedClientId) throw new Error("No client account linked.");
        }

        const [{ data: l, error: le }, { data: m, error: me }] = await Promise.all([
          supabase.from("listings").select("id,name,map_id").eq("id", listingId).single(),
          supabase.from("maps").select("id,name,client_id").eq("id", mapId).single(),
        ]);

        if (le) throw le;
        if (me) throw me;
        if (l.map_id !== mapId) throw new Error("Listing does not belong to this map.");
        if (m.client_id !== expectedClientId) {
          throw new Error(
            isAdmin
              ? "This map does not belong to the selected customer."
              : "This map does not belong to your account."
          );
        }

        if (!cancelled) {
          setListing(l);
          setMapName(m.name || "Map");
        }
      } catch (e) {
        if (!cancelled) setPageError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mapId, listingId, adminClientId, isAdmin]);

  function setDays(next) {
    const p = new URLSearchParams(searchParams);
    p.set("days", String(next));
    setSearchParams(p, { replace: true });
  }

  const loading = pageLoading || engagementLoading;
  const statsBase = routes.statsBase;
  const contentClass = isAdmin ? styles.page : `page-main ${styles.page}`;

  if (pageLoading) {
    return (
      <div className={contentClass}>
        <LoadingState />
      </div>
    );
  }

  if (pageError) {
    return (
      <div className={contentClass}>
        <p className={styles.error}>{pageError}</p>
        <Link to={statsBase} className="btn">
          Back to map stats
        </Link>
      </div>
    );
  }

  const summaryCards = [
    { label: "Panel opens", value: metrics.summary.panelOpens.toLocaleString() },
    { label: "Website clicks", value: metrics.summary.websiteClicks.toLocaleString() },
    { label: "Email clicks", value: metrics.summary.emailClicks.toLocaleString() },
    { label: "Messages sent", value: metrics.summary.messagesSent.toLocaleString() },
  ];

  const sourceMax = Math.max(...metrics.visitorsBySource.map((s) => s.count), 1);

  return (
    <div className={contentClass}>
      <header className={styles.header}>
        <div className={styles.headerMain}>
          <Link to={`${statsBase}?days=${days}`} className={styles.backLink}>
            ← {mapName} stats
          </Link>
          <h1 className={styles.title}>{listing?.name || "Listing"}</h1>
        </div>
        <div className={styles.headerActions}>
          <DateRangeSelect days={days} onChange={setDays} />
        </div>
      </header>

      {engagementError ? <p className={styles.error}>{engagementError}</p> : null}

      {loading ? (
        <LoadingState />
      ) : !metrics.hasData ? (
        <div className={styles.emptyPage}>
          <h2>No engagement for this listing</h2>
          <p>There is no recorded activity for this listing in the selected period.</p>
        </div>
      ) : (
        <div className={styles.dashboard}>
          <MetricCards items={summaryCards} />

          <Panel title="Engagement over time">
            <ListingTrendChart data={metrics.daily} />
          </Panel>

          <Panel title="Conversion funnel" subtitle="Step-to-step rate shown on the right">
            <FunnelChart steps={metrics.funnel} />
          </Panel>

          <Panel title="How visitors found this listing">
            <div className={listingStyles.sourceBars}>
              {metrics.visitorsBySource.map((row) => (
                <div key={row.source} className={listingStyles.sourceRow}>
                  <div className={listingStyles.sourceLabelWrap}>
                    <span className={listingStyles.sourceName}>{row.name}</span>
                    <span className={listingStyles.sourceCount}>{row.count}</span>
                  </div>
                  <div className={listingStyles.sourceTrack}>
                    <div
                      className={listingStyles.sourceFill}
                      style={{ width: `${Math.max(4, (row.count / sourceMax) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className={listingStyles.sourcePctGrid}>
              {metrics.visitorsBySource.map((row) => (
                <div key={row.source} className={listingStyles.sourcePctCard}>
                  <p className={listingStyles.sourcePctLabel}>{row.name} %</p>
                  <p className={listingStyles.sourcePctValue}>{row.pct}%</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Recent activity" subtitle="Last 20 events">
            <ul className={listingStyles.activityList}>
              {metrics.recentActivity.map((item) => (
                <li key={item.id} className={listingStyles.activityItem}>
                  <span className={listingStyles.activityIcon}>
                    <EventIcon eventType={item.eventType} />
                  </span>
                  <div className={listingStyles.activityBody}>
                    <span className={listingStyles.activityLabel}>{item.label}</span>
                    {item.badge ? <span className={listingStyles.activityBadge}>{item.badge}</span> : null}
                  </div>
                  <time className={listingStyles.activityTime} dateTime={item.occurredAt}>
                    {formatRelativeTime(item.occurredAt)}
                  </time>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </div>
  );
}

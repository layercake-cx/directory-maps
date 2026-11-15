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
import { Button, Callout, EmptyState, Pill, StatGrid, StatTile, PageLayout } from "../../components/ui/index.js";
import "../admin/admin.css";
import "../../styles/wave-b/map-pages.css";

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
  const contentClass = isAdmin ? undefined : "page-main"; // client routes render without a page wrapper

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
        <div className="mp-stack">
          <Callout tone="danger">{pageError}</Callout>
          <div>
            <Button as={Link} to={statsBase}>Back to map stats</Button>
          </div>
        </div>
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
      <PageLayout
        head={{
          title: listing?.name || "Listing",
          breadcrumb: [{ label: `${mapName} stats`, to: `${statsBase}?days=${days}` }, { label: listing?.name || "Listing" }],
          actions: <DateRangeSelect days={days} onChange={setDays} />,
        }}
      >
        <div className="mp-stack">
          {engagementError ? <Callout tone="danger">{engagementError}</Callout> : null}

          {loading ? (
            <LoadingState />
          ) : !metrics.hasData ? (
            <EmptyState
              art="searching"
              title="No engagement for this listing"
              body="There is no recorded activity for this listing in the selected period."
            />
          ) : (
            <>
              <MetricCards items={summaryCards} />

              <Panel title="Engagement over time">
                <ListingTrendChart data={metrics.daily} />
              </Panel>

              <Panel title="Conversion funnel" subtitle="Step-to-step rate shown on the right">
                <FunnelChart steps={metrics.funnel} />
              </Panel>

              <Panel title="How visitors found this listing">
                <div className="mp-stack">
                  <div className="mp-source-bars">
                    {metrics.visitorsBySource.map((row) => (
                      <div key={row.source} className="mp-source-row">
                        <div className="mp-source-label">
                          <span className="mp-source-name">{row.name}</span>
                          <span className="mp-source-count">{row.count}</span>
                        </div>
                        <div className="mp-source-track">
                          <div
                            className="mp-source-fill"
                            // dynamic: bar width is the source's share of the largest source
                            style={{ width: `${Math.max(4, (row.count / sourceMax) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <StatGrid compact>
                    {metrics.visitorsBySource.map((row) => (
                      <StatTile key={row.source} compact label={`${row.name} %`} value={`${row.pct}%`} />
                    ))}
                  </StatGrid>
                </div>
              </Panel>

              <Panel title="Recent activity" subtitle="Last 20 events">
                <ul className="mp-activity">
                  {metrics.recentActivity.map((item) => (
                    <li key={item.id} className="mp-activity-item">
                      <span className="mp-activity-icon">
                        <EventIcon eventType={item.eventType} />
                      </span>
                      <div className="mp-activity-body">
                        <span>{item.label}</span>
                        {item.badge ? <Pill>{item.badge}</Pill> : null}
                      </div>
                      <time className="mp-activity-time" dateTime={item.occurredAt}>
                        {formatRelativeTime(item.occurredAt)}
                      </time>
                    </li>
                  ))}
                </ul>
              </Panel>
            </>
          )}
        </div>
      </PageLayout>
    </div>
  );
}

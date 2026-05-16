import React, { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { getClientIdForCurrentUser } from "../../lib/clientAuth";
import { useMapEngagement } from "../../hooks/useMapEngagement";
import { parseDaysParam } from "../../lib/engagementAnalytics";
import { DailyEventsChart, DonutChart } from "../../components/engagement/EngagementCharts.jsx";
import ListingSearchDropdown from "../../components/engagement/ListingSearchDropdown.jsx";
import {
  DataTable,
  DateRangeSelect,
  FunnelChart,
  LoadingState,
  MetricCards,
  Panel,
} from "../../components/engagement/EngagementShared.jsx";
import styles from "./MapStats.module.css";
import "../admin/admin.css";

export default function MapStats() {
  const { mapId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const days = parseDaysParam(searchParams.get("days"), 30);

  const [map, setMap] = useState(null);
  const [listings, setListings] = useState([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const { metrics, loading: engagementLoading, error: engagementError } = useMapEngagement(mapId, days);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setPageLoading(true);
        setPageError("");
        const clientId = await getClientIdForCurrentUser();
        if (!clientId) throw new Error("No client account linked.");

        const [{ data: m, error: me }, { data: l, error: le }] = await Promise.all([
          supabase.from("maps").select("id,name,client_id").eq("id", mapId).single(),
          supabase
            .from("listings")
            .select("id,name")
            .eq("map_id", mapId)
            .eq("is_active", true)
            .order("name", { ascending: true }),
        ]);

        if (me) throw me;
        if (le) throw le;
        if (m.client_id !== clientId) throw new Error("This map does not belong to your account.");

        if (!cancelled) {
          setMap(m);
          setListings(l ?? []);
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
  }, [mapId]);

  function setDays(next) {
    const p = new URLSearchParams(searchParams);
    p.set("days", String(next));
    setSearchParams(p, { replace: true });
  }

  const loading = pageLoading || engagementLoading;

  if (pageLoading) {
    return (
      <div className="page-main">
        <div className={styles.page}>
          <LoadingState />
        </div>
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="page-main">
        <div className={styles.page}>
          <p className={styles.error}>{pageError}</p>
          <Link to="/client" className="btn">
            Back to My Maps
          </Link>
        </div>
      </div>
    );
  }

  const summaryCards = [
    { label: "Sessions", value: metrics.summary.sessions.toLocaleString() },
    { label: "Total events", value: metrics.summary.totalEvents.toLocaleString() },
    { label: "Listing opens", value: metrics.summary.listingOpens.toLocaleString() },
    { label: "Searches", value: metrics.summary.searches.toLocaleString() },
  ];

  const searchRows = metrics.topSearchQueries.map((row, i) => ({
    id: row.query + i,
    query: row.query,
    count: row.count,
    topResult: row.topResult,
  }));

  return (
    <div className="page-main">
      <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerMain}>
          <Link to="/client" className={styles.backLink}>
            ← My Maps
          </Link>
          <h1 className={styles.title}>{map?.name || "Map"} — Stats</h1>
        </div>
        <div className={styles.headerActions}>
          <DateRangeSelect days={days} onChange={setDays} />
          <ListingSearchDropdown listings={listings} mapId={mapId} days={days} />
        </div>
      </header>

      {engagementError ? <p className={styles.error}>{engagementError}</p> : null}

      {loading ? (
        <LoadingState />
      ) : !metrics.hasData ? (
        <div className={styles.emptyPage}>
          <h2>No engagement yet</h2>
          <p>When visitors use your published embed, activity will appear here for the selected period.</p>
        </div>
      ) : (
        <div className={styles.dashboard}>
          <MetricCards items={summaryCards} />

          <Panel title="Sessions and events per day" subtitle="Bars = events · Line = distinct sessions">
            <DailyEventsChart data={metrics.daily} />
          </Panel>

          <div className={styles.grid2}>
            <Panel title="Events by type">
              <DonutChart data={metrics.eventsByType} emptyMessage="No typed events in this period." />
            </Panel>
            <Panel title="Listing panel open — by source">
              <DonutChart data={metrics.panelOpenBySource} emptyMessage="No listing opens in this period." />
            </Panel>
          </div>

          <Panel title="Conversion funnel" subtitle="Step-to-step rate shown on the right">
            <FunnelChart steps={metrics.funnel} />
          </Panel>

          <Panel title="Top search queries" subtitle="Submitted searches (Enter or selection)">
            <DataTable
              columns={[
                { key: "query", label: "Query" },
                { key: "count", label: "Count" },
                { key: "topResult", label: "Most common result" },
              ]}
              rows={searchRows}
              emptyMessage="No submitted searches in this period."
            />
          </Panel>
        </div>
      )}
      </div>
    </div>
  );
}

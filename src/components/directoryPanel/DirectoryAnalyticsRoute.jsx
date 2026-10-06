import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useDirectory } from "../../hooks/useDirectory.js";
import { useDirectoryEngagement } from "../../hooks/useDirectoryEngagement.js";
import { supabase } from "../../lib/supabase.js";
import { deriveTopDirectoryEntries, parseDaysParam } from "../../lib/engagementAnalytics.js";
import { DailyEventsChart, DonutChart } from "../../components/engagement/EngagementCharts.jsx";
import {
  DataTable,
  DateRangeSelect,
  FunnelChart,
  LoadingState,
  MetricCards,
  Panel,
} from "../../components/engagement/EngagementShared.jsx";

/**
 * Insights (Phase 4 follow-up) — real visitor-engagement dashboard for a directory,
 * replacing the earlier stub. Reuses the map-side engagement dashboard's generic aggregation
 * helpers and presentational components (src/lib/engagementAnalytics.js,
 * src/components/engagement/*) — only the directory-specific event aggregation
 * (deriveDirectoryMetrics) and this page are new. Not to be confused with
 * DirectoryAnalyticsPanel.jsx (GA4/GTM tracking-code config, Settings › Integrations).
 *
 * Deliberately keeps `EngagementShared.jsx`'s own `Panel`/`MetricCards`/`DataTable` look (its own
 * CSS module, shared with the working `MapStats.jsx`/`ListingStats.jsx`) rather than reaching for
 * the new shell's `.card`/`.stat-grid` vocabulary — that's a third, already-cohesive design
 * system for exactly this kind of stats page, not the old `.admin-card` pattern the rest of
 * BACKLOG.md's "page body styling" entry is about. Only this file's own wrapper markup (the
 * empty-state card) uses the new classes.
 */
export default function DirectoryAnalyticsRoute() {
  const { directoryId } = useDirectory();
  const [searchParams, setSearchParams] = useSearchParams();
  const days = parseDaysParam(searchParams.get("days"), 30);
  const { events, metrics, loading, error } = useDirectoryEngagement(directoryId, days);
  const [entryNameById, setEntryNameById] = useState({});

  function setDays(next) {
    const p = new URLSearchParams(searchParams);
    p.set("days", String(next));
    setSearchParams(p, { replace: true });
  }

  const listingIds = useMemo(() => [...new Set(events.map((e) => e.listing_id).filter(Boolean))], [events]);

  useEffect(() => {
    if (listingIds.length === 0) {
      setEntryNameById({});
      return;
    }
    let cancelled = false;
    supabase
      .from("directory_entries")
      .select("id, name")
      .in("id", listingIds)
      .then(({ data }) => {
        if (!cancelled) setEntryNameById(Object.fromEntries((data ?? []).map((r) => [r.id, r.name])));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingIds.join(",")]);

  const topEntries = useMemo(() => deriveTopDirectoryEntries(metrics.entryCounts, entryNameById), [metrics.entryCounts, entryNameById]);

  if (loading) return <LoadingState />;
  if (error) return <p style={{ color: "var(--shell-danger)" }}>{error}</p>;

  const summaryCards = [
    { label: "Directory views", value: metrics.summary.directoryViews.toLocaleString() },
    { label: "Entry views", value: metrics.summary.listingViews.toLocaleString() },
    { label: "Enquiries opened", value: metrics.summary.enquiriesOpened.toLocaleString() },
    { label: "Searches", value: metrics.summary.searches.toLocaleString() },
  ];

  const searchRows = metrics.topSearchQueries.map((row, i) => ({ id: row.query + i, ...row }));
  const numCellStyle = { textAlign: "right" };
  const entryColumns = [
    { key: "name", label: "Entry" },
    { key: "listing_view", label: "Views", render: (r) => <span style={numCellStyle}>{r.listing_view.toLocaleString()}</span> },
    { key: "listing_cta_click", label: "CTA clicks", render: (r) => <span style={numCellStyle}>{r.listing_cta_click.toLocaleString()}</span> },
    { key: "listing_enquiry_open", label: "Enquiries", render: (r) => <span style={numCellStyle}>{r.listing_enquiry_open.toLocaleString()}</span> },
  ];
  const searchColumns = [
    { key: "query", label: "Search term" },
    { key: "count", label: "Times searched", render: (r) => <span style={numCellStyle}>{r.count.toLocaleString()}</span> },
  ];

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <DateRangeSelect days={days} onChange={setDays} />
      </div>

      <MetricCards items={summaryCards} />

      {!metrics.hasData ? (
        <div className="card card-pad">
          <p style={{ margin: 0 }}>No visitor activity recorded for this directory in this period.</p>
        </div>
      ) : (
        <>
          <Panel title="Views over time" subtitle="Directory + entry page views, and distinct visitor sessions">
            <DailyEventsChart data={metrics.daily} />
          </Panel>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <Panel title="Activity by type">
              <DonutChart data={metrics.eventsByType} />
            </Panel>
            <Panel title="Visitor journey" subtitle="Directory view → entry view → enquiry opened → enquiry sent">
              <FunnelChart steps={metrics.funnel} />
            </Panel>
          </div>

          <Panel title="Top search terms">
            <DataTable columns={searchColumns} rows={searchRows} emptyMessage="No searches in this period." />
          </Panel>

          <Panel title="Top entries">
            <DataTable columns={entryColumns} rows={topEntries} emptyMessage="No entry-level activity in this period." />
          </Panel>
        </>
      )}
    </div>
  );
}

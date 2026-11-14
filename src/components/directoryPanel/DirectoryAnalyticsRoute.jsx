import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useDirectory } from "../../hooks/useDirectory.js";
import { useDirectoryEngagement } from "../../hooks/useDirectoryEngagement.js";
import { supabase } from "../../lib/supabase.js";
import { deriveTopDirectoryEntries, parseDaysParam } from "../../lib/engagementAnalytics.js";
import { DailyEventsChart, DonutChart } from "../../components/engagement/EngagementCharts.jsx";
import { DateRangeSelect, FunnelChart } from "../../components/engagement/EngagementShared.jsx";
import { DataTable, EmptyState, ErrorState, PageLayout, Section, Skeleton, StatGrid, StatTile } from "../ui/index.js";
import "../../styles/wave-a/batch-1.css";

/**
 * Insights (Phase 4 follow-up) — real visitor-engagement dashboard for a directory,
 * replacing the earlier stub. Reuses the map-side engagement dashboard's generic aggregation
 * helpers and presentational components (src/lib/engagementAnalytics.js,
 * src/components/engagement/*) — only the directory-specific event aggregation
 * (deriveDirectoryMetrics) and this page are new. Not to be confused with
 * DirectoryAnalyticsPanel.jsx (GA4/GTM tracking-code config, Settings › Web Analytics).
 *
 * Built on the Discover UI kit (PageLayout, Section, StatTile, DataTable); charts come from
 * components/engagement.
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

  const dateRange = <DateRangeSelect days={days} onChange={setDays} />;
  const head = { title: "Insights", actions: dateRange };

  if (loading) {
    return (
      <PageLayout head={head}>
        <Skeleton variant="tiles" rows={4} label="Loading engagement data" />
      </PageLayout>
    );
  }
  if (error) {
    return (
      <PageLayout head={{ title: "Insights" }}>
        <ErrorState title="Couldn't load insights" body={`${error} Nothing has been lost.`} />
      </PageLayout>
    );
  }

  const summaryCards = [
    { label: "Directory views", value: metrics.summary.directoryViews.toLocaleString() },
    { label: "Entry views", value: metrics.summary.listingViews.toLocaleString() },
    { label: "Enquiries opened", value: metrics.summary.enquiriesOpened.toLocaleString() },
    { label: "Searches", value: metrics.summary.searches.toLocaleString() },
  ];

  const searchRows = metrics.topSearchQueries.map((row, i) => ({ id: row.query + i, ...row }));
  const entryRows = topEntries.map((row) => ({ ...row, id: row.listingId }));
  const entryColumns = [
    { key: "name", label: "Entry" },
    { key: "listing_view", label: "Views", align: "right", render: (r) => r.listing_view.toLocaleString() },
    { key: "listing_cta_click", label: "CTA clicks", align: "right", render: (r) => r.listing_cta_click.toLocaleString() },
    { key: "listing_enquiry_open", label: "Enquiries", align: "right", render: (r) => r.listing_enquiry_open.toLocaleString() },
  ];
  const searchColumns = [
    { key: "query", label: "Search term" },
    { key: "count", label: "Times searched", align: "right", render: (r) => r.count.toLocaleString() },
  ];

  return (
    <PageLayout
      head={head}
      summary={(
        <StatGrid>
          {summaryCards.map((item) => <StatTile key={item.label} label={item.label} value={item.value} />)}
        </StatGrid>
      )}
    >
      {!metrics.hasData ? (
        <EmptyState
          art="searching"
          title="No visitor activity recorded for this directory in this period"
          body="Try a longer period, or publish the directory so visitors can find it."
        />
      ) : (
        <>
          <Section title="Views over time" description="Directory + entry page views, and distinct visitor sessions">
            <DailyEventsChart data={metrics.daily} />
          </Section>

          <div className="b1-pair">
            <Section title="Activity by type">
              <DonutChart data={metrics.eventsByType} />
            </Section>
            <Section title="Visitor journey" description="Directory view → entry view → enquiry opened → enquiry sent">
              <FunnelChart steps={metrics.funnel} />
            </Section>
          </div>

          <Section title="Top search terms" flush>
            <DataTable
              caption="Top search terms"
              columns={searchColumns}
              rows={searchRows}
              getRowId={(r) => r.id}
              getRowLabel={(r) => r.query}
              empty={<EmptyState art="none" title="No searches in this period" />}
            />
          </Section>

          <Section title="Top entries" flush>
            <DataTable
              caption="Top entries"
              columns={entryColumns}
              rows={entryRows}
              getRowId={(r) => r.id}
              getRowLabel={(r) => r.name}
              empty={<EmptyState art="none" title="No entry-level activity in this period" />}
            />
          </Section>
        </>
      )}
    </PageLayout>
  );
}

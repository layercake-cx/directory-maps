/** @typedef {{ occurred_at: string, event_type: string, listing_id?: string|null, meta?: Record<string, unknown>|null, client_session_id?: string|null }} EngagementEvent */

export const DAY_OPTIONS = [
  { value: 7, label: "Last 7 days" },
  { value: 14, label: "Last 14 days" },
  { value: 30, label: "Last 30 days" },
];

export function parseDaysParam(raw, fallback = 30) {
  const n = Number(raw);
  if (n === 7 || n === 14 || n === 30) return n;
  return fallback;
}

export function getStartDate(days) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days + 1);
  return start;
}

function localDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function buildDayKeys(days) {
  const keys = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    keys.push(localDateStr(x));
  }
  return keys;
}

function formatDayLabel(isoDate) {
  const d = new Date(isoDate + "T12:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function metaObj(meta) {
  if (!meta || typeof meta !== "object") return {};
  return meta;
}

const EVENT_TYPE_LABELS = {
  listing_panel_open: "Listing opens",
  search: "Search",
  directory_group_expand: "Group expand",
  website_click: "Website click",
  email_click: "Email click",
  message_compose_open: "Message compose",
  message_sent: "Message sent",
};

const SOURCE_LABELS = {
  marker: "Marker",
  list_panel: "List panel",
  search: "Search",
};

const DONUT_EVENT_TYPES = [
  "listing_panel_open",
  "search",
  "directory_group_expand",
  "website_click",
  "email_click",
  "message_sent",
];

/** Listing-level interaction columns for Top listings table (map stats). */
export const LISTING_INTERACTION_COLUMNS = [
  { key: "listing_panel_open", label: "Opens" },
  { key: "website_click", label: "Website" },
  { key: "email_click", label: "Email" },
  { key: "message_compose_open", label: "Compose" },
  { key: "message_sent", label: "Sent" },
];

const LISTING_INTERACTION_KEYS = LISTING_INTERACTION_COLUMNS.map((c) => c.key);

/**
 * @param {EngagementEvent[]} events
 * @param {Record<string, string>} listingNameById
 * @param {number} [limit]
 */
export function deriveTopListings(events, listingNameById, limit = 25) {
  const byId = new Map();

  for (const e of events) {
    const lid = e.listing_id;
    if (!lid || !LISTING_INTERACTION_KEYS.includes(e.event_type)) continue;

    if (!byId.has(lid)) {
      byId.set(lid, Object.fromEntries(LISTING_INTERACTION_KEYS.map((k) => [k, 0])));
    }
    byId.get(lid)[e.event_type] += 1;
  }

  return [...byId.entries()]
    .map(([listingId, counts]) => {
      const total = LISTING_INTERACTION_KEYS.reduce((sum, k) => sum + counts[k], 0);
      return {
        listingId,
        name: listingNameById[listingId] || "Unknown listing",
        ...counts,
        total,
      };
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

function funnelRate(current, previous) {
  if (!previous) return null;
  return Math.round((current / previous) * 100);
}

/**
 * @param {EngagementEvent[]} events
 * @param {number} days
 */
export function deriveMapMetrics(events, days) {
  const dayKeys = buildDayKeys(days);
  const dailyBuckets = new Map(dayKeys.map((k) => [k, { events: 0, sessions: new Set() }]));
  const sessions = new Set();
  let listingOpens = 0;
  let searches = 0;
  const typeCounts = Object.fromEntries(DONUT_EVENT_TYPES.map((t) => [t, 0]));
  const sourceCounts = { marker: 0, list_panel: 0, search: 0 };
  let sessionStarts = 0;
  let websiteClicks = 0;
  let emailClicks = 0;
  let messageCompose = 0;
  let messagesSent = 0;
  const searchSubmitMap = new Map();

  for (const e of events) {
    const day = e.occurred_at ? localDateStr(new Date(e.occurred_at)) : null;
    if (day && dailyBuckets.has(day)) {
      const b = dailyBuckets.get(day);
      b.events += 1;
      if (e.client_session_id) b.sessions.add(e.client_session_id);
    }
    if (e.client_session_id) sessions.add(e.client_session_id);

    switch (e.event_type) {
      case "session_start":
        sessionStarts += 1;
        break;
      case "listing_panel_open":
        listingOpens += 1;
        typeCounts.listing_panel_open += 1;
        {
          const src = metaObj(e.meta).source;
          if (src === "marker" || src === "list_panel" || src === "search") {
            sourceCounts[src] += 1;
          }
        }
        break;
      case "search":
        searches += 1;
        typeCounts.search += 1;
        if (metaObj(e.meta).action === "submit") {
          const q = String(metaObj(e.meta).query || "").trim();
          if (q) {
            const prev = searchSubmitMap.get(q) || { count: 0, results: {} };
            prev.count += 1;
            const res = metaObj(e.meta).result;
            if (res) prev.results[String(res)] = (prev.results[String(res)] || 0) + 1;
            searchSubmitMap.set(q, prev);
          }
        }
        break;
      case "directory_group_expand":
        typeCounts.directory_group_expand += 1;
        break;
      case "website_click":
        websiteClicks += 1;
        typeCounts.website_click += 1;
        break;
      case "email_click":
        emailClicks += 1;
        typeCounts.email_click += 1;
        break;
      case "message_compose_open":
        messageCompose += 1;
        typeCounts.message_compose_open += 1;
        break;
      case "message_sent":
        messagesSent += 1;
        typeCounts.message_sent += 1;
        break;
      default:
        break;
    }
  }

  const daily = dayKeys.map((date) => {
    const b = dailyBuckets.get(date);
    return {
      date,
      dateLabel: formatDayLabel(date),
      events: b.events,
      sessions: b.sessions.size,
    };
  });

  const eventsByType = DONUT_EVENT_TYPES.filter((t) => typeCounts[t] > 0).map((type) => ({
    type,
    name: EVENT_TYPE_LABELS[type] || type,
    value: typeCounts[type],
  }));

  const panelOpenBySource = ["marker", "list_panel", "search"]
    .filter((s) => sourceCounts[s] > 0)
    .map((source) => ({
      source,
      name: SOURCE_LABELS[source] || source,
      value: sourceCounts[source],
    }));

  const funnelSteps = [
    { key: "session_start", label: "Session starts", count: sessionStarts },
    { key: "listing_panel_open", label: "Listing panel opens", count: listingOpens },
    { key: "clicks", label: "Website / email clicks", count: websiteClicks + emailClicks },
    { key: "message_compose_open", label: "Message compose opens", count: messageCompose },
    { key: "message_sent", label: "Messages sent", count: messagesSent },
  ];

  const funnel = funnelSteps.map((step, i) => ({
    ...step,
    rate: i === 0 ? null : funnelRate(step.count, funnelSteps[i - 1].count),
  }));

  const topSearchQueries = [...searchSubmitMap.entries()]
    .map(([query, { count, results }]) => {
      const topResult =
        Object.entries(results).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
      return { query, count, topResult };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    summary: {
      sessions: sessions.size,
      totalEvents: events.length,
      listingOpens,
      searches,
    },
    daily,
    eventsByType,
    panelOpenBySource,
    funnel,
    topSearchQueries,
    hasData: events.length > 0,
  };
}

/**
 * @param {EngagementEvent[]} events
 * @param {number} days
 */
export function deriveListingMetrics(events, days) {
  const dayKeys = buildDayKeys(days);
  const dailyBuckets = new Map(
    dayKeys.map((k) => [
      k,
      { panelOpens: 0, websiteClicks: 0, emailClicks: 0, messagesSent: 0 },
    ]),
  );
  let panelOpens = 0;
  let websiteClicks = 0;
  let emailClicks = 0;
  let messageCompose = 0;
  let messagesSent = 0;
  const sourceCounts = { marker: 0, list_panel: 0, search: 0 };

  for (const e of events) {
    const day = e.occurred_at ? localDateStr(new Date(e.occurred_at)) : null;
    const bucket = day && dailyBuckets.get(day);

    switch (e.event_type) {
      case "listing_panel_open":
        panelOpens += 1;
        if (bucket) bucket.panelOpens += 1;
        {
          const src = metaObj(e.meta).source;
          if (src === "marker" || src === "list_panel" || src === "search") {
            sourceCounts[src] += 1;
          }
        }
        break;
      case "website_click":
        websiteClicks += 1;
        if (bucket) bucket.websiteClicks += 1;
        break;
      case "email_click":
        emailClicks += 1;
        if (bucket) bucket.emailClicks += 1;
        break;
      case "message_compose_open":
        messageCompose += 1;
        break;
      case "message_sent":
        messagesSent += 1;
        if (bucket) bucket.messagesSent += 1;
        break;
      default:
        break;
    }
  }

  const daily = dayKeys.map((date) => {
    const b = dailyBuckets.get(date);
    return {
      date,
      dateLabel: formatDayLabel(date),
      panelOpens: b.panelOpens,
      websiteClicks: b.websiteClicks,
      emailClicks: b.emailClicks,
      messagesSent: b.messagesSent,
    };
  });

  const funnelSteps = [
    { key: "listing_panel_open", label: "Panel opens", count: panelOpens },
    { key: "website_click", label: "Website click", count: websiteClicks },
    { key: "email_click", label: "Email click", count: emailClicks },
    { key: "message_compose_open", label: "Message compose open", count: messageCompose },
    { key: "message_sent", label: "Message sent", count: messagesSent },
  ];

  const funnel = funnelSteps.map((step, i) => ({
    ...step,
    rate: i === 0 ? null : funnelRate(step.count, funnelSteps[i - 1].count),
  }));

  const sourceTotal = sourceCounts.marker + sourceCounts.list_panel + sourceCounts.search;
  const visitorsBySource = ["marker", "list_panel", "search"].map((source) => ({
    source,
    name: SOURCE_LABELS[source] || source,
    count: sourceCounts[source],
    pct: sourceTotal ? Math.round((sourceCounts[source] / sourceTotal) * 100) : 0,
  }));

  const recentActivity = [...events]
    .sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at))
    .slice(0, 20)
    .map((e) => ({
      id: `${e.occurred_at}-${e.event_type}`,
      occurredAt: e.occurred_at,
      eventType: e.event_type,
      meta: metaObj(e.meta),
      label: activityLabel(e),
      badge: e.event_type === "listing_panel_open" ? sourceBadge(metaObj(e.meta).source) : null,
    }));

  return {
    summary: { panelOpens, websiteClicks, emailClicks, messagesSent },
    daily,
    funnel,
    visitorsBySource,
    sourceTotal,
    recentActivity,
    hasData: events.length > 0,
  };
}

function sourceBadge(source) {
  if (source === "marker") return "Marker";
  if (source === "list_panel") return "List panel";
  if (source === "search") return "Search";
  return null;
}

/** @param {EngagementEvent} e */
function activityLabel(e) {
  const m = metaObj(e.meta);
  switch (e.event_type) {
    case "listing_panel_open":
      if (m.source === "marker") return "Panel opened via map marker";
      if (m.source === "list_panel") return "Panel opened from list panel";
      if (m.source === "search") return "Panel opened from search";
      return "Listing panel opened";
    case "website_click":
      return "Website link clicked";
    case "email_click":
      return "Email link clicked";
    case "message_compose_open":
      return "Message compose opened";
    case "message_sent":
      return "Message sent";
    case "search":
      return "Search used";
    default:
      return e.event_type.replace(/_/g, " ");
  }
}

export function formatRelativeTime(iso) {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const dayStart = new Date(d);
  dayStart.setHours(0, 0, 0, 0);
  if (dayStart.getTime() === yesterday.getTime()) {
    return `Yesterday, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  }
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const DIRECTORY_EVENT_TYPE_LABELS = {
  views: "Views",
  searches: "Searches",
  filters: "Filters",
  cta_clicks: "Website/CTA clicks",
  email_clicks: "Email clicks",
  enquiries: "Enquiries",
  claims: "Claims",
};

/**
 * @param {EngagementEvent[]} events directory-scoped map_engagement_events rows
 *   (event_type in directory_view/listing_view/directory_search/directory_filter/
 *   directory_distance_filter/listing_website_click/listing_contact_click/
 *   listing_cta_click/listing_enquiry_open/listing_enquiry_sent/listing_claim_start/
 *   listing_claim_complete — see docs/MAP_ENGAGEMENT.md).
 * @param {number} days
 */
export function deriveDirectoryMetrics(events, days) {
  const dayKeys = buildDayKeys(days);
  const dailyBuckets = new Map(dayKeys.map((k) => [k, { events: 0, sessions: new Set() }]));
  const sessions = new Set();

  let directoryViews = 0;
  let listingViews = 0;
  let searches = 0;
  let filters = 0;
  let emailClicks = 0;
  let enquiriesOpened = 0;
  let enquiriesSent = 0;
  let claimsStarted = 0;
  let claimsCompleted = 0;
  const ctaCounts = {}; // by meta.cta_type — listing_cta_click only (see note below)
  const searchCountMap = new Map();
  const entryCounts = new Map(); // listing_id -> {listing_view, listing_cta_click, listing_enquiry_open}

  for (const e of events) {
    const day = e.occurred_at ? localDateStr(new Date(e.occurred_at)) : null;
    const isViewEvent = e.event_type === "directory_view" || e.event_type === "listing_view";
    if (day && dailyBuckets.has(day) && isViewEvent) {
      const b = dailyBuckets.get(day);
      b.events += 1;
      if (e.client_session_id) b.sessions.add(e.client_session_id);
    }
    if (e.client_session_id) sessions.add(e.client_session_id);

    const m = metaObj(e.meta);
    switch (e.event_type) {
      case "directory_view":
        directoryViews += 1;
        break;
      case "listing_view":
        listingViews += 1;
        if (e.listing_id) bump(entryCounts, e.listing_id, "listing_view");
        break;
      case "directory_search":
        searches += 1;
        {
          const q = String(m.query || "").trim();
          if (q) searchCountMap.set(q, (searchCountMap.get(q) || 0) + 1);
        }
        break;
      case "directory_filter":
      case "directory_distance_filter":
        filters += 1;
        break;
      case "listing_contact_click":
        emailClicks += 1;
        break;
      case "listing_cta_click":
        // Deliberately the only source for CTA counts — listing_website_click is a duplicate
        // insert for the same click (see docs/MAP_ENGAGEMENT.md and this dashboard's own research
        // notes); counting both would double-count website clicks.
        {
          const type = String(m.cta_type || "other");
          ctaCounts[type] = (ctaCounts[type] || 0) + 1;
          if (e.listing_id) bump(entryCounts, e.listing_id, "listing_cta_click");
        }
        break;
      case "listing_enquiry_open":
        enquiriesOpened += 1;
        if (e.listing_id) bump(entryCounts, e.listing_id, "listing_enquiry_open");
        break;
      case "listing_enquiry_sent":
        enquiriesSent += 1;
        break;
      case "listing_claim_start":
        claimsStarted += 1;
        break;
      case "listing_claim_complete":
        claimsCompleted += 1;
        break;
      default:
        break;
    }
  }

  const daily = dayKeys.map((date) => {
    const b = dailyBuckets.get(date);
    return { date, dateLabel: formatDayLabel(date), events: b.events, sessions: b.sessions.size };
  });

  const ctaClickTotal = Object.values(ctaCounts).reduce((sum, n) => sum + n, 0);
  const typeCounts = {
    views: directoryViews + listingViews,
    searches,
    filters,
    cta_clicks: ctaClickTotal,
    email_clicks: emailClicks,
    enquiries: enquiriesOpened,
    claims: claimsStarted,
  };
  const eventsByType = Object.entries(typeCounts)
    .filter(([, value]) => value > 0)
    .map(([type, value]) => ({ type, name: DIRECTORY_EVENT_TYPE_LABELS[type] || type, value }));

  const funnelSteps = [
    { key: "directory_view", label: "Directory views", count: directoryViews },
    { key: "listing_view", label: "Entry views", count: listingViews },
    { key: "listing_enquiry_open", label: "Enquiries opened", count: enquiriesOpened },
    { key: "listing_enquiry_sent", label: "Enquiries sent", count: enquiriesSent },
  ];
  const funnel = funnelSteps.map((step, i) => ({
    ...step,
    rate: i === 0 ? null : funnelRate(step.count, funnelSteps[i - 1].count),
  }));

  const topSearchQueries = [...searchCountMap.entries()]
    .map(([query, count]) => ({ query, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    summary: {
      directoryViews,
      listingViews,
      enquiriesOpened,
      searches,
      claimsStarted,
      claimsCompleted,
    },
    daily,
    eventsByType,
    funnel,
    topSearchQueries,
    entryCounts, // Map<listingId, {listing_view, listing_cta_click, listing_enquiry_open}> — see deriveTopDirectoryEntries
    hasData: events.length > 0,
  };
}

function bump(map, key, field) {
  if (!map.has(key)) map.set(key, { listing_view: 0, listing_cta_click: 0, listing_enquiry_open: 0 });
  map.get(key)[field] += 1;
}

/**
 * @param {Map<string, {listing_view:number, listing_cta_click:number, listing_enquiry_open:number}>} entryCounts
 * @param {Record<string, string>} entryNameById
 */
export function deriveTopDirectoryEntries(entryCounts, entryNameById, limit = 25) {
  return [...entryCounts.entries()]
    .map(([listingId, counts]) => {
      const total = counts.listing_view + counts.listing_cta_click + counts.listing_enquiry_open;
      return { listingId, name: entryNameById[listingId] || "Unknown entry", ...counts, total };
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export const CHART_COLORS = [
  "#378ADD",
  "#1D9E75",
  "#D85A30",
  "#7F77DD",
  "#D4537E",
  "#888780",
];

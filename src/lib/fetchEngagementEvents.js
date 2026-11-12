import { supabase } from "./supabase";

// Supabase's API returns at most 1,000 rows per request unless the project raises max_rows. The
// Insights hooks used to make a single request, so any map/directory with more events than that in
// the window was silently truncated to its OLDEST rows (oldest-first order) and the newest days
// showed as empty. This pages through the whole window instead.
const PAGE_SIZE = 1000;
// Safety valve so a runaway window can't hang the browser. Raised only if a real customer needs it;
// the proper fix at that scale is server-side aggregation (see BACKLOG.md).
const MAX_ROWS = 100000;

/**
 * Fetch every matching engagement event, oldest first.
 * @param {string} columns  Comma-separated select list.
 * @param {(q: any) => any} applyFilters  Adds .eq/.gte filters to the query builder.
 * @returns {Promise<any[]>}
 */
export async function fetchAllEngagementEvents(columns, applyFilters) {
  const rows = [];
  while (rows.length < MAX_ROWS) {
    // `id` as a tiebreaker keeps page boundaries stable when events share a timestamp.
    const query = applyFilters(supabase.from("map_engagement_events").select(columns))
      .order("occurred_at", { ascending: true })
      .order("id", { ascending: true })
      .range(rows.length, rows.length + PAGE_SIZE - 1);
    const { data, error } = await query;
    if (error) throw error;
    // Advance by what actually came back (a lower server-side cap still pages correctly) and stop on
    // an empty page.
    if (!data || data.length === 0) break;
    rows.push(...data);
  }
  if (rows.length >= MAX_ROWS) {
    console.warn(`Engagement events truncated at ${MAX_ROWS} rows; newest events are missing.`);
  }
  return rows;
}

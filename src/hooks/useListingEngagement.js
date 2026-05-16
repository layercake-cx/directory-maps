import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { deriveListingMetrics, getStartDate } from "../lib/engagementAnalytics";

/**
 * @param {string|undefined} mapId
 * @param {string|undefined} listingId
 * @param {number} days
 */
export function useListingEngagement(mapId, listingId, days) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!mapId || !listingId) {
      setEvents([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError("");
        const startDate = getStartDate(days);
        const { data, error: fetchErr } = await supabase
          .from("map_engagement_events")
          .select("occurred_at, event_type, meta, client_session_id")
          .eq("map_id", mapId)
          .eq("listing_id", listingId)
          .gte("occurred_at", startDate.toISOString())
          .order("occurred_at", { ascending: true });

        if (cancelled) return;
        if (fetchErr) throw fetchErr;
        setEvents(data ?? []);
      } catch (e) {
        if (!cancelled) {
          setError(e?.message ?? String(e));
          setEvents([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mapId, listingId, days]);

  const metrics = useMemo(() => deriveListingMetrics(events, days), [events, days]);

  return { events, metrics, loading, error };
}

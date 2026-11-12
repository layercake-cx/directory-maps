import { useEffect, useMemo, useState } from "react";
import { fetchAllEngagementEvents } from "../lib/fetchEngagementEvents";
import { deriveMapMetrics, getStartDate } from "../lib/engagementAnalytics";

/**
 * @param {string|undefined} mapId
 * @param {number} days
 */
export function useMapEngagement(mapId, days) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!mapId) {
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
        const data = await fetchAllEngagementEvents(
          "occurred_at, event_type, listing_id, meta, client_session_id",
          (q) => q.eq("map_id", mapId).gte("occurred_at", startDate.toISOString()),
        );

        if (cancelled) return;
        setEvents(data);
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
  }, [mapId, days]);

  const metrics = useMemo(() => deriveMapMetrics(events, days), [events, days]);

  return { events, metrics, loading, error };
}

import { useEffect, useMemo, useState } from "react";
import { fetchAllEngagementEvents } from "../lib/fetchEngagementEvents";
import { deriveDirectoryMetrics, getStartDate } from "../lib/engagementAnalytics";

/**
 * Directory-scoped mirror of useMapEngagement.js. RLS on map_engagement_events already lets a
 * real client contact (owner/manager, or one with a contact_directory_permissions grant) query
 * their own directory's rows directly — confirmed before building this, unlike admin_events which
 * has no client-scoped policy at all.
 * @param {string|undefined} directoryId
 * @param {number} days
 */
export function useDirectoryEngagement(directoryId, days) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!directoryId) {
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
          (q) => q.eq("directory_id", directoryId).gte("occurred_at", startDate.toISOString()),
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
  }, [directoryId, days]);

  const metrics = useMemo(() => deriveDirectoryMetrics(events, days), [events, days]);

  return { events, metrics, loading, error };
}

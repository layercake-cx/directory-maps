import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
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
        const { data, error: fetchErr } = await supabase
          .from("map_engagement_events")
          .select("occurred_at, event_type, listing_id, meta, client_session_id")
          .eq("map_id", mapId)
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
  }, [mapId, days]);

  const metrics = useMemo(() => deriveMapMetrics(events, days), [events, days]);

  return { events, metrics, loading, error };
}

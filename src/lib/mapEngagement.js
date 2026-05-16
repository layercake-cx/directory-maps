const SESSION_KEY = "dm_map_engagement_session_id";

function getOrCreateSessionId() {
  if (typeof sessionStorage === "undefined") return null;
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `s_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget recorder for map_engagement_events (anon embed inserts when map is published).
 * @param {object} opts
 * @param {import("@supabase/supabase-js").SupabaseClient} opts.supabase
 * @param {string} opts.mapId
 * @param {"embed"|"client_preview"|"admin_preview"} [opts.surface]
 * @returns {(eventType: string, detail?: { listingId?: string|null, meta?: object|null }) => void}
 */
export function createMapEngagementRecorder({ supabase, mapId, surface = "embed" }) {
  const clientSessionId = getOrCreateSessionId();

  return function recordEngagement(eventType, detail = {}) {
    if (!mapId || !supabase) return;
    const listingId = detail.listingId ?? null;
    const meta = detail.meta ?? null;
    const row = {
      map_id: mapId,
      listing_id: listingId,
      event_type: eventType,
      surface,
      client_session_id: clientSessionId,
      meta,
    };
    void supabase.from("map_engagement_events").insert(row).then(({ error }) => {
      if (error && typeof console !== "undefined" && console.warn) {
        console.warn("map engagement:", error.message ?? error);
      }
    });
  };
}

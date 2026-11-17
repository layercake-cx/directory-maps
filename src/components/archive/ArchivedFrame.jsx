import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { ArchivedBanner, ReadOnly } from "../ui/index.js";
import { useArchivedByName } from "../../lib/archive.js";
import { useArchiveFlow } from "./useArchiveFlow.jsx";

/**
 * Wraps a map record page: when the map is archived, shows the ArchivedBanner (with Restore for people who
 * may restore) and renders the page read-only. Active maps render children untouched.
 */
export default function ArchivedMapFrame({ mapId, isStaff = false, canManage = false, children }) {
  const [map, setMap] = useState(null);
  const load = useCallback(async () => {
    if (!mapId) return;
    const { data } = await supabase.from("maps").select("id, name, client_id, published_at, is_active, archived_at, archived_by").eq("id", mapId).maybeSingle();
    setMap(data ?? null);
  }, [mapId]);
  useEffect(() => { setMap(null); load(); }, [load]);

  const { restore, busyIds } = useArchiveFlow({ entityType: "map", isStaff, clientId: map?.client_id, onChanged: load });
  const byName = useArchivedByName(map?.archived_by);

  if (map?.is_active !== false) return children;
  return (
    <>
      <ArchivedBanner
        thing="map"
        archivedAt={map.archived_at}
        archivedBy={byName}
        onRestore={canManage ? () => restore([map], "banner") : undefined}
        restoring={busyIds.includes(map.id)}
      />
      <ReadOnly active>{children}</ReadOnly>
    </>
  );
}

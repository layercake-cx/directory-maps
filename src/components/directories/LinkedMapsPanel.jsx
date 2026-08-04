import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  addLinkedMap,
  buildMapEmbedSrc,
  listClientMaps,
  listLinkedMaps,
  reorderLinkedMaps,
  removeLinkedMap,
} from "../../lib/directoryMapAssociations";

/**
 * Maps linked to a directory (docs/DIRECTORIES.md DIR-E8-S1/S2), shared by
 * both the admin and client directory-settings pages. Renders each linked
 * map using the existing map-embed iframe convention (§3.4) — there is no
 * public directory page yet (DIR-E2), so this is shown as a preview panel
 * on the authenticated directory-settings page rather than on a public
 * "published page", which doesn't exist yet.
 *
 * @param {string} directoryId
 * @param {string} clientId
 * @param {string} [clientSlug]
 * @param {boolean} canManage
 * @param {(eventType: string, meta?: object) => void} recordEvent
 */
export default function LinkedMapsPanel({ directoryId, clientId, clientSlug, canManage, recordEvent }) {
  const [linked, setLinked] = useState([]);
  const [clientMaps, setClientMaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [pickerValue, setPickerValue] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!directoryId || !clientId) return;
    try {
      setLoading(true);
      setErr("");
      const [linkedMaps, allMaps] = await Promise.all([
        listLinkedMaps(directoryId),
        listClientMaps(clientId),
      ]);
      setLinked(linkedMaps);
      setClientMaps(allMaps);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [directoryId, clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const linkedIds = useMemo(() => new Set(linked.map((m) => m.id)), [linked]);
  const available = useMemo(() => clientMaps.filter((m) => !linkedIds.has(m.id)), [clientMaps, linkedIds]);

  async function handleAdd() {
    if (!pickerValue) return;
    try {
      setBusy(true);
      setErr("");
      await addLinkedMap(directoryId, pickerValue);
      const map = clientMaps.find((m) => m.id === pickerValue);
      recordEvent?.("directory_map_associated", { directory_id: directoryId, map_id: pickerValue, map_name: map?.name });
      setPickerValue("");
      await load();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(mapId, mapName) {
    try {
      setBusy(true);
      setErr("");
      await removeLinkedMap(directoryId, mapId);
      recordEvent?.("directory_map_removed", { directory_id: directoryId, map_id: mapId, map_name: mapName });
      await load();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleMove(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= linked.length) return;
    const reordered = linked.slice();
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setLinked(reordered);
    try {
      setBusy(true);
      await reorderLinkedMaps(directoryId, reordered.map((m) => m.id));
      recordEvent?.("directory_maps_reordered", { directory_id: directoryId, order: reordered.map((m) => m.id) });
    } catch (e) {
      setErr(e?.message ?? String(e));
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p style={{ fontSize: 13, opacity: 0.6 }}>Loading linked maps…</p>;

  return (
    <div>
      {err && <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p>}

      {linked.length === 0 ? (
        <p style={{ fontSize: 13, opacity: 0.6, margin: "0 0 10px" }}>No maps linked yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 12 }}>
          {linked.map((map, index) => {
            const embedSrc = buildMapEmbedSrc({ clientSlug, mapSlug: map.slug, mapId: map.id });
            return (
              <div key={map.id} style={{ border: "1px solid var(--lc-border)", borderRadius: 10, padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
                  <strong style={{ fontSize: 13 }}>{map.name}</strong>
                  {canManage && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" className="btn" disabled={busy || index === 0} onClick={() => handleMove(index, -1)}>↑</button>
                      <button type="button" className="btn" disabled={busy || index === linked.length - 1} onClick={() => handleMove(index, 1)}>↓</button>
                      <button
                        type="button"
                        className="btn"
                        style={{ color: "#b91c1c" }}
                        disabled={busy}
                        onClick={() => handleRemove(map.id, map.name)}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
                <iframe
                  src={embedSrc}
                  title={`Embedded map: ${map.name}`}
                  width="100%"
                  height="260"
                  style={{ border: 0, borderRadius: 8, display: "block" }}
                  loading="lazy"
                />
              </div>
            );
          })}
        </div>
      )}

      {canManage && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            value={pickerValue}
            onChange={(e) => setPickerValue(e.target.value)}
            style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13 }}
            disabled={busy || available.length === 0}
          >
            <option value="">{available.length === 0 ? "No more maps to link" : "Choose a map…"}</option>
            {available.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <button type="button" className="btn" onClick={handleAdd} disabled={busy || !pickerValue}>
            Link map
          </button>
        </div>
      )}
    </div>
  );
}

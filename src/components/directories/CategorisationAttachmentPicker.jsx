import React, { useCallback, useEffect, useState } from "react";
import {
  listCategorisations,
  listAttachedCategorisations,
  attachCategorisation,
  detachCategorisation,
} from "../../lib/categorisations";

/**
 * Explicit opt-in for a categorisation to be usable on a specific map or
 * directory (categorisation_attachments — 20260829040000). A categorisation
 * defines nothing about where it applies on its own; the same categorisation
 * can be attached to any number of maps and directories independently, and
 * a map/directory with nothing attached simply has no category filters.
 * Used from both a map's Filters panel (targetType="map") and a directory's
 * settings (targetType="directory").
 *
 * @param {string} clientId
 * @param {"map"|"directory"} targetType
 * @param {string} targetId
 * @param {(eventType: string, meta?: object) => void} [recordEvent]
 * @param {boolean} [canManage]
 */
export default function CategorisationAttachmentPicker({ clientId, targetType, targetId, recordEvent, canManage = true }) {
  const [allCats, setAllCats] = useState([]);
  const [attached, setAttached] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [toAttach, setToAttach] = useState("");

  const refresh = useCallback(async () => {
    if (!clientId || !targetId) return;
    setLoading(true);
    try {
      const [all, att] = await Promise.all([
        listCategorisations(clientId),
        listAttachedCategorisations(targetType, targetId),
      ]);
      setAllCats(all);
      setAttached(att);
      setError("");
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [clientId, targetType, targetId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const attachedIds = new Set(attached.map((c) => c.id));
  const available = allCats.filter((c) => !attachedIds.has(c.id));

  async function handleAttach() {
    if (!toAttach) return;
    setBusy(true);
    try {
      await attachCategorisation({ categorisationId: toAttach, targetType, targetId });
      recordEvent?.(`${targetType}_categorisation_attached`, { categorisation_id: toAttach, target_id: targetId });
      setToAttach("");
      setPickerOpen(false);
      await refresh();
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDetach(categorisationId) {
    setBusy(true);
    try {
      await detachCategorisation({ categorisationId, targetType, targetId });
      recordEvent?.(`${targetType}_categorisation_detached`, { categorisation_id: categorisationId, target_id: targetId });
      await refresh();
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p style={{ margin: 0, opacity: 0.7 }}>Loading categories…</p>;

  return (
    <div className="panel-section">
      <p className="panel-section__title">Categories</p>
      <p style={{ margin: "0 0 8px", fontSize: 12, opacity: 0.75 }}>
        Attach a category to use its terms as filters here. The same category can be attached to any number of maps
        and directories independently.
      </p>
      {error && <p style={{ color: "#b91c1c", fontSize: 13, margin: "0 0 8px" }}>{error}</p>}

      {attached.length === 0 ? (
        <p style={{ margin: "0 0 8px", fontSize: 13, opacity: 0.7 }}>No categories attached yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
          {attached.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1, fontSize: 13, minWidth: 0 }}>
                {c.label}
                <span style={{ opacity: 0.6 }}> · {c.terms.length} term{c.terms.length === 1 ? "" : "s"}</span>
              </span>
              {canManage && (
                <button type="button" className="btn" disabled={busy} onClick={() => handleDetach(c.id)}>Detach</button>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && available.length > 0 && (
        pickerOpen ? (
          <div style={{ display: "flex", gap: 8 }}>
            <select value={toAttach} onChange={(e) => setToAttach(e.target.value)} style={{ flex: 1 }}>
              <option value="">Choose a category…</option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            <button type="button" className="btn btn-primary" disabled={busy || !toAttach} onClick={handleAttach}>
              Attach
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => { setPickerOpen(false); setToAttach(""); }}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="btn" onClick={() => setPickerOpen(true)}>+ Attach a category</button>
        )
      )}
      {canManage && available.length === 0 && allCats.length === 0 && (
        <p style={{ margin: 0, fontSize: 12, opacity: 0.6 }}>No categories exist for this client yet — create one in Categorisations.</p>
      )}
    </div>
  );
}

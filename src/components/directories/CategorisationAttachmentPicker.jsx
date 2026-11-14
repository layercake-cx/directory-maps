import React, { useCallback, useEffect, useState } from "react";
import { Button, Callout, Field, Section, Select, Skeleton, EmptyState, ArrowUpIcon, ArrowDownIcon } from "../ui/index.js";
import "../../styles/wave-a/batch-3.css";
import {
  listCategorisations,
  listAttachedCategorisations,
  attachCategorisation,
  detachCategorisation,
  reorderAttachedCategorisations,
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

  /** Move an attached categorisation up/down — the filter rail renders in this order. */
  async function handleMove(index, direction) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= attached.length) return;
    const reordered = attached.slice();
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    setAttached(reordered); // optimistic — refresh() below reconciles with the server
    setBusy(true);
    try {
      await reorderAttachedCategorisations({
        targetType,
        targetId,
        orderedCategorisationIds: reordered.map((c) => c.id),
      });
      recordEvent?.(`${targetType}_categorisation_reordered`, { target_id: targetId, order: reordered.map((c) => c.id) });
      await refresh();
    } catch (e) {
      setError(e?.message ?? String(e));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Section title="Categories"><Skeleton variant="list" rows={2} label="Loading categories" /></Section>;

  return (
    <Section
      title="Categories"
      description="Attach a category to use its terms as filters here. The same category can be attached to any number of maps and directories independently."
      actions={canManage && available.length > 0 && !pickerOpen ? (
        <Button size="sm" onClick={() => setPickerOpen(true)}>Attach a category</Button>
      ) : null}
    >
      {error ? <Callout tone="danger">{error}</Callout> : null}

      {attached.length === 0 ? (
        <EmptyState
          art="none"
          title="No categories attached yet"
          body={canManage && available.length === 0 && allCats.length === 0
            ? "No categories exist for this client yet. Create one in Categories."
            : "Attach a category to use its terms as filters."}
        />
      ) : (
        <ul className="b3-list">
          {attached.map((c, i) => (
            <li key={c.id} className="b3-list-item">
              {canManage && (
                <span className="b3-ordering">
                  <Button variant="ghost" size="sm" iconOnly disabled={busy || i === 0} onClick={() => handleMove(i, -1)} aria-label={`Move ${c.label} up`}>
                    <ArrowUpIcon />
                  </Button>
                  <Button variant="ghost" size="sm" iconOnly disabled={busy || i === attached.length - 1} onClick={() => handleMove(i, 1)} aria-label={`Move ${c.label} down`}>
                    <ArrowDownIcon />
                  </Button>
                </span>
              )}
              <span className="b3-list-main">
                <span className="b3-list-title">{c.label}</span>
                <span className="b3-list-sub">{c.field_type !== "boolean" ? `${c.terms.length} term${c.terms.length === 1 ? "" : "s"}` : "Yes/No"}</span>
              </span>
              {canManage && (
                <Button size="sm" disabled={busy} onClick={() => handleDetach(c.id)}>Detach</Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && available.length > 0 && pickerOpen ? (
        <div className="b3-row b3-row--end">
          <div className="b3-grow">
            <Field label="Category to attach">
              <Select value={toAttach} onChange={(e) => setToAttach(e.target.value)}>
                <option value="">Choose a category…</option>
                {available.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Button variant="primary" disabled={busy || !toAttach} onClick={handleAttach}>
            Attach
          </Button>
          <Button disabled={busy} onClick={() => { setPickerOpen(false); setToAttach(""); }}>
            Cancel
          </Button>
        </div>
      ) : null}
    </Section>
  );
}

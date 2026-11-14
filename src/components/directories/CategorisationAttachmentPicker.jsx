import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Button, Callout, Dialog, EmptyState, Field, GripIcon, Section, Select, SettingsLayout, Skeleton, SortableList, useConfirm, useToast,
} from "../ui/index.js";
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
 * @param {"section"|"page"} [layout] "page" renders the whole page (heading, subtitle, Attach in the page head); "section" is the map Filters panel.
 * @param {string} [editTermsHref] where "Edit terms" goes (the client's Categories page; there is no per-category route yet).
 */
export default function CategorisationAttachmentPicker({
  clientId, targetType, targetId, recordEvent, canManage = true, layout = "section", editTermsHref,
}) {
  const confirm = useConfirm();
  const { toast } = useToast();
  const [allCats, setAllCats] = useState([]);
  const [attached, setAttached] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toAttach, setToAttach] = useState("");
  const noun = targetType === "map" ? "map" : "directory";

  const refresh = useCallback(async () => {
    if (!clientId || !targetId) return;
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
    const cat = allCats.find((c) => c.id === toAttach);
    setBusy(true);
    try {
      await attachCategorisation({ categorisationId: toAttach, targetType, targetId });
      recordEvent?.(`${targetType}_categorisation_attached`, { categorisation_id: toAttach, target_id: targetId });
      setToAttach("");
      setDialogOpen(false);
      await refresh();
      toast(`${cat?.label ?? "Category"} attached. Drag it to change its position.`);
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDetach(c) {
    const ok = await confirm({
      title: `Detach ${c.label}?`,
      body: `Visitors won't be able to filter by ${c.label} on this ${noun} after you publish. Its terms stay on your entries and you can attach it again at any time.`,
      confirmLabel: "Detach category",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await detachCategorisation({ categorisationId: c.id, targetType, targetId });
      recordEvent?.(`${targetType}_categorisation_detached`, { categorisation_id: c.id, target_id: targetId });
      await refresh();
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  /** The filter rail renders in this order. Throws on failure so SortableList can put the order back. */
  async function handleReorder(next) {
    await reorderAttachedCategorisations({
      targetType,
      targetId,
      orderedCategorisationIds: next.map((c) => c.id),
    });
    recordEvent?.(`${targetType}_categorisation_reordered`, { target_id: targetId, order: next.map((c) => c.id) });
    setAttached(next);
  }

  const attachButton = canManage && available.length > 0 ? (
    <Button variant={layout === "page" ? "primary" : "default"} size={layout === "page" ? undefined : "sm"} onClick={() => setDialogOpen(true)}>
      Attach a category
    </Button>
  ) : null;

  const body = loading ? (
    <Skeleton variant="list" rows={2} label="Loading categories" />
  ) : (
    <>
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {attached.length === 0 ? (
        <EmptyState
          art="welcome"
          title="No categories attached"
          body={allCats.length === 0
            ? "No categories exist for this client yet. Create one in Categories."
            : `Attach a category to let visitors filter this ${noun} by its terms.`}
          actions={attachButton}
        />
      ) : (
        <>
          <SortableList
            items={attached}
            getId={(c) => c.id}
            getLabel={(c) => c.label}
            ariaLabel={`Categories, in filter order`}
            disabled={!canManage || busy}
            onReorder={handleReorder}
            getMeta={(c) => (c.field_type !== "boolean" ? `${c.terms.length} term${c.terms.length === 1 ? "" : "s"}` : "Yes/No")}
            renderActions={() => (editTermsHref ? <Link className="sortable-link" to={editTermsHref}>Edit terms</Link> : null)}
            getMenuItems={(c) => (canManage ? [{ label: "Detach", danger: true, onSelect: () => handleDetach(c) }] : [])}
          />
          {canManage ? (
            <p className="sortable-hint">
              <GripIcon />
              <span>Drag to reorder, or use the handle with Space and the arrow keys. Changes save straight away and go live when you publish.</span>
            </p>
          ) : null}
        </>
      )}

      {dialogOpen ? (
        <Dialog
          title="Attach a category"
          onClose={() => { setDialogOpen(false); setToAttach(""); }}
          footer={(
            <>
              <Button disabled={busy} onClick={() => { setDialogOpen(false); setToAttach(""); }}>Cancel</Button>
              <Button variant="primary" disabled={busy || !toAttach} onClick={handleAttach}>Attach</Button>
            </>
          )}
        >
          <Field label="Category to attach">
            <Select value={toAttach} onChange={(e) => setToAttach(e.target.value)} data-autofocus>
              <option value="">Choose a category…</option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </Select>
          </Field>
        </Dialog>
      ) : null}
    </>
  );

  if (layout === "page") {
    return (
      <SettingsLayout
        head={{
          title: "Categories",
          subtitle: `Filters visitors can use on this ${noun}, in the order they appear.`,
          actions: attachButton,
        }}
      >
        {body}
      </SettingsLayout>
    );
  }

  return (
    <Section
      title="Categories"
      description="Attach a category to use its terms as filters here. The same category can be attached to any number of maps and directories independently."
      actions={attachButton}
    >
      {body}
    </Section>
  );
}

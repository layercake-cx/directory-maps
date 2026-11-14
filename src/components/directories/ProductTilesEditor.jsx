import React, { useCallback, useEffect, useState } from "react";
import { createProductTile, deleteProductTile, listProductTiles } from "../../lib/productTiles";
import { Button, Callout, EmptyState, Field, FieldGrid, Skeleton, TextInput } from "../ui/index.js";
import "../../styles/wave-a/batch-3.css";

const emptyForm = { title: "", image_url: "", price: "", currency: "", rating: "", review_count: "", provider: "", destination_url: "" };

/** External booking/product tiles on an entry (build-scope §5.9). Manual entry only. */
export default function ProductTilesEditor({ directoryId, entryId, recordEvent }) {
  const [tiles, setTiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!entryId) return;
    try {
      setLoading(true);
      setTiles(await listProductTiles(entryId));
      setErr("");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [entryId]);

  useEffect(() => { void refresh(); }, [refresh]);

  function fSet(key, value) { setForm((f) => ({ ...f, [key]: value })); }

  async function save(e) {
    e.preventDefault();
    try {
      setSaving(true);
      setErr("");
      const tile = await createProductTile(entryId, form);
      recordEvent?.("directory_entry_product_tile_added", { directory_id: directoryId, entry_id: entryId, tile_id: tile.id, provider: tile.provider });
      setForm(emptyForm);
      setAddOpen(false);
      await refresh();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  async function remove(tile) {
    try {
      await deleteProductTile(tile.id);
      recordEvent?.("directory_entry_product_tile_removed", { directory_id: directoryId, entry_id: entryId, tile_id: tile.id });
      await refresh();
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }

  return (
    <div className="b3-stack">
      <div className="b3-row b3-row--between">
        <h3 className="b3-subhead">Product tiles</h3>
        <Button size="sm" onClick={() => setAddOpen((v) => !v)}>
          {addOpen ? "Cancel" : "Add tile"}
        </Button>
      </div>

      {err ? <Callout tone="danger">{err}</Callout> : null}

      {addOpen && (
        <form onSubmit={save} className="b3-form">
          <Field label="Title" required>
            <TextInput value={form.title} onChange={(e) => fSet("title", e.target.value)} />
          </Field>
          <Field label="Image URL" hint="Optional.">
            <TextInput type="url" value={form.image_url} onChange={(e) => fSet("image_url", e.target.value)} />
          </Field>
          <FieldGrid>
            <Field label="Price">
              <TextInput inputMode="decimal" value={form.price} onChange={(e) => fSet("price", e.target.value)} />
            </Field>
            <Field label="Currency" hint="For example GBP.">
              <TextInput value={form.currency} onChange={(e) => fSet("currency", e.target.value)} />
            </Field>
          </FieldGrid>
          <FieldGrid>
            <Field label="Rating" hint="From 0 to 5.">
              <TextInput inputMode="decimal" value={form.rating} onChange={(e) => fSet("rating", e.target.value)} />
            </Field>
            <Field label="Review count">
              <TextInput inputMode="numeric" value={form.review_count} onChange={(e) => fSet("review_count", e.target.value)} />
            </Field>
          </FieldGrid>
          <Field label="Provider" hint="For example Viator. Optional.">
            <TextInput value={form.provider} onChange={(e) => fSet("provider", e.target.value)} />
          </Field>
          <Field label="Destination URL" hint="The booking link." required>
            <TextInput type="url" value={form.destination_url} onChange={(e) => fSet("destination_url", e.target.value)} />
          </Field>
          <div className="b3-form-actions">
            <Button type="submit" variant="primary" loading={saving} loadingLabel="Saving…">Add tile</Button>
          </div>
        </form>
      )}

      {loading ? (
        <Skeleton variant="list" rows={2} label="Loading product tiles" />
      ) : tiles.length === 0 ? (
        <EmptyState art="none" title="No product tiles yet" body="Add a booking or product link to show it on this entry." />
      ) : (
        <ul className="b3-list">
          {tiles.map((t) => (
            <li key={t.id} className="b3-list-item">
              <div className="b3-list-main">
                <div className="b3-list-title">
                  {t.title} {t.provider && <span className="b3-muted">via {t.provider}</span>}
                </div>
                <div className="b3-list-sub">
                  {t.price != null && `${t.currency || ""} ${t.price}`.trim()}
                  {t.rating != null && ` · ${t.rating} stars${t.review_count != null ? ` (${t.review_count})` : ""}`}
                </div>
              </div>
              <Button variant="danger" size="sm" aria-label={`Delete tile: ${t.title}`} onClick={() => remove(t)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

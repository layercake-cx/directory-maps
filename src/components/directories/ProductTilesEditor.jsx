import React, { useCallback, useEffect, useState } from "react";
import { createProductTile, deleteProductTile, listProductTiles } from "../../lib/productTiles";

const emptyForm = { title: "", image_url: "", price: "", currency: "", rating: "", review_count: "", provider: "", destination_url: "" };
const inputStyle = { width: "100%", boxSizing: "border-box", padding: "6px 9px", borderRadius: 7, border: "1px solid var(--lc-border)", fontSize: 13 };

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
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Product tiles</p>
        <button type="button" className="btn" style={{ fontSize: 12, padding: "3px 10px" }} onClick={() => setAddOpen((v) => !v)}>
          {addOpen ? "Cancel" : "+ Add tile"}
        </button>
      </div>

      {err && <p style={{ color: "#b91c1c", fontSize: 12, margin: "0 0 8px" }}>{err}</p>}

      {addOpen && (
        <form onSubmit={save} style={{ display: "grid", gap: 8, marginBottom: 12, padding: 12, background: "#f9fafb", border: "1px solid var(--lc-border)", borderRadius: 8 }}>
          <input value={form.title} onChange={(e) => fSet("title", e.target.value)} placeholder="Title" style={inputStyle} required />
          <input value={form.image_url} onChange={(e) => fSet("image_url", e.target.value)} placeholder="Image URL (optional)" type="url" style={inputStyle} />
          <div style={{ display: "flex", gap: 8 }}>
            <input value={form.price} onChange={(e) => fSet("price", e.target.value)} placeholder="Price" inputMode="decimal" style={inputStyle} />
            <input value={form.currency} onChange={(e) => fSet("currency", e.target.value)} placeholder="Currency, e.g. GBP" style={inputStyle} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={form.rating} onChange={(e) => fSet("rating", e.target.value)} placeholder="Rating (0–5)" inputMode="decimal" style={inputStyle} />
            <input value={form.review_count} onChange={(e) => fSet("review_count", e.target.value)} placeholder="Review count" inputMode="numeric" style={inputStyle} />
          </div>
          <input value={form.provider} onChange={(e) => fSet("provider", e.target.value)} placeholder="Provider, e.g. Viator (optional)" style={inputStyle} />
          <input value={form.destination_url} onChange={(e) => fSet("destination_url", e.target.value)} placeholder="Destination URL (booking link)" type="url" style={inputStyle} required />
          <div>
            <button type="submit" className="btn btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} disabled={saving}>
              {saving ? "Saving…" : "Add tile"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p style={{ fontSize: 13, opacity: 0.6 }}>Loading…</p>
      ) : tiles.length === 0 ? (
        <p style={{ fontSize: 13, opacity: 0.6 }}>No product tiles yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {tiles.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 10px", border: "1px solid var(--lc-border)", borderRadius: 7 }}>
              <div style={{ fontSize: 12 }}>
                <div style={{ fontWeight: 500 }}>
                  {t.title} {t.provider && <span style={{ opacity: 0.6, fontWeight: 400 }}>via {t.provider}</span>}
                </div>
                <div style={{ opacity: 0.7 }}>
                  {t.price != null && `${t.currency || ""} ${t.price}`.trim()}
                  {t.rating != null && ` · ${t.rating}★${t.review_count != null ? ` (${t.review_count})` : ""}`}
                </div>
              </div>
              <button type="button" className="btn" style={{ fontSize: 12, padding: "3px 8px", color: "#b91c1c", flexShrink: 0 }} onClick={() => remove(t)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

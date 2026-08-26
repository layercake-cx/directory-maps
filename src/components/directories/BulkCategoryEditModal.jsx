import React, { useMemo, useState } from "react";
import { applyBulkEntryTerms } from "../../lib/categorisations.js";

/**
 * Bulk-apply one categorisation's term(s) to a set of selected directory
 * entries — DIR-E1-S4, modelled on BulkFilterEditModal.jsx's add/replace shape.
 */
export default function BulkCategoryEditModal({ categorisations, entryIds, onClose, onApplied, recordEvent, directoryId }) {
  const taggable = useMemo(() => (categorisations || []).filter((c) => c.is_active), [categorisations]);
  const [categorisationId, setCategorisationId] = useState(taggable[0]?.id || "");
  const [termIds, setTermIds] = useState(() => new Set());
  const [mode, setMode] = useState("add"); // "add" | "replace"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const categorisation = taggable.find((c) => c.id === categorisationId) || null;
  const count = entryIds?.length || 0;

  function toggleTerm(id) {
    setTermIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function apply() {
    if (!categorisation) return;
    setBusy(true);
    setError("");
    try {
      const ids = [...termIds];
      await applyBulkEntryTerms({ entryIds, categorisationId: categorisation.id, termIds: ids, mode });
      recordEvent?.("directory_entry_bulk_tagged", {
        directory_id: directoryId,
        categorisation_id: categorisation.id,
        entry_count: count,
        term_count: ids.length,
        mode,
      });
      onApplied?.(count);
      onClose();
    } catch (e) {
      setError(e.message || "Failed to apply");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", padding: 16 }} onClick={onClose}>
      <div className="admin-card" style={{ padding: 24, maxWidth: 460, width: "100%", boxShadow: "0 8px 40px rgba(0,0,0,0.22)" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>Bulk tag entries</h3>
        <p style={{ margin: "0 0 14px", fontSize: 13, opacity: 0.75 }}>Apply a categorisation term to {count} selected entr{count === 1 ? "y" : "ies"}.</p>

        {taggable.length === 0 ? (
          <p style={{ fontSize: 13 }}>No categorisations apply to entries yet. Create one in Categorisations first.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ fontSize: 13 }}>
              <span style={{ display: "block", marginBottom: 4, opacity: 0.8 }}>Categorisation</span>
              <select value={categorisationId} onChange={(e) => { setCategorisationId(e.target.value); setTermIds(new Set()); }} style={{ width: "100%" }}>
                {taggable.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>

            {categorisation && (
              <div style={{ fontSize: 13 }}>
                <span style={{ display: "block", marginBottom: 4, opacity: 0.8 }}>Term(s)</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {(categorisation.terms || []).map((t) => (
                    <label key={t.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input type="checkbox" checked={termIds.has(t.id)} onChange={() => toggleTerm(t.id)} />
                      {t.label}
                    </label>
                  ))}
                  {(categorisation.terms || []).length === 0 && <span style={{ opacity: 0.6 }}>No terms defined yet.</span>}
                </div>
              </div>
            )}

            <label style={{ fontSize: 13 }}>
              <span style={{ display: "block", marginBottom: 4, opacity: 0.8 }}>Mode</span>
              <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ width: "100%" }}>
                <option value="add">Add to existing tags</option>
                <option value="replace">Replace this categorisation's tags</option>
              </select>
            </label>

            {error && <p style={{ color: "#b91c1c", margin: 0, fontSize: 13 }}>{error}</p>}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={apply} disabled={busy || !categorisation || (mode === "add" && termIds.size === 0)}>
                {busy ? "Applying…" : `Apply to ${count}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

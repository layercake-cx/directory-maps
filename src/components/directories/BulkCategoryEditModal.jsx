import React, { useMemo, useState } from "react";
import { applyBulkEntryTerms } from "../../lib/categorisations.js";
import { Button, Callout, Checkbox, Dialog, Field, Select } from "../ui/index.js";
import "../../styles/wave-a/batch-2.css";

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
  // Single-select and boolean facets have exactly one active value per
  // entry — "add to existing tags" doesn't make sense for them, so bulk
  // apply always replaces this categorisation's value on the selected entries.
  const forcedReplace = categorisation && categorisation.field_type !== "multi_select";
  const effectiveMode = forcedReplace ? "replace" : mode;

  function toggleTerm(id) {
    setTermIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function setSingleTerm(id) {
    setTermIds(id ? new Set([id]) : new Set());
  }

  async function apply() {
    if (!categorisation) return;
    setBusy(true);
    setError("");
    try {
      const ids = [...termIds];
      await applyBulkEntryTerms({ entryIds, categorisationId: categorisation.id, termIds: ids, mode: effectiveMode });
      recordEvent?.("directory_entry_bulk_tagged", {
        directory_id: directoryId,
        categorisation_id: categorisation.id,
        entry_count: count,
        term_count: ids.length,
        mode: effectiveMode,
      });
      onApplied?.(count);
      onClose();
    } catch (e) {
      setError(e.message || "Failed to apply");
    } finally {
      setBusy(false);
    }
  }

  const footer = taggable.length === 0 ? (
    <Button onClick={onClose}>Close</Button>
  ) : (
    <>
      <Button onClick={onClose} disabled={busy}>Cancel</Button>
      <Button
        variant="primary"
        onClick={apply}
        loading={busy}
        loadingLabel="Applying…"
        disabled={!categorisation || (effectiveMode === "add" && termIds.size === 0)}
      >
        {`Apply to ${count}`}
      </Button>
    </>
  );

  return (
    <Dialog title="Bulk tag entries" onClose={onClose} footer={footer}>
      <div className="bulk-tag-form">
        <p className="bulk-tag-count">Apply a category term to {count} selected entr{count === 1 ? "y" : "ies"}.</p>

        {taggable.length === 0 ? (
          <p>No categories apply to entries yet. Create one in Categories first.</p>
        ) : (
          <>
            <Field label="Category">
              <Select value={categorisationId} onChange={(e) => { setCategorisationId(e.target.value); setTermIds(new Set()); }}>
                {taggable.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
            </Field>

            {categorisation && categorisation.field_type === "boolean" && (
              <fieldset className="choice-group">
                <legend className="field-label">Set to</legend>
                <div className="choice-row">
                  <label className="check">
                    <input type="radio" name="bulk-bool" checked={termIds.size > 0} onChange={() => setSingleTerm(categorisation.terms?.[0]?.id)} />
                    <span className="check-text"><span className="check-label">Yes</span></span>
                  </label>
                  <label className="check">
                    <input type="radio" name="bulk-bool" checked={termIds.size === 0} onChange={() => setSingleTerm(null)} />
                    <span className="check-text"><span className="check-label">No</span></span>
                  </label>
                </div>
              </fieldset>
            )}

            {categorisation && categorisation.field_type === "single_select" && (
              <fieldset className="choice-group">
                <legend className="field-label">Set to</legend>
                <div className="choice-row">
                  <label className="check">
                    <input type="radio" name="bulk-single" checked={termIds.size === 0} onChange={() => setSingleTerm(null)} />
                    <span className="check-text"><span className="check-label">Clear</span></span>
                  </label>
                  {(categorisation.terms || []).map((t) => (
                    <label key={t.id} className="check">
                      <input type="radio" name="bulk-single" checked={termIds.has(t.id)} onChange={() => setSingleTerm(t.id)} />
                      <span className="check-text"><span className="check-label">{t.label}</span></span>
                    </label>
                  ))}
                  {(categorisation.terms || []).length === 0 && <span className="entries-muted">No terms defined yet.</span>}
                </div>
              </fieldset>
            )}

            {categorisation && categorisation.field_type === "multi_select" && (
              <fieldset className="choice-group">
                <legend className="field-label">Term(s)</legend>
                <div className="choice-row">
                  {(categorisation.terms || []).map((t) => (
                    <Checkbox key={t.id} label={t.label} checked={termIds.has(t.id)} onChange={() => toggleTerm(t.id)} />
                  ))}
                  {(categorisation.terms || []).length === 0 && <span className="entries-muted">No terms defined yet.</span>}
                </div>
              </fieldset>
            )}

            {!forcedReplace && (
              <Field label="Mode">
                <Select value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="add">Add to existing tags</option>
                  <option value="replace">Replace this category's tags</option>
                </Select>
              </Field>
            )}

            {error && <Callout tone="danger">{error}</Callout>}
          </>
        )}
      </div>
    </Dialog>
  );
}

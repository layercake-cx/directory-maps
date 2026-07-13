import React, { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { loadFilterFields, loadListingFilterValues, saveListingFieldValue, isSelectType } from "../lib/filterFields.js";

/**
 * Editor for a single listing's custom filter values. Renders one control per
 * active filter field (dropdown / checkboxes / text). Ref-based: the parent
 * calls `persist(listingId)` after the listing row is saved (so new listings
 * get their generated id).
 *
 * Used inside the manual-entry modal in ClientMapData and AdminMapData.
 */
const ListingFilterValuesEditor = forwardRef(function ListingFilterValuesEditor({ mapId, listingId }, ref) {
  const [fields, setFields] = useState([]);
  const [selections, setSelections] = useState({}); // fieldId -> { optionIds:Set, text:string }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!mapId) { setLoading(false); return; }
      setLoading(true);
      try {
        const active = await loadFilterFields(mapId, { includeArchived: false });
        const init = {};
        active.forEach((f) => { init[f.id] = { optionIds: new Set(), text: "" }; });
        if (listingId) {
          const values = await loadListingFilterValues(listingId);
          values.forEach((v) => {
            if (!init[v.field_id]) return;
            if (v.option_id) init[v.field_id].optionIds.add(v.option_id);
            if (v.value_text) init[v.field_id].text = v.value_text;
          });
        }
        if (alive) { setFields(active); setSelections(init); }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [mapId, listingId]);

  useImperativeHandle(ref, () => ({
    async persist(idToUse) {
      const targetId = idToUse || listingId;
      if (!targetId) return;
      for (const f of fields) {
        const sel = selections[f.id] || {};
        if (f.field_type === "text") {
          await saveListingFieldValue(targetId, f, { text: sel.text || "" });
        } else {
          await saveListingFieldValue(targetId, f, { optionIds: [...(sel.optionIds || [])] });
        }
      }
    },
  }), [fields, selections, listingId]);

  if (loading || fields.length === 0) return null;

  function setSingle(fieldId, optionId) {
    setSelections((prev) => ({ ...prev, [fieldId]: { ...prev[fieldId], optionIds: optionId ? new Set([optionId]) : new Set() } }));
  }
  function toggleMulti(fieldId, optionId) {
    setSelections((prev) => {
      const cur = new Set(prev[fieldId]?.optionIds || []);
      if (cur.has(optionId)) cur.delete(optionId); else cur.add(optionId);
      return { ...prev, [fieldId]: { ...prev[fieldId], optionIds: cur } };
    });
  }
  function setText(fieldId, text) {
    setSelections((prev) => ({ ...prev, [fieldId]: { ...prev[fieldId], text } }));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Filters</p>
      {fields.map((f) => {
        const sel = selections[f.id] || { optionIds: new Set(), text: "" };
        if (f.field_type === "text") {
          return (
            <label key={f.id} style={{ fontSize: 13 }}>
              <span style={{ display: "block", marginBottom: 4, opacity: 0.8 }}>{f.label}</span>
              <input value={sel.text || ""} onChange={(e) => setText(f.id, e.target.value)} style={{ width: "100%", boxSizing: "border-box" }} />
            </label>
          );
        }
        if (f.field_type === "single_select") {
          const current = sel.optionIds && sel.optionIds.size > 0 ? [...sel.optionIds][0] : "";
          return (
            <label key={f.id} style={{ fontSize: 13 }}>
              <span style={{ display: "block", marginBottom: 4, opacity: 0.8 }}>{f.label}</span>
              <select value={current} onChange={(e) => setSingle(f.id, e.target.value)} style={{ width: "100%" }}>
                <option value="">—</option>
                {(f.options || []).map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </label>
          );
        }
        // multi_select
        return (
          <div key={f.id} style={{ fontSize: 13 }}>
            <span style={{ display: "block", marginBottom: 4, opacity: 0.8 }}>{f.label}</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {(f.options || []).map((o) => (
                <label key={o.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" checked={!!sel.optionIds?.has(o.id)} onChange={() => toggleMulti(f.id, o.id)} />
                  {o.label}
                </label>
              ))}
              {isSelectType(f.field_type) && (f.options || []).length === 0 && (
                <span style={{ opacity: 0.6 }}>No options defined.</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});

export default ListingFilterValuesEditor;

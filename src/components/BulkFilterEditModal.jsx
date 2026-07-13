import React, { useMemo, useState } from "react";
import { isSelectType, applyBulkFilterValue } from "../lib/filterFields.js";

/**
 * Bulk-apply one filter field's option(s) to a set of selected listings.
 * Only select-type fields are offered (free-text isn't meaningful in bulk).
 */
export default function BulkFilterEditModal({ mapId, fields, listingIds, onClose, onApplied, recordEvent, clientId }) {
  const selectFields = useMemo(() => (fields || []).filter((f) => f.is_active && isSelectType(f.field_type)), [fields]);
  const [fieldId, setFieldId] = useState(selectFields[0]?.id || "");
  const [optionIds, setOptionIds] = useState(() => new Set());
  const [mode, setMode] = useState("add"); // "add" | "replace"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const field = selectFields.find((f) => f.id === fieldId) || null;
  const count = listingIds?.length || 0;

  function toggleOption(id) {
    setOptionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function apply() {
    if (!field) return;
    setBusy(true);
    setError("");
    try {
      const ids = [...optionIds];
      await applyBulkFilterValue({ listingIds, field, optionIds: ids, mode });
      if (typeof recordEvent === "function") {
        recordEvent("data_filter_values_bulk_tagged", {
          client_id: clientId ?? null,
          map_id: mapId,
          field_id: field.id,
          field_key: field.key,
          listing_count: count,
          option_count: ids.length,
          mode,
        });
      }
      if (typeof onApplied === "function") onApplied(count);
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
        <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>Bulk edit filters</h3>
        <p style={{ margin: "0 0 14px", fontSize: 13, opacity: 0.75 }}>Apply a filter value to {count} selected listing{count === 1 ? "" : "s"}.</p>

        {selectFields.length === 0 ? (
          <p style={{ fontSize: 13 }}>No selectable filter fields on this map. Create a single- or multiple-choice field in the Filters panel first.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ fontSize: 13 }}>
              <span style={{ display: "block", marginBottom: 4, opacity: 0.8 }}>Field</span>
              <select value={fieldId} onChange={(e) => { setFieldId(e.target.value); setOptionIds(new Set()); }} style={{ width: "100%" }}>
                {selectFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </label>

            {field && (
              <div style={{ fontSize: 13 }}>
                <span style={{ display: "block", marginBottom: 4, opacity: 0.8 }}>Value{field.field_type === "multi_select" ? "s" : ""}</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {(field.options || []).map((o) => (
                    <label key={o.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        type={field.field_type === "single_select" ? "radio" : "checkbox"}
                        name="bulkOption"
                        checked={optionIds.has(o.id)}
                        onChange={() => {
                          if (field.field_type === "single_select") setOptionIds(new Set([o.id]));
                          else toggleOption(o.id);
                        }}
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <label style={{ fontSize: 13 }}>
              <span style={{ display: "block", marginBottom: 4, opacity: 0.8 }}>Mode</span>
              <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ width: "100%" }}>
                <option value="add">Add to existing values</option>
                <option value="replace">Replace existing values for this field</option>
              </select>
            </label>

            {error && <p style={{ color: "#b91c1c", margin: 0, fontSize: 13 }}>{error}</p>}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={apply} disabled={busy || !field || (mode === "add" && optionIds.size === 0)}>
                {busy ? "Applying…" : `Apply to ${count}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

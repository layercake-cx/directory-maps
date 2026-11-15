import React, { useMemo, useState } from "react";
import { Button, Callout, Checkbox, Dialog, Field, Select } from "./ui/index.js";
import "../styles/wave-b/map-pages.css";
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
    <Dialog
      title="Bulk edit filters"
      onClose={onClose}
      footer={selectFields.length === 0 ? (
        <Button onClick={onClose}>Close</Button>
      ) : (
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            variant="primary"
            onClick={apply}
            loading={busy}
            loadingLabel="Applying…"
            disabled={!field || (mode === "add" && optionIds.size === 0)}
          >
            {`Apply to ${count}`}
          </Button>
        </>
      )}
    >
      <div className="mp-stack">
        <p className="mp-note">Apply a filter value to {count} selected listing{count === 1 ? "" : "s"}.</p>

        {selectFields.length === 0 ? (
          <p className="mp-note">No selectable filter fields on this map. Create a single- or multiple-choice field in the Filters panel first.</p>
        ) : (
          <>
            <Field label="Field">
              <Select value={fieldId} onChange={(e) => { setFieldId(e.target.value); setOptionIds(new Set()); }}>
                {selectFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </Select>
            </Field>

            {field && (
              <fieldset className="choice-group">
                <legend className="field-label">Value{field.field_type === "multi_select" ? "s" : ""}</legend>
                <div className="mp-choice-row">
                  {(field.options || []).map((o) => (
                    <Checkbox
                      key={o.id}
                      type={field.field_type === "single_select" ? "radio" : "checkbox"}
                      name="bulkOption"
                      label={o.label}
                      checked={optionIds.has(o.id)}
                      onChange={() => {
                        if (field.field_type === "single_select") setOptionIds(new Set([o.id]));
                        else toggleOption(o.id);
                      }}
                    />
                  ))}
                </div>
              </fieldset>
            )}

            <Field label="Mode">
              <Select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="add">Add to existing values</option>
                <option value="replace">Replace existing values for this field</option>
              </Select>
            </Field>

            {error ? <Callout tone="danger">{error}</Callout> : null}
          </>
        )}
      </div>
    </Dialog>
  );
}

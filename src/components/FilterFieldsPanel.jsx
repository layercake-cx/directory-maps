import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FIELD_TYPES,
  DISPLAY_CONTROLS,
  allowedControlsForType,
  defaultControlForType,
  isSelectType,
  slugifyKey,
  loadFilterFields,
  createFilterField,
  updateFilterField,
  setFieldActive,
  deleteFilterFieldPermanently,
  reorderFilterFields,
  replaceFieldOptions,
  countListingsUsingOption,
} from "../lib/filterFields.js";

const DEFAULT_OPTION_COLOR = "#4A9BAA";

function MiniColorRow({ value, onChange, ariaLabel }) {
  const v = value || DEFAULT_OPTION_COLOR;
  return (
    <div className="color-row" style={{ width: 128 }}>
      <label className="color-swatch" title="Click to pick colour">
        <span className="color-swatch__fill" style={{ background: v }} />
        <input type="color" value={v} onChange={(e) => onChange(e.target.value)} className="color-swatch__input" aria-label={ariaLabel} />
      </label>
      <input type="text" value={v} onChange={(e) => onChange(e.target.value)} className="color-hex-input" aria-label={`${ariaLabel} hex`} />
    </div>
  );
}

function typeLabel(id) {
  return FIELD_TYPES.find((t) => t.id === id)?.label ?? id;
}

const emptyForm = {
  id: null,
  label: "",
  key: "",
  keyTouched: false,
  fieldType: "single_select",
  displayControl: "dropdown",
  options: [],
  originalFieldType: null,
  hasValues: false,
};

/**
 * Self-contained "Filters" panel — field definitions, options, archive/delete,
 * plus the viewer-facing display controls (show in filter bar / control type).
 * Used by both ClientMapDashboard and AdminMapDashboard.
 */
export default function FilterFieldsPanel({ mapId, recordEvent, onChange, clientId }) {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState(null); // null = list view
  const [confirmDelete, setConfirmDelete] = useState(null); // { field, text }

  const emit = useCallback((eventType, meta) => {
    if (typeof recordEvent === "function") recordEvent(eventType, { client_id: clientId ?? null, map_id: mapId, ...meta });
  }, [recordEvent, clientId, mapId]);

  const refresh = useCallback(async () => {
    if (!mapId) return;
    setLoading(true);
    try {
      const rows = await loadFilterFields(mapId, { includeArchived: true });
      setFields(rows);
      setError("");
    } catch (e) {
      setError(e.message || "Failed to load filter fields");
    } finally {
      setLoading(false);
    }
  }, [mapId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const notifyChanged = useCallback(async () => {
    await refresh();
    if (typeof onChange === "function") onChange();
  }, [refresh, onChange]);

  const visibleFields = useMemo(
    () => fields.filter((f) => (showArchived ? true : f.is_active)),
    [fields, showArchived]
  );
  const activeFields = useMemo(() => fields.filter((f) => f.is_active), [fields]);

  // ---- form helpers ----
  function openCreate() {
    setForm({ ...emptyForm, options: [] });
  }
  function openEdit(field) {
    setForm({
      id: field.id,
      label: field.label,
      key: field.key,
      keyTouched: true,
      fieldType: field.field_type,
      displayControl: field.display_control,
      options: (field.options || []).map((o) => ({ id: o.id, label: o.label, value: o.value, color: o.color || "" })),
      originalFieldType: field.field_type,
      hasValues: false,
    });
  }
  function closeForm() { setForm(null); }

  function setFormLabel(label) {
    setForm((f) => ({
      ...f,
      label,
      key: f.keyTouched ? f.key : slugifyKey(label),
    }));
  }
  function setFormType(fieldType) {
    setForm((f) => ({
      ...f,
      fieldType,
      displayControl: allowedControlsForType(fieldType).includes(f.displayControl)
        ? f.displayControl
        : defaultControlForType(fieldType),
    }));
  }
  function addOption() {
    setForm((f) => ({ ...f, options: [...f.options, { id: null, label: "", value: "", color: "" }] }));
  }
  function updateOption(index, patch) {
    setForm((f) => ({ ...f, options: f.options.map((o, i) => (i === index ? { ...o, ...patch } : o)) }));
  }
  function removeOptionRow(index) {
    setForm((f) => ({ ...f, options: f.options.filter((_, i) => i !== index) }));
  }
  function moveOption(index, dir) {
    setForm((f) => {
      const arr = f.options.slice();
      const j = index + dir;
      if (j < 0 || j >= arr.length) return f;
      [arr[index], arr[j]] = [arr[j], arr[index]];
      return { ...f, options: arr };
    });
  }

  const keyConflict = useMemo(() => {
    if (!form) return false;
    const k = (form.key || "").trim();
    if (!k) return false;
    return fields.some((f) => f.key === k && f.id !== form.id);
  }, [form, fields]);

  const canSave = useMemo(() => {
    if (!form) return false;
    if (!form.label.trim()) return false;
    if (!(form.key || "").trim() || keyConflict) return false;
    if (isSelectType(form.fieldType)) {
      const valid = form.options.filter((o) => o.label.trim());
      if (valid.length === 0) return false;
    }
    return true;
  }, [form, keyConflict]);

  async function saveForm() {
    if (!form || !canSave) return;
    setBusy(true);
    setError("");
    try {
      const cleanOptions = form.options
        .filter((o) => o.label.trim())
        .map((o) => ({ id: o.id, label: o.label.trim(), value: o.value, color: o.color || null }));

      if (form.id) {
        await updateFilterField(form.id, {
          label: form.label.trim(),
          key: form.key.trim(),
          field_type: form.fieldType,
          display_control: form.displayControl,
        });
        if (isSelectType(form.fieldType)) {
          await replaceFieldOptions(form.id, cleanOptions);
        } else {
          await replaceFieldOptions(form.id, []); // text: drop any stale options
        }
        emit("map_design_filter_field_updated", { field_id: form.id, key: form.key.trim(), field_type: form.fieldType });
      } else {
        const field = await createFilterField({
          mapId,
          label: form.label.trim(),
          key: form.key.trim(),
          fieldType: form.fieldType,
          displayControl: form.displayControl,
          options: cleanOptions,
        });
        emit("map_design_filter_field_created", { field_id: field?.id, key: form.key.trim(), field_type: form.fieldType });
      }
      closeForm();
      await notifyChanged();
    } catch (e) {
      setError(e.message || "Failed to save filter field");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(field) {
    setBusy(true);
    try {
      await setFieldActive(field.id, !field.is_active);
      emit(field.is_active ? "map_design_filter_field_archived" : "map_design_filter_field_updated", {
        field_id: field.id,
        key: field.key,
      });
      await notifyChanged();
    } catch (e) {
      setError(e.message || "Failed to update field");
    } finally {
      setBusy(false);
    }
  }

  async function toggleFilterBar(field) {
    setBusy(true);
    try {
      await updateFilterField(field.id, { show_in_filter_bar: !field.show_in_filter_bar });
      emit("map_design_filter_field_updated", { field_id: field.id, key: field.key, changed_fields: ["show_in_filter_bar"] });
      await notifyChanged();
    } catch (e) {
      setError(e.message || "Failed to update field");
    } finally {
      setBusy(false);
    }
  }

  async function changeControl(field, control) {
    setBusy(true);
    try {
      await updateFilterField(field.id, { display_control: control });
      emit("map_design_filter_field_updated", { field_id: field.id, key: field.key, changed_fields: ["display_control"] });
      await notifyChanged();
    } catch (e) {
      setError(e.message || "Failed to update field");
    } finally {
      setBusy(false);
    }
  }

  async function move(field, dir) {
    const ordered = activeFields.slice();
    const index = ordered.findIndex((f) => f.id === field.id);
    const j = index + dir;
    if (index < 0 || j < 0 || j >= ordered.length) return;
    [ordered[index], ordered[j]] = [ordered[j], ordered[index]];
    setBusy(true);
    try {
      await reorderFilterFields(ordered.map((f) => f.id));
      emit("map_design_filter_field_reordered", { order: ordered.map((f) => f.id) });
      await notifyChanged();
    } catch (e) {
      setError(e.message || "Failed to reorder");
    } finally {
      setBusy(false);
    }
  }

  async function doPermanentDelete() {
    if (!confirmDelete?.field) return;
    setBusy(true);
    try {
      await deleteFilterFieldPermanently(confirmDelete.field.id);
      emit("map_design_filter_field_deleted", { field_id: confirmDelete.field.id, key: confirmDelete.field.key });
      setConfirmDelete(null);
      await notifyChanged();
    } catch (e) {
      setError(e.message || "Failed to delete");
    } finally {
      setBusy(false);
    }
  }

  // ---------- render ----------
  if (loading) return <p style={{ margin: 0, opacity: 0.7 }}>Loading filters…</p>;

  if (form) {
    const controls = allowedControlsForType(form.fieldType);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error && <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p>}
        <div className="panel-section">
          <p className="panel-section__title">{form.id ? "Edit filter field" : "New filter field"}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ fontSize: 13 }}>
              <span style={{ display: "block", marginBottom: 4, opacity: 0.8 }}>Label</span>
              <input value={form.label} onChange={(e) => setFormLabel(e.target.value)} placeholder="e.g. Sector" style={{ width: "100%", boxSizing: "border-box" }} />
            </label>
            <label style={{ fontSize: 13 }}>
              <span style={{ display: "block", marginBottom: 4, opacity: 0.8 }}>Key (used in CSV/Sheet columns as <code>filter_{form.key || "key"}</code>)</span>
              <input
                value={form.key}
                onChange={(e) => setForm((f) => ({ ...f, key: slugifyKey(e.target.value), keyTouched: true }))}
                placeholder="sector"
                style={{ width: "100%", boxSizing: "border-box" }}
              />
              {keyConflict && <span style={{ color: "#b91c1c", fontSize: 12 }}>Another field already uses this key.</span>}
            </label>
          </div>
        </div>

        <div className="panel-section">
          <p className="panel-section__title">Type</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {FIELD_TYPES.map((t) => (
              <label key={t.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
                <input
                  type="radio"
                  name="filterFieldType"
                  checked={form.fieldType === t.id}
                  disabled={!!form.id && form.originalFieldType && form.originalFieldType !== t.id}
                  onChange={() => setFormType(t.id)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <strong>{t.label}</strong>
                  <span style={{ display: "block", opacity: 0.7 }}>{t.hint}</span>
                </span>
              </label>
            ))}
            {form.id && (
              <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>
                Field type can't be changed after creation (it would orphan existing tags). Delete and recreate the field to change it.
              </p>
            )}
          </div>
        </div>

        {isSelectType(form.fieldType) && (
          <div className="panel-section">
            <p className="panel-section__title">Options</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {form.options.map((o, i) => (
                <div key={o.id || `new-${i}`} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ display: "flex", flexDirection: "column" }}>
                    <button type="button" className="btn" style={{ padding: "0 6px", lineHeight: 1.2 }} onClick={() => moveOption(i, -1)} disabled={i === 0} aria-label="Move up">▲</button>
                    <button type="button" className="btn" style={{ padding: "0 6px", lineHeight: 1.2 }} onClick={() => moveOption(i, 1)} disabled={i === form.options.length - 1} aria-label="Move down">▼</button>
                  </span>
                  <input
                    value={o.label}
                    onChange={(e) => updateOption(i, { label: e.target.value })}
                    placeholder="Option label"
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <MiniColorRow value={o.color} onChange={(v) => updateOption(i, { color: v })} ariaLabel={`${o.label || "option"} colour`} />
                  <button type="button" className="btn" onClick={() => removeOptionRow(i)} aria-label="Remove option">×</button>
                </div>
              ))}
              <div>
                <button type="button" className="btn" onClick={addOption}>+ Add option</button>
              </div>
            </div>
          </div>
        )}

        {form.fieldType === "text" && (
          <p style={{ margin: 0, fontSize: 12, opacity: 0.75 }}>
            Free-text fields have no option list. Viewers filter them with a type-to-search box (typeahead).
          </p>
        )}

        <div className="panel-section">
          <p className="panel-section__title">Display in search bar</p>
          <label style={{ fontSize: 13 }}>
            <span style={{ display: "block", marginBottom: 4, opacity: 0.8 }}>Control</span>
            <select value={form.displayControl} onChange={(e) => setForm((f) => ({ ...f, displayControl: e.target.value }))} style={{ width: "100%" }}>
              {DISPLAY_CONTROLS.map((c) => (
                <option key={c.id} value={c.id} disabled={!controls.includes(c.id)}>
                  {c.label}{!controls.includes(c.id) ? " (not available for this type)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-primary" onClick={saveForm} disabled={!canSave || busy}>
            {busy ? "Saving…" : form.id ? "Save changes" : "Create field"}
          </button>
          <button type="button" className="btn" onClick={closeForm} disabled={busy}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {error && <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p>}
      <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>
        Filter fields are custom, filterable metadata for this map (e.g. Sector, Languages spoken) — separate from Groups.
        Turn on "Show in search bar" and Publish to make a field visible to viewers.
      </p>

      {visibleFields.length === 0 ? (
        <div className="panel-section" style={{ textAlign: "center" }}>
          <p style={{ margin: "0 0 10px", opacity: 0.8 }}>No filter fields yet.</p>
          <button type="button" className="btn btn-primary" onClick={openCreate}>Create your first filter field</button>
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {visibleFields.map((f) => {
            const controls = allowedControlsForType(f.field_type);
            return (
              <li key={f.id} style={{ padding: "10px 12px", background: "var(--lc-card)", border: "1px solid var(--lc-border)", borderRadius: 10, opacity: f.is_active ? 1 : 0.6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {f.is_active && (
                    <span style={{ display: "flex", flexDirection: "column" }}>
                      <button type="button" className="btn" style={{ padding: "0 6px", lineHeight: 1.2 }} onClick={() => move(f, -1)} disabled={busy} aria-label="Move up">▲</button>
                      <button type="button" className="btn" style={{ padding: "0 6px", lineHeight: 1.2 }} onClick={() => move(f, 1)} disabled={busy} aria-label="Move down">▼</button>
                    </span>
                  )}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{f.label}</span>
                    <span style={{ display: "block", fontSize: 12, opacity: 0.7 }}>
                      {typeLabel(f.field_type)}
                      {isSelectType(f.field_type) ? ` · ${f.options.length} option${f.options.length === 1 ? "" : "s"}` : ""}
                      {!f.is_active ? " · Archived" : ""}
                    </span>
                  </span>
                  <button type="button" className="btn" onClick={() => openEdit(f)} disabled={busy}>Edit</button>
                </div>

                {f.is_active && (
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--lc-border)" }}>
                    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                      <input type="checkbox" checked={!!f.show_in_filter_bar} onChange={() => toggleFilterBar(f)} disabled={busy} />
                      Show in search bar
                    </label>
                    {f.show_in_filter_bar && (
                      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                        <span style={{ opacity: 0.75 }}>as</span>
                        <select value={f.display_control} onChange={(e) => changeControl(f, e.target.value)} disabled={busy}>
                          {DISPLAY_CONTROLS.filter((c) => controls.includes(c.id)).map((c) => (
                            <option key={c.id} value={c.id}>{c.label}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    <span style={{ flex: 1 }} />
                    <button type="button" className="btn" onClick={() => toggleActive(f)} disabled={busy}>Archive</button>
                    <button type="button" className="btn" onClick={() => setConfirmDelete({ field: f, text: "" })} disabled={busy} style={{ color: "#b91c1c" }}>Delete</button>
                  </div>
                )}
                {!f.is_active && (
                  <div style={{ display: "flex", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--lc-border)" }}>
                    <button type="button" className="btn" onClick={() => toggleActive(f)} disabled={busy}>Restore</button>
                    <button type="button" className="btn" onClick={() => setConfirmDelete({ field: f, text: "" })} disabled={busy} style={{ color: "#b91c1c" }}>Delete</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {visibleFields.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button type="button" className="btn btn-primary" onClick={openCreate} disabled={busy}>+ New filter field</button>
          <span style={{ flex: 1 }} />
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, opacity: 0.85 }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived
          </label>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDelete
          field={confirmDelete.field}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={doPermanentDelete}
          busy={busy}
        />
      )}
    </div>
  );
}

function ConfirmDelete({ field, onCancel, onConfirm, busy }) {
  const [text, setText] = useState("");
  const [usage, setUsage] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let total = 0;
        for (const o of field.options || []) {
          total += await countListingsUsingOption(o.id);
        }
        if (alive) setUsage(total);
      } catch {
        if (alive) setUsage(null);
      }
    })();
    return () => { alive = false; };
  }, [field]);

  return (
    <div className="panel-section" style={{ border: "1px solid #b91c1c" }}>
      <p className="panel-section__title" style={{ color: "#b91c1c" }}>Delete "{field.label}" permanently?</p>
      <p style={{ margin: "0 0 8px", fontSize: 13 }}>
        This removes the field, its options, and all listing values for it.
        {usage != null && usage > 0 ? ` ${usage} listing tag${usage === 1 ? "" : "s"} will be removed.` : ""}
        {" "}This can't be undone.
      </p>
      <p style={{ margin: "0 0 6px", fontSize: 13 }}>Type <strong>DELETE</strong> to confirm:</p>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="DELETE" style={{ width: "100%", boxSizing: "border-box" }} />
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="button" className="btn" onClick={onConfirm} disabled={busy || text !== "DELETE"} style={{ color: "#fff", background: "#b91c1c", borderColor: "#b91c1c" }}>
          {busy ? "Deleting…" : "Delete permanently"}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}

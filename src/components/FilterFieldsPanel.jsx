import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FIELD_TYPES,
  DISPLAY_CONTROLS,
  allowedControlsForType,
  defaultControlForType,
  isSelectType,
  hasEditableOptions,
  BOOLEAN_OPTION_VALUE,
  BOOLEAN_OPTION_LABEL,
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
import CategorisationAttachmentPicker from "./directories/CategorisationAttachmentPicker.jsx";
import {
  ArrowDownIcon, ArrowUpIcon, Button, Callout, Checkbox, Dialog, EmptyState, Field, PlusIcon, Section, Select,
  Skeleton, TextInput, XIcon, Pill,
} from "./ui/index.js";
import "../styles/wave-b/map-pages.css";

const DEFAULT_OPTION_COLOR = "#4A9BAA"; // data: default pin colour for a new filter option

function MiniColorRow({ value, onChange, ariaLabel }) {
  const v = value || DEFAULT_OPTION_COLOR;
  return (
    <div className="mp-colour">
      <input type="color" className="swatch" value={v} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel} />
      <TextInput value={v} onChange={(e) => onChange(e.target.value)} aria-label={`${ariaLabel} hex`} />
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
export default function FilterFieldsPanel({ mapId, recordEvent, onChange, clientId, colorFieldId = null, onColorFieldChange }) {
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
    setForm((f) => {
      const next = {
        ...f,
        fieldType,
        displayControl: allowedControlsForType(fieldType).includes(f.displayControl)
          ? f.displayControl
          : defaultControlForType(fieldType),
      };
      // Boolean fields always have exactly one fixed option — no editor for it.
      if (fieldType === "boolean") {
        const existing = f.options.find((o) => o.value === BOOLEAN_OPTION_VALUE);
        next.options = [{ id: existing?.id ?? null, label: BOOLEAN_OPTION_LABEL, value: BOOLEAN_OPTION_VALUE, color: existing?.color || "" }];
      }
      return next;
    });
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
  if (loading) return <Skeleton variant="list" rows={3} label="Loading filters" />;

  if (form) {
    const controls = allowedControlsForType(form.fieldType);
    return (
      <div className="mp-stack">
        {error ? <Callout tone="danger">{error}</Callout> : null}
        <Section title={form.id ? "Edit filter field" : "New filter field"} as="h3">
          <div className="mp-stack">
            <Field label="Label">
              <TextInput value={form.label} onChange={(e) => setFormLabel(e.target.value)} placeholder="e.g. Sector" />
            </Field>
            <Field
              label="Key"
              hint={<>Used in CSV/Sheet columns as <code className="mp-key-code">filter_{form.key || "key"}</code></>}
              error={keyConflict ? "Another field already uses this key." : undefined}
            >
              <TextInput
                value={form.key}
                onChange={(e) => setForm((f) => ({ ...f, key: slugifyKey(e.target.value), keyTouched: true }))}
                placeholder="sector"
              />
            </Field>
          </div>
        </Section>

        <Section title="Type" as="h3">
          <div className="mp-stack">
            <fieldset className="radio-cards">
              <legend className="sr-only">Field type</legend>
              {FIELD_TYPES.map((t) => (
                <label key={t.id} className="radio-card">
                  <input
                    type="radio"
                    name="filterFieldType"
                    checked={form.fieldType === t.id}
                    disabled={!!form.id && form.originalFieldType && form.originalFieldType !== t.id}
                    onChange={() => setFormType(t.id)}
                  />
                  <span className="setting-row-label">{t.label}</span>
                  <span className="setting-row-desc">{t.hint}</span>
                </label>
              ))}
            </fieldset>
            {form.id && (
              <p className="mp-muted">
                Field type can't be changed after creation (it would orphan existing tags). Delete and recreate the field to change it.
              </p>
            )}
          </div>
        </Section>

        {hasEditableOptions(form.fieldType) && (
          <Section title="Options" as="h3">
            <div className="mp-stack">
              {form.options.map((o, i) => (
                <div key={o.id || `new-${i}`} className="mp-option-row">
                  <span className="mp-reorder">
                    <Button size="sm" iconOnly icon={<ArrowUpIcon />} aria-label="Move up" onClick={() => moveOption(i, -1)} disabled={i === 0} />
                    <Button size="sm" iconOnly icon={<ArrowDownIcon />} aria-label="Move down" onClick={() => moveOption(i, 1)} disabled={i === form.options.length - 1} />
                  </span>
                  <Field label="Option label">
                    <TextInput
                      value={o.label}
                      onChange={(e) => updateOption(i, { label: e.target.value })}
                      placeholder="Option label"
                    />
                  </Field>
                  <MiniColorRow value={o.color} onChange={(v) => updateOption(i, { color: v })} ariaLabel={`${o.label || "option"} colour`} />
                  <Button size="sm" iconOnly icon={<XIcon />} aria-label="Remove option" onClick={() => removeOptionRow(i)} />
                </div>
              ))}
              <div>
                <Button size="sm" icon={<PlusIcon size={14} />} onClick={addOption}>Add option</Button>
              </div>
            </div>
          </Section>
        )}

        {form.fieldType === "text" && (
          <p className="mp-muted">
            Free-text fields have no option list. Viewers filter them with a type-to-search box (typeahead).
          </p>
        )}

        {form.fieldType === "boolean" && (
          <Section
            title="Colour (optional)"
            as="h3"
            description={'Yes/No fields have a single implicit "Yes" option, so there is nothing to add or rename. Set a colour here if you want to use this field to colour pins.'}
          >
            <MiniColorRow
              value={form.options[0]?.color}
              onChange={(v) => updateOption(0, { color: v })}
              ariaLabel="Yes option colour"
            />
          </Section>
        )}

        <Section title="Display in search bar" as="h3">
          <Field label="Control">
            <Select value={form.displayControl} onChange={(e) => setForm((f) => ({ ...f, displayControl: e.target.value }))}>
              {DISPLAY_CONTROLS.map((c) => (
                <option key={c.id} value={c.id} disabled={!controls.includes(c.id)}>
                  {c.label}{!controls.includes(c.id) ? " (not available for this type)" : ""}
                </option>
              ))}
            </Select>
          </Field>
        </Section>

        <div className="mp-row">
          <Button variant="primary" onClick={saveForm} loading={busy} loadingLabel="Saving…" disabled={!canSave}>
            {form.id ? "Save changes" : "Create field"}
          </Button>
          <Button onClick={closeForm} disabled={busy}>Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mp-stack">
      {error ? <Callout tone="danger">{error}</Callout> : null}
      <p className="mp-note">
        Filter fields are custom, filterable metadata for this map (e.g. Sector, Languages spoken), separate from Groups.
        Turn on "Show in search bar" and Publish to make a field visible to viewers.
      </p>

      {typeof onColorFieldChange === "function" && (
        <Section title="Pin colour" as="h3">
          <Field
            label="Colour pins by"
            hint={'Which field\'s option colours set each pin\'s colour. "Group (default)" keeps today\'s current behaviour. Only single-choice and Yes/No fields can be used, because a listing can only have one pin colour. Takes effect on next Publish.'}
          >
            <Select value={colorFieldId || ""} onChange={(e) => onColorFieldChange(e.target.value || null)}>
              <option value="">Group (default)</option>
              {activeFields
                .filter((f) => f.field_type === "single_select" || f.field_type === "boolean")
                .map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
            </Select>
          </Field>
        </Section>
      )}

      {clientId && (
        <CategorisationAttachmentPicker clientId={clientId} targetType="map" targetId={mapId} recordEvent={emit} />
      )}

      {visibleFields.length === 0 ? (
        <EmptyState
          art="encouraging"
          title="No filter fields yet"
          actions={<Button variant="primary" onClick={openCreate}>Create your first filter field</Button>}
        />
      ) : (
        <ul className="mp-filter-list">
          {visibleFields.map((f) => {
            const controls = allowedControlsForType(f.field_type);
            return (
              <li key={f.id} className={`mp-filter-item ${f.is_active ? "" : "mp-filter-item--archived"}`.trim()}>
                <div className="mp-filter-main">
                  {f.is_active && (
                    <span className="mp-reorder">
                      <Button size="sm" iconOnly icon={<ArrowUpIcon />} aria-label={`Move ${f.label} up`} onClick={() => move(f, -1)} disabled={busy} />
                      <Button size="sm" iconOnly icon={<ArrowDownIcon />} aria-label={`Move ${f.label} down`} onClick={() => move(f, 1)} disabled={busy} />
                    </span>
                  )}
                  <span className="mp-filter-text">
                    <span className="mp-filter-name">{f.label}</span>
                    <span className="mp-muted">
                      {typeLabel(f.field_type)}
                      {hasEditableOptions(f.field_type) ? ` · ${f.options.length} option${f.options.length === 1 ? "" : "s"}` : ""}
                      {!f.is_active ? <>{" · "}<Pill>Archived</Pill></> : null}
                    </span>
                  </span>
                  <Button size="sm" onClick={() => openEdit(f)} disabled={busy}>Edit</Button>
                </div>

                {f.is_active && (
                  <div className="mp-filter-controls">
                    <Checkbox label="Show in search bar" checked={!!f.show_in_filter_bar} onChange={() => toggleFilterBar(f)} disabled={busy} />
                    {f.show_in_filter_bar && (
                      <Field label="Display as">
                        <Select value={f.display_control} onChange={(e) => changeControl(f, e.target.value)} disabled={busy}>
                          {DISPLAY_CONTROLS.filter((c) => controls.includes(c.id)).map((c) => (
                            <option key={c.id} value={c.id}>{c.label}</option>
                          ))}
                        </Select>
                      </Field>
                    )}
                    <span className="mp-push" />
                    <Button size="sm" onClick={() => toggleActive(f)} disabled={busy}>Archive</Button>
                    <Button size="sm" variant="danger" onClick={() => setConfirmDelete({ field: f, text: "" })} disabled={busy}>Delete</Button>
                  </div>
                )}
                {!f.is_active && (
                  <div className="mp-filter-controls">
                    <Button size="sm" onClick={() => toggleActive(f)} disabled={busy}>Restore</Button>
                    <Button size="sm" variant="danger" onClick={() => setConfirmDelete({ field: f, text: "" })} disabled={busy}>Delete</Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {visibleFields.length > 0 && (
        <div className="mp-row mp-row--between">
          <Button variant="primary" icon={<PlusIcon size={14} />} onClick={openCreate} disabled={busy}>New filter field</Button>
          <Checkbox label="Show archived" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
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
    <Dialog
      title={`Delete "${field.label}" permanently?`}
      onClose={onCancel}
      footer={
        <>
          <Button data-autofocus onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="danger-solid" onClick={onConfirm} loading={busy} loadingLabel="Deleting…" disabled={text !== "DELETE"}>
            Delete permanently
          </Button>
        </>
      }
    >
      <div className="mp-stack">
        <p className="mp-note">
          This removes the field, its options, and all listing values for it.
          {usage != null && usage > 0 ? ` ${usage} listing tag${usage === 1 ? "" : "s"} will be removed.` : ""}
          {" "}This can't be undone.
        </p>
        <Field label="Type DELETE to confirm">
          <TextInput value={text} onChange={(e) => setText(e.target.value)} placeholder="DELETE" />
        </Field>
      </div>
    </Dialog>
  );
}

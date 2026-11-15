import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  slugify,
  listCategorisations,
  createCategorisation,
  updateCategorisation,
  setCategorisationActive,
  deleteCategorisationPermanently,
  replaceCategorisationTerms,
  countUsageForTerm,
} from "../../lib/categorisations";
import {
  Button, Callout, Checkbox, DataTable, Dialog, EmptyState, Field, FieldGrid, Pill, PlusIcon, RadioCards,
  Skeleton, TextInput, Toolbar, XIcon,
} from "../ui/index.js";
import "../../styles/wave-a/batch-3.css";

const emptyForm = {
  id: null,
  label: "",
  key: "",
  keyTouched: false,
  fieldType: "multi_select",
  terms: [],
};

const DEFAULT_TERM_COLOR = "#4A9BAA"; // stored default for a new term colour (data value, not a style)

const FIELD_TYPE_OPTIONS = [
  { value: "multi_select", label: "Tags", hint: "Pick any number of values (e.g. Sector)." },
  { value: "single_select", label: "Single choice", hint: "Pick exactly one value (e.g. Region)." },
  { value: "boolean", label: "Yes / No toggle", hint: "A single switch (e.g. Awards chartered status) — no term list to manage." },
];

/**
 * Self-contained "Categories" panel — client-wide taxonomy
 * definitions, terms, archive/delete (docs/DIRECTORIES.md, DIR-E5).
 * Modelled directly on FilterFieldsPanel.jsx, but scoped to a client
 * rather than a single map (a categorisation is reusable across every
 * directory the client owns). Used by both the client portal and the
 * admin console.
 */
export default function CategorisationsPanel({ clientId, recordEvent }) {
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState(null); // null = list view
  const [confirmDelete, setConfirmDelete] = useState(null); // { cat }

  const emit = useCallback((eventType, meta) => {
    recordEvent?.(eventType, { client_id: clientId ?? null, ...meta });
  }, [recordEvent, clientId]);

  const refresh = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      setCats(await listCategorisations(clientId, { includeArchived: true }));
      setError("");
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const visibleCats = useMemo(
    () => cats.filter((c) => (showArchived ? true : c.is_active)),
    [cats, showArchived],
  );

  function openCreate() {
    setForm({ ...emptyForm, terms: [] });
  }
  function openEdit(cat) {
    setForm({
      id: cat.id,
      label: cat.label,
      key: cat.key,
      keyTouched: true,
      fieldType: cat.field_type || "multi_select",
      terms: (cat.terms || []).map((t) => ({ id: t.id, label: t.label, color: t.color || "" })),
    });
  }
  function closeForm() { setForm(null); }
  const cancelDelete = useCallback(() => setConfirmDelete(null), []);

  function setFormLabel(label) {
    setForm((f) => ({ ...f, label, key: f.keyTouched ? f.key : slugify(label) }));
  }
  function addTerm() {
    setForm((f) => ({ ...f, terms: [...f.terms, { id: null, label: "", color: "" }] }));
  }
  function updateTermRow(index, patch) {
    setForm((f) => ({ ...f, terms: f.terms.map((t, i) => (i === index ? { ...t, ...patch } : t)) }));
  }
  function removeTermRow(index) {
    setForm((f) => ({ ...f, terms: f.terms.filter((_, i) => i !== index) }));
  }

  const keyConflict = useMemo(() => {
    if (!form) return false;
    const k = (form.key || "").trim();
    if (!k) return false;
    return cats.some((c) => c.key === k && c.id !== form.id);
  }, [form, cats]);

  const canSave = useMemo(() => {
    if (!form) return false;
    if (!form.label.trim()) return false;
    if (!(form.key || "").trim() || keyConflict) return false;
    if (form.fieldType !== "boolean" && form.terms.filter((t) => t.label.trim()).length === 0) return false;
    return true;
  }, [form, keyConflict]);

  async function saveForm() {
    if (!form || !canSave) return;
    setBusy(true);
    setError("");
    try {
      const cleanTerms = form.terms
        .filter((t) => t.label.trim())
        .map((t) => ({ id: t.id, label: t.label.trim(), color: t.color || null }));

      if (form.id) {
        await updateCategorisation(form.id, { label: form.label.trim(), key: form.key.trim() });
        // A boolean categorisation's single term is system-managed — never
        // touch it here (the Terms editor is hidden for this fieldType, so
        // cleanTerms would otherwise be empty and wipe it out).
        if (form.fieldType !== "boolean") {
          await replaceCategorisationTerms(form.id, cleanTerms);
        }
        emit("directory_categorisation_updated", { categorisation_id: form.id, key: form.key.trim(), field_type: form.fieldType });
      } else {
        const cat = await createCategorisation({
          clientId,
          label: form.label.trim(),
          key: form.key.trim(),
          fieldType: form.fieldType,
          terms: cleanTerms,
        });
        emit("directory_categorisation_created", { categorisation_id: cat?.id, key: form.key.trim(), field_type: form.fieldType });
      }
      closeForm();
      await refresh();
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(cat) {
    setBusy(true);
    try {
      await setCategorisationActive(cat.id, !cat.is_active);
      emit(cat.is_active ? "directory_categorisation_archived" : "directory_categorisation_restored", { categorisation_id: cat.id, key: cat.key });
      await refresh();
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doPermanentDelete() {
    if (!confirmDelete?.cat) return;
    setBusy(true);
    try {
      await deleteCategorisationPermanently(confirmDelete.cat.id);
      emit("directory_categorisation_deleted", { categorisation_id: confirmDelete.cat.id, key: confirmDelete.cat.key });
      setConfirmDelete(null);
      await refresh();
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Skeleton variant="list" rows={3} label="Loading categories" />;

  if (form) {
    const selectedType = FIELD_TYPE_OPTIONS.find((o) => o.value === form.fieldType);
    return (
      <div className="b3-stack b3-stack--loose">
        {error ? <Callout tone="danger">{error}</Callout> : null}

        <div className="b3-stack">
          <h3 className="b3-subhead">{form.id ? "Edit category" : "New category"}</h3>
          <FieldGrid>
            <Field label="Label">
              <TextInput value={form.label} onChange={(e) => setFormLabel(e.target.value)} placeholder="e.g. Sector" />
            </Field>
            <Field label="Key" error={keyConflict ? "Another category already uses this key." : undefined}>
              <TextInput
                value={form.key}
                onChange={(e) => setForm((f) => ({ ...f, key: slugify(e.target.value), keyTouched: true }))}
                placeholder="sector"
              />
            </Field>
          </FieldGrid>
        </div>

        <div className="b3-stack">
          {form.id ? (
            <>
              <h3 className="b3-subhead">Facet type</h3>
              <p className="b3-text"><strong>{selectedType?.label}</strong>. {selectedType?.hint}</p>
              <p className="b3-muted">Facet type can't be changed after a category is created.</p>
            </>
          ) : (
            <RadioCards
              legend="Facet type"
              name="fieldType"
              value={form.fieldType}
              options={FIELD_TYPE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label, description: opt.hint }))}
              onChange={(v) => setForm((f) => ({ ...f, fieldType: v }))}
            />
          )}
        </div>

        <Callout tone="info">
          A new category isn't attached anywhere yet — attach it to a map or a directory from that map's
          Filters panel or that directory's settings to make its terms usable there.
        </Callout>

        {form.fieldType !== "boolean" && (
          <div className="b3-stack">
            <h3 className="b3-subhead">Terms</h3>
            {form.terms.map((t, i) => (
              <div key={t.id || `new-${i}`} className="b3-term-row">
                <TextInput
                  value={t.label}
                  onChange={(e) => updateTermRow(i, { label: e.target.value })}
                  placeholder="Term label"
                  aria-label={`Term ${i + 1} label`}
                />
                <input
                  type="color"
                  className="swatch b3-term-swatch"
                  value={t.color || DEFAULT_TERM_COLOR}
                  onChange={(e) => updateTermRow(i, { color: e.target.value })}
                  aria-label={`${t.label || `Term ${i + 1}`} colour`}
                />
                <Button variant="ghost" iconOnly onClick={() => removeTermRow(i)} aria-label={`Remove term ${t.label || i + 1}`}>
                  <XIcon />
                </Button>
              </div>
            ))}
            <div>
              <Button icon={<PlusIcon size={16} />} onClick={addTerm}>Add term</Button>
            </div>
          </div>
        )}

        <div className="b3-form-actions">
          <Button variant="primary" onClick={saveForm} loading={busy} loadingLabel="Saving…" disabled={!canSave}>
            {form.id ? "Save changes" : "Create category"}
          </Button>
          <Button onClick={closeForm} disabled={busy}>Cancel</Button>
        </div>
      </div>
    );
  }

  const columns = [
    {
      key: "label",
      label: "Category",
      render: (c) => (
        <button type="button" className="b3-expand-btn" onClick={() => openEdit(c)} disabled={busy}>{c.label}</button>
      ),
    },
    { key: "type", label: "Type", render: (c) => FIELD_TYPE_OPTIONS.find((o) => o.value === (c.field_type || "multi_select"))?.label },
    { key: "terms", label: "Terms", render: (c) => (c.field_type !== "boolean" ? c.terms.length : "—") },
    { key: "status", label: "Status", render: (c) => (c.is_active ? <Pill tone="live">Active</Pill> : <Pill tone="neutral">Archived</Pill>) },
  ];

  return (
    <div className="b3-stack">
      {error ? <Callout tone="danger">{error}</Callout> : null}
      <p className="b3-text">
        Categories are reusable taxonomies (e.g. Sector, Region) shared across every directory you own —
        separate from a directory's simple Group field.
      </p>

      {visibleCats.length > 0 && (
        <Toolbar>
          <Checkbox label="Show archived" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          <span className="toolbar-spacer" />
          <Button variant="primary" icon={<PlusIcon size={16} />} onClick={openCreate} disabled={busy}>New category</Button>
        </Toolbar>
      )}

      <DataTable
        caption="Categories"
        columns={columns}
        rows={visibleCats}
        getRowId={(c) => c.id}
        getRowLabel={(c) => c.label}
        rowMenu={(c) => [
          { label: "Edit", onSelect: () => openEdit(c), disabled: busy },
          { label: c.is_active ? "Archive" : "Restore", onSelect: () => toggleActive(c), disabled: busy },
          { label: "Delete", onSelect: () => setConfirmDelete({ cat: c }), danger: true, disabled: busy },
        ]}
        empty={
          <EmptyState
            art="encouraging"
            title="No categories yet"
            body="Create a category to group your entries, for example by sector or region."
            actions={<Button variant="primary" onClick={openCreate}>Create your first category</Button>}
          />
        }
      />

      {confirmDelete && (
        <ConfirmDelete cat={confirmDelete.cat} onCancel={cancelDelete} onConfirm={doPermanentDelete} busy={busy} />
      )}
    </div>
  );
}

function ConfirmDelete({ cat, onCancel, onConfirm, busy }) {
  const [text, setText] = useState("");
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let total = 0;
        for (const t of cat.terms || []) {
          total += await countUsageForTerm(t.id);
        }
        if (alive) setUsage(total);
      } catch {
        if (alive) setUsage(null);
      }
    })();
    return () => { alive = false; };
  }, [cat]);

  return (
    <Dialog
      title={`Delete "${cat.label}" permanently?`}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="danger-solid" onClick={onConfirm} loading={busy} loadingLabel="Deleting…" disabled={text !== "DELETE"}>
            Delete permanently
          </Button>
        </>
      }
    >
      <div className="b3-stack">
        <p className="b3-text">
          This removes the category, its terms, and all directory/entry tags for it.
          {usage != null && usage > 0 ? ` ${usage} tag${usage === 1 ? "" : "s"} will be removed.` : ""}
          {" "}This can't be undone.
        </p>
        <Field label="Type DELETE to confirm">
          <TextInput value={text} onChange={(e) => setText(e.target.value)} placeholder="DELETE" />
        </Field>
      </div>
    </Dialog>
  );
}

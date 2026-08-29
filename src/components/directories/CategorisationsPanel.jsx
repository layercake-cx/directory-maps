import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  APPLIES_TO_OPTIONS,
  appliesToLabel,
  slugify,
  listCategorisations,
  createCategorisation,
  updateCategorisation,
  setCategorisationActive,
  deleteCategorisationPermanently,
  replaceCategorisationTerms,
  countUsageForTerm,
} from "../../lib/categorisations";

const emptyForm = {
  id: null,
  label: "",
  key: "",
  keyTouched: false,
  appliesTo: "entry",
  terms: [],
  originalAppliesTo: null,
};

const DEFAULT_TERM_COLOR = "#4A9BAA";

/**
 * Self-contained "Categorisations" panel — client-wide taxonomy
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
      appliesTo: cat.applies_to,
      terms: (cat.terms || []).map((t) => ({ id: t.id, label: t.label, color: t.color || "" })),
      originalAppliesTo: cat.applies_to,
    });
  }
  function closeForm() { setForm(null); }

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
    if (form.terms.filter((t) => t.label.trim()).length === 0) return false;
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
        await replaceCategorisationTerms(form.id, cleanTerms);
        emit("directory_categorisation_updated", { categorisation_id: form.id, key: form.key.trim() });
      } else {
        const cat = await createCategorisation({
          clientId,
          label: form.label.trim(),
          key: form.key.trim(),
          appliesTo: form.appliesTo,
          terms: cleanTerms,
        });
        emit("directory_categorisation_created", { categorisation_id: cat?.id, key: form.key.trim(), applies_to: form.appliesTo });
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

  if (loading) return <p style={{ margin: 0, opacity: 0.7 }}>Loading categorisations…</p>;

  if (form) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error && <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p>}
        <div className="panel-section">
          <p className="panel-section__title">{form.id ? "Edit categorisation" : "New categorisation"}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ fontSize: 13 }}>
              <span style={{ display: "block", marginBottom: 4, opacity: 0.8 }}>Label</span>
              <input value={form.label} onChange={(e) => setFormLabel(e.target.value)} placeholder="e.g. Sector" style={{ width: "100%", boxSizing: "border-box" }} />
            </label>
            <label style={{ fontSize: 13 }}>
              <span style={{ display: "block", marginBottom: 4, opacity: 0.8 }}>Key</span>
              <input
                value={form.key}
                onChange={(e) => setForm((f) => ({ ...f, key: slugify(e.target.value), keyTouched: true }))}
                placeholder="sector"
                style={{ width: "100%", boxSizing: "border-box" }}
              />
              {keyConflict && <span style={{ color: "#b91c1c", fontSize: 12 }}>Another categorisation already uses this key.</span>}
            </label>
          </div>
        </div>

        <div className="panel-section">
          <p className="panel-section__title">Applies to</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {APPLIES_TO_OPTIONS.map((o) => (
              <label key={o.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                <input
                  type="radio"
                  name="appliesTo"
                  checked={form.appliesTo === o.id}
                  disabled={!!form.id}
                  onChange={() => setForm((f) => ({ ...f, appliesTo: o.id }))}
                />
                {o.label}
              </label>
            ))}
            {form.id && (
              <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>
                Can't be changed after creation (it would orphan existing tags). Delete and recreate to change it.
              </p>
            )}
          </div>
        </div>

        <div className="panel-section">
          <p className="panel-section__title">Terms</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {form.terms.map((t, i) => (
              <div key={t.id || `new-${i}`} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  value={t.label}
                  onChange={(e) => updateTermRow(i, { label: e.target.value })}
                  placeholder="Term label"
                  style={{ flex: 1, minWidth: 0 }}
                />
                <label className="color-swatch" title="Click to pick colour" style={{ display: "inline-flex" }}>
                  <span style={{ display: "inline-block", width: 20, height: 20, borderRadius: 4, background: t.color || DEFAULT_TERM_COLOR, border: "1px solid rgba(0,0,0,0.2)" }} />
                  <input type="color" value={t.color || DEFAULT_TERM_COLOR} onChange={(e) => updateTermRow(i, { color: e.target.value })} style={{ width: 0, height: 0, opacity: 0, position: "absolute" }} aria-label={`${t.label || "term"} colour`} />
                </label>
                <button type="button" className="btn" onClick={() => removeTermRow(i)} aria-label="Remove term">×</button>
              </div>
            ))}
            <div>
              <button type="button" className="btn" onClick={addTerm}>+ Add term</button>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-primary" onClick={saveForm} disabled={!canSave || busy}>
            {busy ? "Saving…" : form.id ? "Save changes" : "Create categorisation"}
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
        Categorisations are reusable taxonomies (e.g. Sector, Region) shared across every directory you own —
        separate from a directory's simple Group field.
      </p>

      {visibleCats.length === 0 ? (
        <div className="panel-section" style={{ textAlign: "center" }}>
          <p style={{ margin: "0 0 10px", opacity: 0.8 }}>No categorisations yet.</p>
          <button type="button" className="btn btn-primary" onClick={openCreate}>Create your first categorisation</button>
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {visibleCats.map((c) => (
            <li key={c.id} style={{ padding: "10px 12px", background: "var(--lc-card)", border: "1px solid var(--lc-border)", borderRadius: 10, opacity: c.is_active ? 1 : 0.6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600 }}>{c.label}</span>
                  <span style={{ display: "block", fontSize: 12, opacity: 0.7 }}>
                    {appliesToLabel(c.applies_to)} · {c.terms.length} term{c.terms.length === 1 ? "" : "s"}
                    {!c.is_active ? " · Archived" : ""}
                  </span>
                </span>
                <button type="button" className="btn" onClick={() => openEdit(c)} disabled={busy}>Edit</button>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--lc-border)" }}>
                <button type="button" className="btn" onClick={() => toggleActive(c)} disabled={busy}>
                  {c.is_active ? "Archive" : "Restore"}
                </button>
                <span style={{ flex: 1 }} />
                <button type="button" className="btn" onClick={() => setConfirmDelete({ cat: c })} disabled={busy} style={{ color: "#b91c1c" }}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {visibleCats.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button type="button" className="btn btn-primary" onClick={openCreate} disabled={busy}>+ New categorisation</button>
          <span style={{ flex: 1 }} />
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, opacity: 0.85 }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived
          </label>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDelete cat={confirmDelete.cat} onCancel={() => setConfirmDelete(null)} onConfirm={doPermanentDelete} busy={busy} />
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
    <div className="panel-section" style={{ border: "1px solid #b91c1c" }}>
      <p className="panel-section__title" style={{ color: "#b91c1c" }}>Delete "{cat.label}" permanently?</p>
      <p style={{ margin: "0 0 8px", fontSize: 13 }}>
        This removes the categorisation, its terms, and all directory/entry tags for it.
        {usage != null && usage > 0 ? ` ${usage} tag${usage === 1 ? "" : "s"} will be removed.` : ""}
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

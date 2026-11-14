import React, { useEffect, useMemo, useState } from "react";
import { listAttachedCategorisations } from "../../lib/categorisations";
import { Field, Select, Switch, XIcon, PlusIcon } from "../ui/index.js";
import "../../styles/wave-a/batch-3.css";

/**
 * Renders one control per categorisation attached to this directory, for
 * tagging a directory or a directory entry with terms (docs/DIRECTORIES.md
 * DIR-E5-S2). Whole-directory tagging and entry tagging both draw from the
 * same attached set — attachment (not a separate entry-vs-directory flag)
 * is what gates whether a categorisation is usable here at all.
 *
 * Control kind follows the categorisation's field_type: "multi_select" (the
 * original behaviour) renders a checkbox chip group; "single_select"
 * renders radio-style chips where picking one clears any other term from
 * that categorisation; "boolean" renders a single on/off switch bound to
 * its one system-managed term.
 *
 * @param {string} directoryId
 * @param {string[]} selectedTermIds
 * @param {(ids: string[]) => void} onChange
 */
export default function CategoryTagPicker({ directoryId, selectedTermIds, onChange }) {
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(null); // id of the categorisation whose "add" select is open

  useEffect(() => {
    if (!directoryId) return;
    let alive = true;
    (async () => {
      try {
        const attached = await listAttachedCategorisations("directory", directoryId);
        if (alive) setCats(attached);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [directoryId]);

  const applicable = cats;

  const selected = useMemo(() => new Set(selectedTermIds), [selectedTermIds]);

  /** Toggle one term. For single_select/boolean this replaces the categorisation's selection rather than adding to it. */
  function toggle(cat, termId) {
    const next = new Set(selected);
    if (cat.field_type === "single_select" || cat.field_type === "boolean") {
      const already = next.has(termId);
      for (const t of cat.terms) next.delete(t.id);
      if (!already) next.add(termId);
    } else {
      if (next.has(termId)) next.delete(termId);
      else next.add(termId);
    }
    onChange([...next]);
  }

  if (loading) return null;
  if (applicable.length === 0) return null;

  return (
    <div className="b3-stack">
      {applicable.map((cat) => {
        if (cat.field_type === "boolean") {
          const term = cat.terms[0];
          const on = term ? selected.has(term.id) : false;
          const labelId = `cat-switch-${cat.id}`;
          return (
            <div key={cat.id} className="b3-row">
              <Switch checked={on} disabled={!term} aria-labelledby={labelId} onChange={() => term && toggle(cat, term.id)} />
              <span id={labelId} className="b3-text">{cat.label}</span>
            </div>
          );
        }

        const isSingle = cat.field_type === "single_select";
        const chosen = cat.terms.filter((t) => selected.has(t.id));
        const unchosen = cat.terms.filter((t) => !selected.has(t.id));
        return (
          <div key={cat.id} className="b3-cat-group">
            <h3 className="b3-subhead">{cat.label}</h3>
            {cat.terms.length === 0 ? (
              <p className="b3-muted">No terms defined yet.</p>
            ) : (
              <>
                <div className="tag-picker">
                  {chosen.map((t) => (
                    <span key={t.id} className="chip-removable">
                      {t.label}
                      <button type="button" className="chip-remove" aria-label={`Remove ${t.label}`} onClick={() => toggle(cat, t.id)}>
                        <XIcon size={14} />
                      </button>
                    </span>
                  ))}
                  {unchosen.length > 0 ? (
                    <button type="button" className="chip-add" aria-expanded={adding === cat.id} onClick={() => setAdding(adding === cat.id ? null : cat.id)}>
                      <PlusIcon size={14} />
                      {isSingle && chosen.length > 0 ? `Change ${cat.label.toLowerCase()}` : `Add ${cat.label.toLowerCase()}`}
                    </button>
                  ) : null}
                </div>
                {adding === cat.id && unchosen.length > 0 ? (
                  <Field label={`Choose a term for ${cat.label}`}>
                    <Select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) toggle(cat, e.target.value);
                        setAdding(null);
                      }}
                    >
                      <option value="">Choose a term…</option>
                      {unchosen.map((t) => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

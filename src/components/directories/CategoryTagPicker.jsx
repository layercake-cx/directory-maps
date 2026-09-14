import React, { useEffect, useMemo, useState } from "react";
import { listAttachedCategorisations } from "../../lib/categorisations";

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
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {applicable.map((cat) => {
        if (cat.field_type === "boolean") {
          const term = cat.terms[0];
          const on = term ? selected.has(term.id) : false;
          return (
            <label key={cat.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: term ? "pointer" : "default" }}>
              <span
                onClick={() => term && toggle(cat, term.id)}
                role="switch"
                aria-checked={on}
                tabIndex={term ? 0 : -1}
                onKeyDown={(e) => { if (term && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(cat, term.id); } }}
                style={{
                  width: 36, height: 20, flex: "none", position: "relative", cursor: term ? "pointer" : "default",
                  borderRadius: 10, border: "1px solid var(--lc-border)",
                  background: on ? "#4A9BAA" : "transparent",
                }}
              >
                <span style={{ position: "absolute", top: 1, left: on ? 17 : 1, width: 16, height: 16, borderRadius: "50%", background: on ? "#fff" : "var(--lc-border)", transition: "left 0.12s" }} />
              </span>
              {cat.label}
            </label>
          );
        }

        if (cat.field_type === "single_select") {
          const activeId = cat.terms.find((t) => selected.has(t.id))?.id || "";
          return (
            <div key={cat.id}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{cat.label}</div>
              {cat.terms.length === 0 ? (
                <div style={{ fontSize: 12, opacity: 0.6 }}>No terms defined yet.</div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {cat.terms.map((t) => (
                    <label
                      key={t.id}
                      style={{
                        display: "flex", gap: 6, alignItems: "center", fontSize: 12,
                        padding: "4px 8px", borderRadius: 14, border: "1px solid var(--lc-border)",
                        background: activeId === t.id ? (t.color || "#4A9BAA") : "transparent",
                        color: activeId === t.id ? "#fff" : "inherit",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name={`cat-${cat.id}`}
                        checked={activeId === t.id}
                        onChange={() => toggle(cat, t.id)}
                        style={{ display: "none" }}
                      />
                      {t.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        }

        return (
          <div key={cat.id}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{cat.label}</div>
            {cat.terms.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.6 }}>No terms defined yet.</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {cat.terms.map((t) => (
                  <label
                    key={t.id}
                    style={{
                      display: "flex", gap: 6, alignItems: "center", fontSize: 12,
                      padding: "4px 8px", borderRadius: 14, border: "1px solid var(--lc-border)",
                      background: selected.has(t.id) ? (t.color || "#4A9BAA") : "transparent",
                      color: selected.has(t.id) ? "#fff" : "inherit",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(t.id)}
                      onChange={() => toggle(cat, t.id)}
                      style={{ display: "none" }}
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

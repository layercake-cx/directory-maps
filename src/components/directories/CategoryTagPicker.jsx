import React, { useEffect, useMemo, useState } from "react";
import { listAttachedCategorisations } from "../../lib/categorisations";

/**
 * Renders a checkbox group per categorisation attached to this directory,
 * for tagging a directory or a directory entry with terms
 * (docs/DIRECTORIES.md DIR-E5-S2). Whole-directory tagging and entry
 * tagging both draw from the same attached set — attachment (not a
 * separate entry-vs-directory flag) is what gates whether a categorisation
 * is usable here at all.
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

  function toggle(termId) {
    const next = new Set(selected);
    if (next.has(termId)) next.delete(termId);
    else next.add(termId);
    onChange([...next]);
  }

  if (loading) return null;
  if (applicable.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {applicable.map((cat) => (
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
                    onChange={() => toggle(t.id)}
                    style={{ display: "none" }}
                  />
                  {t.label}
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import { appliesToDirectories, appliesToEntries, listCategorisations } from "../../lib/categorisations";

/**
 * Renders a checkbox group per applicable categorisation, for tagging a
 * directory or a directory entry with terms (docs/DIRECTORIES.md DIR-E5-S2).
 * Categorisations not applicable to `scope` (directory-only vs entry-only)
 * are not shown — enforced client-side, matching how the entry-template
 * block palette hides directory-scoped categorisations (DIR-E6-S3).
 *
 * @param {string} clientId
 * @param {"entry"|"directory"} scope
 * @param {string[]} selectedTermIds
 * @param {(ids: string[]) => void} onChange
 */
export default function CategoryTagPicker({ clientId, scope, selectedTermIds, onChange }) {
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    (async () => {
      try {
        const all = await listCategorisations(clientId);
        if (alive) setCats(all);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [clientId]);

  const applicable = useMemo(
    () => cats.filter((c) => (scope === "entry" ? appliesToEntries(c.applies_to) : appliesToDirectories(c.applies_to))),
    [cats, scope],
  );

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

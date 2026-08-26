import React, { useEffect, useState } from "react";
import {
  grantEntryAccreditation,
  listAccreditationSchemes,
  loadEntryAccreditationSchemeIds,
  revokeEntryAccreditation,
} from "../../lib/accreditations";

/**
 * Entry-level accreditation picker (build-scope §5.7). Unlike
 * CategoryTagPicker, this saves immediately on toggle rather than deferring
 * to the parent form's Save — schemes are directory-scoped, not client-wide,
 * and only shown once the entry (and thus entry_id) already exists.
 */
export default function AccreditationsEditor({ directoryId, entryId, recordEvent }) {
  const [schemes, setSchemes] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!directoryId || !entryId) return;
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const [s, ids] = await Promise.all([listAccreditationSchemes(directoryId), loadEntryAccreditationSchemeIds(entryId)]);
        if (alive) {
          setSchemes(s);
          setSelected(new Set(ids));
        }
      } catch (e) {
        if (alive) setErr(e?.message ?? String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [directoryId, entryId]);

  async function toggle(schemeId) {
    setBusyId(schemeId);
    setErr("");
    try {
      if (selected.has(schemeId)) {
        await revokeEntryAccreditation(entryId, schemeId);
        setSelected((prev) => { const next = new Set(prev); next.delete(schemeId); return next; });
        recordEvent?.("directory_entry_accreditation_revoked", { directory_id: directoryId, entry_id: entryId, scheme_id: schemeId });
      } else {
        await grantEntryAccreditation(entryId, schemeId);
        setSelected((prev) => new Set(prev).add(schemeId));
        recordEvent?.("directory_entry_accreditation_granted", { directory_id: directoryId, entry_id: entryId, scheme_id: schemeId });
      }
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return null;
  if (schemes.length === 0) {
    return <p style={{ fontSize: 12, opacity: 0.6, margin: 0 }}>No accreditation schemes defined yet for this directory.</p>;
  }

  return (
    <div>
      {err && <p style={{ color: "#b91c1c", fontSize: 12, margin: "0 0 6px" }}>{err}</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {schemes.map((s) => (
          <label
            key={s.id}
            style={{
              display: "flex", gap: 6, alignItems: "center", fontSize: 12,
              padding: "4px 8px", borderRadius: 14, border: "1px solid var(--lc-border)",
              cursor: busyId ? "wait" : "pointer",
              opacity: busyId === s.id ? 0.6 : 1,
            }}
          >
            <input type="checkbox" checked={selected.has(s.id)} disabled={!!busyId} onChange={() => toggle(s.id)} />
            {s.name}
          </label>
        ))}
      </div>
    </div>
  );
}

import React, { useEffect, useState } from "react";
import {
  grantEntryAccreditation,
  listAccreditationSchemes,
  loadEntryAccreditationSchemeIds,
  revokeEntryAccreditation,
} from "../../lib/accreditations";
import { Callout, Checkbox, EmptyState } from "../ui/index.js";
import "../../styles/wave-a/batch-3.css";

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
    return <EmptyState art="none" title="No accreditation schemes defined yet for this directory" />;
  }

  return (
    <div className="b3-stack b3-stack--tight">
      {err ? <Callout tone="danger">{err}</Callout> : null}
      <fieldset className="choice-group" aria-busy={busyId ? "true" : undefined}>
        <legend className="sr-only">Accreditation schemes</legend>
        {schemes.map((s) => (
          <Checkbox
            key={s.id}
            label={s.name}
            checked={selected.has(s.id)}
            disabled={!!busyId}
            onChange={() => toggle(s.id)}
          />
        ))}
      </fieldset>
    </div>
  );
}

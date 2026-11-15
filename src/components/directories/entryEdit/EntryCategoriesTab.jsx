import React, { useEffect, useState } from "react";
import { Callout, Section, Skeleton } from "../../ui/index.js";
import "../../../styles/wave-a/batch-2.css";
import CategoryTagPicker from "../CategoryTagPicker.jsx";
import { loadEntryTermIds, setEntryTerms } from "../../../lib/categorisations.js";

export default function EntryCategoriesTab({ clientId, directoryId, entryId, canEdit, recordEvent }) {
  const [termIds, setTermIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setLoading(true);
    loadEntryTermIds(entryId)
      .then(setTermIds)
      .catch((e) => setErr(e?.message ?? String(e)))
      .finally(() => setLoading(false));
  }, [entryId]);

  async function handleChange(ids) {
    setTermIds(ids);
    try {
      setSaving(true);
      await setEntryTerms(entryId, ids);
      recordEvent?.("directory_entry_terms_updated", { directory_id: directoryId, entry_id: entryId });
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Skeleton variant="form" rows={3} label="Loading categories" />;

  return (
    <Section
      title="Categories"
      actions={saving ? <span className="entries-muted" role="status">Saving…</span> : null}
    >
      {err && <Callout tone="danger">{err}</Callout>}
      <CategoryTagPicker
        directoryId={directoryId}
        selectedTermIds={termIds}
        onChange={canEdit ? handleChange : () => {}}
      />
    </Section>
  );
}

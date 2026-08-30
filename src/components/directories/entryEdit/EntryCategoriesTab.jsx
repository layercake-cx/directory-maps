import React, { useEffect, useState } from "react";
import { Text } from "@mantine/core";
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

  if (loading) return <p>Loading…</p>;

  return (
    <div className="admin-card" style={{ padding: 20, maxWidth: 560 }}>
      <Text size="sm" fw={600} mb={8}>
        Categories {saving ? <span style={{ fontWeight: 400, opacity: 0.6 }}>(saving…)</span> : null}
      </Text>
      {err && <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p>}
      <CategoryTagPicker
        directoryId={directoryId}
        selectedTermIds={termIds}
        onChange={canEdit ? handleChange : () => {}}
      />
    </div>
  );
}

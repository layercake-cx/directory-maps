import React, { useCallback, useEffect, useState } from "react";
import { markDirectoryContentChanged } from "../../lib/directoryPublications";
import { CONFIDENCE_OPTIONS, createEvidenceItem, deleteEvidenceItem, listEvidenceItems, reorderEvidenceItems } from "../../lib/evidenceItems";
import { Button, Callout, EmptyState, Field, FieldGrid, Select, Skeleton, SortableList, SortableRow, Textarea, TextInput } from "../ui/index.js";
import "../../styles/wave-a/batch-3.css";

const emptyForm = { claim: "", value: "", source_url: "", checked_at: "", confidence: "", note: "" };

/** Per-claim evidence list on an entry (build-scope §5.5). Saves immediately. */
export default function EvidenceItemsEditor({ directoryId, entryId, recordEvent }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!entryId) return;
    try {
      setLoading(true);
      setItems(await listEvidenceItems(entryId));
      setErr("");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [entryId]);

  useEffect(() => { void refresh(); }, [refresh]);

  function fSet(key, value) { setForm((f) => ({ ...f, [key]: value })); }

  async function save(e) {
    e.preventDefault();
    if (!form.claim.trim()) { setErr("Claim is required."); return; }
    try {
      setSaving(true);
      setErr("");
      const item = await createEvidenceItem(entryId, form);
      recordEvent?.("directory_entry_evidence_added", { directory_id: directoryId, entry_id: entryId, evidence_id: item.id });
      setForm(emptyForm);
      setAddOpen(false);
      await refresh();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  async function handleReorder(next) {
    await reorderEvidenceItems(next.map((i) => i.id));
    await markDirectoryContentChanged({ directoryId, entryId });
    setItems(next);
  }

  async function remove(item) {
    try {
      await deleteEvidenceItem(item.id);
      recordEvent?.("directory_entry_evidence_removed", { directory_id: directoryId, entry_id: entryId, evidence_id: item.id });
      await refresh();
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }

  return (
    <div className="b3-stack">
      <div className="b3-row b3-row--between">
        <h3 className="b3-subhead">Evidence</h3>
        <Button size="sm" onClick={() => setAddOpen((v) => !v)}>
          {addOpen ? "Cancel" : "Add evidence"}
        </Button>
      </div>

      {err ? <Callout tone="danger">{err}</Callout> : null}

      {addOpen && (
        <form onSubmit={save} className="b3-form">
          <Field label="Claim or field" hint={'For example "No riding".'} required>
            <TextInput value={form.claim} onChange={(e) => fSet("claim", e.target.value)} />
          </Field>
          <Field label="Value" hint="Optional.">
            <TextInput value={form.value} onChange={(e) => fSet("value", e.target.value)} />
          </Field>
          <Field label="Source URL" hint="Optional.">
            <TextInput type="url" value={form.source_url} onChange={(e) => fSet("source_url", e.target.value)} />
          </Field>
          <FieldGrid>
            <Field label="Date checked">
              <TextInput type="date" value={form.checked_at} onChange={(e) => fSet("checked_at", e.target.value)} />
            </Field>
            <Field label="Confidence">
              <Select value={form.confidence} onChange={(e) => fSet("confidence", e.target.value)}>
                <option value="">Choose confidence</option>
                {CONFIDENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
          </FieldGrid>
          <Field label="Note" hint="Optional.">
            <Textarea rows={2} value={form.note} onChange={(e) => fSet("note", e.target.value)} />
          </Field>
          <div className="b3-form-actions">
            <Button type="submit" variant="primary" loading={saving} loadingLabel="Saving…">Add evidence</Button>
          </div>
        </form>
      )}

      {loading ? (
        <Skeleton variant="list" rows={2} label="Loading evidence" />
      ) : items.length === 0 ? (
        <EmptyState art="none" title="No evidence recorded yet" body="Add the source for a claim so visitors can see how it was checked." />
      ) : (
        <SortableList
          items={items}
          getId={(i) => i.id}
          getLabel={(i) => i.claim}
          ariaLabel="Evidence, in display order"
          variant="compact"
          onReorder={handleReorder}
          renderItem={(item, { row }) => (
            <SortableRow
              row={row}
              title={(
                <>
                  {item.claim}
                  {item.confidence && (
                    <span className="b3-muted">
                      {" "}({CONFIDENCE_OPTIONS.find((o) => o.value === item.confidence)?.label ?? item.confidence})
                    </span>
                  )}
                </>
              )}
              meta={(item.value || item.source_url || item.note) ? (
                <>
                  {item.value}
                  {item.source_url && <>{item.value ? " · " : ""}<a href={item.source_url} target="_blank" rel="noopener noreferrer">source</a></>}
                  {item.note && <>{item.value || item.source_url ? " · " : ""}{item.note}</>}
                </>
              ) : null}
              actions={(
                <Button variant="danger" size="sm" aria-label={`Delete evidence: ${item.claim}`} onClick={() => remove(item)}>
                  Delete
                </Button>
              )}
            />
          )}
        />
      )}
    </div>
  );
}

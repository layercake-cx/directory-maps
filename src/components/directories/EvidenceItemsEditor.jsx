import React, { useCallback, useEffect, useState } from "react";
import { CONFIDENCE_OPTIONS, createEvidenceItem, deleteEvidenceItem, listEvidenceItems } from "../../lib/evidenceItems";

const emptyForm = { claim: "", value: "", source_url: "", checked_at: "", confidence: "", note: "" };
const inputStyle = { width: "100%", boxSizing: "border-box", padding: "6px 9px", borderRadius: 7, border: "1px solid var(--lc-border)", fontSize: 13 };

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
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Evidence</p>
        <button type="button" className="btn" style={{ fontSize: 12, padding: "3px 10px" }} onClick={() => setAddOpen((v) => !v)}>
          {addOpen ? "Cancel" : "+ Add evidence"}
        </button>
      </div>

      {err && <p style={{ color: "#b91c1c", fontSize: 12, margin: "0 0 8px" }}>{err}</p>}

      {addOpen && (
        <form onSubmit={save} style={{ display: "grid", gap: 8, marginBottom: 12, padding: 12, background: "#f9fafb", border: "1px solid var(--lc-border)", borderRadius: 8 }}>
          <input value={form.claim} onChange={(e) => fSet("claim", e.target.value)} placeholder="Claim / field, e.g. &quot;No riding&quot;" style={inputStyle} required />
          <input value={form.value} onChange={(e) => fSet("value", e.target.value)} placeholder="Value (optional)" style={inputStyle} />
          <input value={form.source_url} onChange={(e) => fSet("source_url", e.target.value)} placeholder="Source URL (optional)" type="url" style={inputStyle} />
          <div style={{ display: "flex", gap: 8 }}>
            <input value={form.checked_at} onChange={(e) => fSet("checked_at", e.target.value)} type="date" style={inputStyle} />
            <select value={form.confidence} onChange={(e) => fSet("confidence", e.target.value)} style={inputStyle}>
              <option value="">Confidence…</option>
              {CONFIDENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <textarea value={form.note} onChange={(e) => fSet("note", e.target.value)} placeholder="Note (optional)" rows={2} style={{ ...inputStyle, resize: "vertical" }} />
          <div>
            <button type="submit" className="btn btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} disabled={saving}>
              {saving ? "Saving…" : "Add evidence"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p style={{ fontSize: 13, opacity: 0.6 }}>Loading…</p>
      ) : items.length === 0 ? (
        <p style={{ fontSize: 13, opacity: 0.6 }}>No evidence recorded yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {items.map((item) => (
            <div key={item.id} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, padding: "6px 10px", border: "1px solid var(--lc-border)", borderRadius: 7 }}>
              <div style={{ fontSize: 12 }}>
                <div style={{ fontWeight: 500 }}>
                  {item.claim}
                  {item.confidence && (
                    <span style={{ marginLeft: 6, opacity: 0.65, fontWeight: 400 }}>
                      ({CONFIDENCE_OPTIONS.find((o) => o.value === item.confidence)?.label ?? item.confidence})
                    </span>
                  )}
                </div>
                {item.value && <div style={{ opacity: 0.8 }}>{item.value}</div>}
                {item.source_url && <div><a href={item.source_url} target="_blank" rel="noopener noreferrer">source</a></div>}
                {item.note && <div style={{ opacity: 0.7, marginTop: 2 }}>{item.note}</div>}
              </div>
              <button type="button" className="btn" style={{ fontSize: 12, padding: "3px 8px", color: "#b91c1c", flexShrink: 0 }} onClick={() => remove(item)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import React, { useCallback, useEffect, useState } from "react";
import {
  createAccreditationScheme,
  deleteAccreditationSchemePermanently,
  listAccreditationSchemes,
  setAccreditationSchemeActive,
} from "../../lib/accreditations";
import { Button, Callout, EmptyState, Field, FieldGrid, Pill, Section, Skeleton, Textarea, TextInput, useConfirm } from "../ui/index.js";
import "../../styles/wave-a/batch-3.css";

const emptyForm = { name: "", issuing_body: "", badge_image_url: "", description: "", verification_note: "" };

/**
 * Directory-level accreditation scheme definitions (build-scope §5.7) — "a
 * directory defines the schemes". Entries then hold them via
 * AccreditationsEditor. Modelled on the directory_groups inline-add pattern
 * in DirectoryEntriesPanel.jsx, since schemes are directory-scoped, not
 * client-wide like categorisations.
 */
export default function AccreditationSchemesPanel({ directoryId, recordEvent }) {
  const [schemes, setSchemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();

  const refresh = useCallback(async () => {
    if (!directoryId) return;
    try {
      setLoading(true);
      setSchemes(await listAccreditationSchemes(directoryId, { includeArchived: true }));
      setErr("");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [directoryId]);

  useEffect(() => { void refresh(); }, [refresh]);

  function fSet(key, value) { setForm((f) => ({ ...f, [key]: value })); }

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) { setErr("Scheme name is required."); return; }
    try {
      setSaving(true);
      setErr("");
      const s = await createAccreditationScheme(directoryId, form);
      recordEvent?.("directory_accreditation_scheme_created", { directory_id: directoryId, scheme_id: s.id, name: s.name });
      setForm(emptyForm);
      setAddOpen(false);
      await refresh();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(scheme) {
    try {
      await setAccreditationSchemeActive(scheme.id, !scheme.is_active);
      recordEvent?.("directory_accreditation_scheme_archived", { directory_id: directoryId, scheme_id: scheme.id, is_active: !scheme.is_active });
      await refresh();
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }

  async function remove(scheme) {
    const ok = await confirm({
      title: `Delete accreditation scheme "${scheme.name}"?`,
      body: "This removes it from every entry that holds it. You can't undo this. To keep it but stop using it, archive it instead.",
      confirmLabel: "Delete scheme",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteAccreditationSchemePermanently(scheme.id);
      recordEvent?.("directory_accreditation_scheme_deleted", { directory_id: directoryId, scheme_id: scheme.id, name: scheme.name });
      await refresh();
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }

  return (
    <Section
      title="Accreditation schemes"
      actions={<Button size="sm" onClick={() => setAddOpen((v) => !v)}>{addOpen ? "Cancel" : "Add scheme"}</Button>}
    >
      {err ? <Callout tone="danger">{err}</Callout> : null}

      {addOpen && (
        <form onSubmit={save} className="b3-form">
          <h3 className="b3-subhead">New scheme</h3>
          <Field label="Scheme name" required>
            <TextInput value={form.name} onChange={(e) => fSet("name", e.target.value)} />
          </Field>
          <FieldGrid>
            <Field label="Issuing body" hint="Optional.">
              <TextInput value={form.issuing_body} onChange={(e) => fSet("issuing_body", e.target.value)} />
            </Field>
            <Field label="Badge image URL" hint="Optional.">
              <TextInput type="url" value={form.badge_image_url} onChange={(e) => fSet("badge_image_url", e.target.value)} />
            </Field>
          </FieldGrid>
          <Field label="Description" hint="Optional.">
            <Textarea rows={2} value={form.description} onChange={(e) => fSet("description", e.target.value)} />
          </Field>
          <Field label="Verification note" hint="Optional.">
            <TextInput value={form.verification_note} onChange={(e) => fSet("verification_note", e.target.value)} />
          </Field>
          <div className="b3-form-actions">
            <Button type="submit" variant="primary" loading={saving} loadingLabel="Saving…">Add scheme</Button>
          </div>
        </form>
      )}

      {loading ? (
        <Skeleton variant="list" rows={3} label="Loading accreditation schemes" />
      ) : schemes.length === 0 ? (
        <EmptyState
          art="encouraging"
          title="No accreditation schemes yet"
          body="Add a scheme, then grant it to entries from the entry editor."
          actions={!addOpen ? <Button variant="primary" onClick={() => setAddOpen(true)}>Add scheme</Button> : null}
        />
      ) : (
        <ul className="b3-list">
          {schemes.map((s) => (
            <li key={s.id} className={`b3-list-item ${s.is_active ? "" : "is-muted"}`.trim()}>
              <div className="b3-list-main">
                <div className="b3-list-title">
                  {s.name}
                  {!s.is_active && <Pill tone="neutral">Archived</Pill>}
                </div>
                {s.issuing_body && <div className="b3-list-sub">{s.issuing_body}</div>}
              </div>
              <div className="b3-list-actions">
                <Button size="sm" onClick={() => toggleActive(s)}>
                  {s.is_active ? "Archive" : "Restore"}
                </Button>
                <Button variant="danger" size="sm" aria-label={`Delete scheme: ${s.name}`} onClick={() => remove(s)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

import React, { useCallback, useEffect, useState } from "react";
import { createProminentLink, deleteProminentLink, listProminentLinks } from "../../lib/prominentLinks";
import { Button, Callout, Checkbox, EmptyState, Field, Select, Skeleton, TextInput } from "../ui/index.js";
import "../../styles/wave-a/batch-3.css";

const emptyForm = { label: "", url: "", icon: "", style: "secondary", open_in_new: true, tracking: false };

/**
 * Prominent link tiles (build-scope §5.8) — pass exactly one of
 * {directoryId, entryId}. Used both on a directory's homepage settings and
 * inside an entry's edit form.
 */
export default function ProminentLinksEditor({ directoryId, entryId, recordEvent, title = "Prominent links" }) {
  const owner = directoryId ? { directoryId } : { entryId };
  const ownerKey = directoryId || entryId;

  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!ownerKey) return;
    try {
      setLoading(true);
      setLinks(await listProminentLinks(owner));
      setErr("");
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerKey]);

  useEffect(() => { void refresh(); }, [refresh]);

  function fSet(key, value) { setForm((f) => ({ ...f, [key]: value })); }

  async function save(e) {
    e.preventDefault();
    try {
      setSaving(true);
      setErr("");
      const link = await createProminentLink(owner, form);
      recordEvent?.("directory_prominent_link_added", { directory_id: directoryId ?? null, entry_id: entryId ?? null, link_id: link.id });
      setForm(emptyForm);
      setAddOpen(false);
      await refresh();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  async function remove(link) {
    try {
      await deleteProminentLink(link.id);
      recordEvent?.("directory_prominent_link_removed", { directory_id: directoryId ?? null, entry_id: entryId ?? null, link_id: link.id });
      await refresh();
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }

  return (
    <div className="b3-stack">
      <div className="b3-row b3-row--between">
        <h3 className="b3-subhead">{title}</h3>
        <Button size="sm" onClick={() => setAddOpen((v) => !v)}>
          {addOpen ? "Cancel" : "Add link"}
        </Button>
      </div>

      {err ? <Callout tone="danger">{err}</Callout> : null}

      {addOpen && (
        <form onSubmit={save} className="b3-form">
          <Field label="Label" required>
            <TextInput value={form.label} onChange={(e) => fSet("label", e.target.value)} />
          </Field>
          <Field label="URL" required>
            <TextInput type="url" placeholder="https://…" value={form.url} onChange={(e) => fSet("url", e.target.value)} />
          </Field>
          <Field label="Style">
            <Select value={form.style} onChange={(e) => fSet("style", e.target.value)}>
              <option value="primary">Primary style</option>
              <option value="secondary">Secondary style</option>
            </Select>
          </Field>
          <Checkbox label="Open in a new tab" checked={form.open_in_new} onChange={(e) => fSet("open_in_new", e.target.checked)} />
          <Checkbox
            label="Sponsored or affiliate"
            hint={'Adds rel="sponsored nofollow" when rendered.'}
            checked={form.tracking}
            onChange={(e) => fSet("tracking", e.target.checked)}
          />
          <div className="b3-form-actions">
            <Button type="submit" variant="primary" loading={saving} loadingLabel="Saving…">Add link</Button>
          </div>
        </form>
      )}

      {loading ? (
        <Skeleton variant="list" rows={2} label="Loading links" />
      ) : links.length === 0 ? (
        <EmptyState art="none" title="No links yet" body="Add a link to show it as a prominent tile." />
      ) : (
        <ul className="b3-list">
          {links.map((link) => (
            <li key={link.id} className="b3-list-item">
              <div className="b3-list-main">
                <div className="b3-list-title">{link.label} <span className="b3-muted">({link.style})</span></div>
                <div className="b3-list-sub">{link.url}</div>
              </div>
              <Button variant="danger" size="sm" aria-label={`Delete link: ${link.label}`} onClick={() => remove(link)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

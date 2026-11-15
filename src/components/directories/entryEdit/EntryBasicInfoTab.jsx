import React, { useEffect, useRef, useState } from "react";
import { createDirectoryEntry, createDirectoryGroup, geocodeAddress, listDirectoryGroups, updateDirectoryEntry } from "../../../lib/directories.js";
import { uploadEntryLogo } from "../../../lib/entryImages.js";
import { Button, Callout, CheckboxGroup, Checkbox, Field, FieldGrid, PlusIcon, Section, Select, TextInput } from "../../ui/index.js";
import "../../../styles/wave-a/batch-2.css";

/** Address fields as a single comparable key, to detect whether re-geocoding is needed. */
function addressKey(source) {
  return [source?.address, source?.postcode, source?.country].map((v) => String(v || "").trim()).join("|");
}

function buildForm(entry) {
  return {
    name: entry?.name || "",
    address: entry?.address || "",
    postcode: entry?.postcode || "",
    country: entry?.country || "",
    directory_group_id: entry?.directory_group_id || "",
    website_url: entry?.website_url || "",
    email: entry?.email || "",
    phone: entry?.phone || "",
    logo_url: entry?.logo_url || "",
    is_active: entry?.is_active !== false,
    show_phone: entry?.show_phone !== false,
    show_email: entry?.show_email !== false,
    show_website: entry?.show_website !== false,
    show_address: entry?.show_address !== false,
  };
}

/**
 * Core entry fields — the first tab of the full-page entry editor.
 * Deliberately excludes lat/lng: coordinates are auto-geocoded from
 * address/postcode/country on save (see handleSubmit), never hand-entered.
 */
export default function EntryBasicInfoTab({ directoryId, entryId, entry, isNew, canEdit, recordEvent, onSaved, onCreated }) {
  const [form, setForm] = useState(() => buildForm(entry));
  const [groups, setGroups] = useState([]);
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoErr, setLogoErr] = useState("");

  // Baseline address the entry was last (successfully or not) geocoded against —
  // re-geocode on save only when this changes, or coordinates are still missing.
  const baselineAddressKeyRef = useRef(addressKey(entry));

  useEffect(() => {
    if (!directoryId) return;
    listDirectoryGroups(directoryId).then(setGroups).catch(() => {});
  }, [directoryId]);

  function fSet(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function saveNewGroup(e) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    try {
      setSavingGroup(true);
      const g = await createDirectoryGroup(directoryId, newGroupName);
      setGroups((gs) => [...gs, g]);
      fSet("directory_group_id", g.id);
      setAddGroupOpen(false);
      setNewGroupName("");
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSavingGroup(false);
    }
  }

  async function handleLogoFile(e) {
    const file = e?.target?.files?.[0];
    if (!file) return;
    setLogoErr("");
    setLogoUploading(true);
    try {
      const url = await uploadEntryLogo(entryId, file);
      fSet("logo_url", url);
      await updateDirectoryEntry(entryId, { logo_url: url });
      recordEvent?.("directory_entry_updated", { directory_id: directoryId, entry_id: entryId });
      onSaved?.();
    } catch (e2) {
      setLogoErr(e2?.message ?? String(e2));
    } finally {
      setLogoUploading(false);
      e.target.value = "";
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    if (!form.name.trim()) {
      setErr("Name is required.");
      return;
    }
    try {
      setSaving(true);

      const hasAddressBits = !!(form.address || form.postcode || form.country);
      const currentKey = addressKey(form);
      const missingCoords = entry?.lat == null || entry?.lng == null;
      let geo = {};
      if (!hasAddressBits) {
        geo = { lat: null, lng: null, geocode_status: null, geocoded_at: null };
      } else if (isNew || currentKey !== baselineAddressKeyRef.current || missingCoords) {
        const result = await geocodeAddress([form.address, form.postcode, form.country].filter(Boolean).join(", "));
        geo = {
          lat: result.ok ? result.lat : null,
          lng: result.ok ? result.lng : null,
          geocode_status: result.status,
          geocoded_at: new Date().toISOString(),
        };
      }

      if (isNew) {
        const id = await createDirectoryEntry({ ...form, ...geo, directory_id: directoryId });
        recordEvent?.("directory_entry_created", { directory_id: directoryId, entry_id: id, name: form.name });
        onCreated?.(id);
      } else {
        await updateDirectoryEntry(entryId, { ...form, ...geo });
        recordEvent?.("directory_entry_updated", { directory_id: directoryId, entry_id: entryId });
        onSaved?.();
      }
      baselineAddressKeyRef.current = currentKey;
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  const SHOW_KEYS = ["show_phone", "show_email", "show_website", "show_address"];

  return (
    <form onSubmit={handleSubmit} className="editor-form">
      <Section
        footer={canEdit ? (
          <Button variant="primary" type="submit" loading={saving} loadingLabel={isNew ? "Creating…" : "Saving…"}>
            {isNew ? "Create entry" : "Save changes"}
          </Button>
        ) : null}
      >
        <Field label="Name" required>
          <TextInput value={form.name} onChange={(e) => fSet("name", e.target.value)} disabled={!canEdit} placeholder="e.g. Bright Solutions Ltd" />
        </Field>
        <Field label="Address">
          <TextInput value={form.address} onChange={(e) => fSet("address", e.target.value)} disabled={!canEdit} placeholder="e.g. 1 Example Street, London" />
        </Field>
        <FieldGrid>
          <Field label="Postcode">
            <TextInput value={form.postcode} onChange={(e) => fSet("postcode", e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Country">
            <TextInput value={form.country} onChange={(e) => fSet("country", e.target.value)} disabled={!canEdit} />
          </Field>
        </FieldGrid>

        <div className="group-row">
          <Field label="Group">
            <Select value={form.directory_group_id} onChange={(e) => fSet("directory_group_id", e.target.value)} disabled={!canEdit}>
              <option value="">No group</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </Field>
          {canEdit && (
            <Button size="sm" variant="ghost" icon={<PlusIcon size={14} />} onClick={() => { setAddGroupOpen(true); setNewGroupName(""); }}>
              Add group
            </Button>
          )}

          {addGroupOpen && (
            <div className="subpanel">
              <form onSubmit={saveNewGroup} className="inline-form">
                <Field label="New group name" required>
                  <TextInput autoFocus value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="e.g. Healthcare" />
                </Field>
                <Button type="submit" variant="primary" loading={savingGroup} loadingLabel="Saving…">Add</Button>
                <Button onClick={() => setAddGroupOpen(false)}>Cancel</Button>
              </form>
            </div>
          )}
        </div>

        <Field label="Website URL">
          <TextInput value={form.website_url} onChange={(e) => fSet("website_url", e.target.value)} disabled={!canEdit} placeholder="https://…" type="url" />
        </Field>
        <FieldGrid>
          <Field label="Email">
            <TextInput value={form.email} onChange={(e) => fSet("email", e.target.value)} disabled={!canEdit} placeholder="hello@…" type="email" />
          </Field>
          <Field label="Phone">
            <TextInput value={form.phone} onChange={(e) => fSet("phone", e.target.value)} disabled={!canEdit} placeholder="+44…" />
          </Field>
        </FieldGrid>
        <div className="editor-stack">
          <Field
            label="Logo"
            hint={canEdit && isNew ? "Save the entry first to unlock direct file upload — paste a hosted image URL for now." : undefined}
          >
            <TextInput value={form.logo_url} onChange={(e) => fSet("logo_url", e.target.value)} disabled={!canEdit} placeholder="https://…/logo.png" type="url" />
          </Field>
          {canEdit && !isNew && (
            <div className="upload-row">
              {form.logo_url && <img src={form.logo_url} alt="" className="logo-thumb" />}
              <label className="shell-btn shell-btn--sm file-btn" aria-disabled={logoUploading ? "true" : undefined}>
                {logoUploading ? "Uploading…" : "Upload a logo file"}
                <input type="file" className="sr-only" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={handleLogoFile} disabled={logoUploading} />
              </label>
              <span className="entries-muted">PNG, JPG or WebP, max 2 MB.</span>
            </div>
          )}
          {logoErr && <Callout tone="danger">{logoErr}</Callout>}
        </div>

        <Checkbox label="Active (visible)" checked={form.is_active} onChange={(e) => fSet("is_active", e.target.checked)} disabled={!canEdit} />

        <CheckboxGroup
          legend="Show publicly (once published)"
          disabled={!canEdit}
          options={[
            { value: "show_phone", label: "Phone" },
            { value: "show_email", label: "Email" },
            { value: "show_website", label: "Website" },
            { value: "show_address", label: "Address" },
          ]}
          value={SHOW_KEYS.filter((k) => form[k])}
          onChange={(next) => SHOW_KEYS.forEach((k) => fSet(k, next.includes(k)))}
        />

        {err && <Callout tone="danger">{err}</Callout>}
      </Section>
    </form>
  );
}

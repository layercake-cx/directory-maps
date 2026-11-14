import React, { useId } from "react";
import ListingFilterValuesEditor from "../ListingFilterValuesEditor.jsx";
import { Button, Callout, Checkbox, Dialog, Field, FieldGrid, PlusIcon, Select, TextInput } from "../ui/index.js";
import "../../styles/wave-b/map-data.css";

/**
 * Add / edit a single listing by hand. Shared by the client and admin map Data pages.
 * Presentational: the page owns the form state, geocoding, group creation and the save; this renders the dialog.
 *
 * @param {{
 *   mode: "new"|"edit",
 *   listing: object|null,                     // the listing being edited (null when adding)
 *   mapId: string,
 *   form: {name: string, address: string, group_id: string, lat: string, lng: string, website_url: string,
 *          email: string, phone: string, logo_url: string, is_active: boolean},
 *   onChange: (key: string, value: any) => void,
 *   groups: {id: string, name: string}[],
 *   geocoding: boolean,
 *   error: string,
 *   saving: boolean,
 *   onAddressBlur: () => void,
 *   onSubmit: (event: React.FormEvent) => void,
 *   onClose: () => void,
 *   filterEditorRef: React.Ref<any>,          // ref to ListingFilterValuesEditor (persist(listingId))
 *   addGroup: { open: boolean, name: string, saving: boolean, onOpen: () => void, onClose: () => void,
 *               onNameChange: (name: string) => void, onSave: (event: React.SyntheticEvent) => void },
 * }} props
 */
export default function ManualListingDialog({
  mode, listing, mapId, form, onChange, groups, geocoding, error, saving, onAddressBlur, onSubmit, onClose, filterEditorRef, addGroup,
}) {
  const formId = useId();
  return (
    <Dialog
      title={mode === "new" ? "Add new entry" : `Edit: ${listing?.name || ""}`}
      onClose={onClose}
      footer={(
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} variant="primary" loading={saving} loadingLabel="Saving…">
            {mode === "new" ? "Add entry" : "Save changes"}
          </Button>
        </>
      )}
    >
      <form id={formId} className="md-dialog-form" onSubmit={onSubmit}>
        <Field label="Name" required>
          <TextInput value={form.name} onChange={(e) => onChange("name", e.target.value)} placeholder="e.g. Acme Ltd" />
        </Field>
        <Field label="Address">
          <TextInput
            value={form.address}
            onChange={(e) => onChange("address", e.target.value)}
            onBlur={onAddressBlur}
            placeholder="e.g. 1 Example Street, London"
          />
        </Field>

        <div className="md-stack">
          <Field label="Group">
            <Select value={form.group_id} onChange={(e) => onChange("group_id", e.target.value)}>
              <option value="">No group</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </Field>
          {!addGroup.open && (
            <div>
              <Button size="sm" variant="ghost" icon={<PlusIcon />} onClick={addGroup.onOpen}>Add group</Button>
            </div>
          )}
          {addGroup.open && (
            // Not a <form>: this sits inside the entry form, and nested forms are invalid HTML.
            <div className="md-group-add">
              <Field label="New group name">
                <TextInput
                  autoFocus
                  value={addGroup.name}
                  onChange={(e) => addGroup.onNameChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addGroup.onSave(e); }}
                  placeholder="e.g. Cafés"
                />
              </Field>
              <Button variant="primary" onClick={addGroup.onSave} loading={addGroup.saving} loadingLabel="Saving…">Add</Button>
              <Button onClick={addGroup.onClose}>Cancel</Button>
            </div>
          )}
        </div>

        <div className="md-stack">
          <FieldGrid>
            <Field label="Latitude">
              <TextInput value={form.lat} onChange={(e) => onChange("lat", e.target.value)} placeholder="e.g. 51.5074" inputMode="decimal" disabled={geocoding} />
            </Field>
            <Field label="Longitude">
              <TextInput value={form.lng} onChange={(e) => onChange("lng", e.target.value)} placeholder="e.g. -0.1278" inputMode="decimal" disabled={geocoding} />
            </Field>
          </FieldGrid>
          <p className="md-meta" role="status">
            {geocoding ? "Updating coordinates from address…" : "Coordinates update automatically when you change the address."}
          </p>
        </div>

        <Field label="Website URL">
          <TextInput type="url" value={form.website_url} onChange={(e) => onChange("website_url", e.target.value)} placeholder="https://…" />
        </Field>
        <FieldGrid>
          <Field label="Email">
            <TextInput type="email" value={form.email} onChange={(e) => onChange("email", e.target.value)} placeholder="hello@…" />
          </Field>
          <Field label="Phone">
            <TextInput value={form.phone} onChange={(e) => onChange("phone", e.target.value)} placeholder="+44…" />
          </Field>
        </FieldGrid>
        <Field label="Logo URL">
          <TextInput type="url" value={form.logo_url} onChange={(e) => onChange("logo_url", e.target.value)} placeholder="https://…/logo.png" />
        </Field>
        <Checkbox label="Active (visible on map)" checked={form.is_active} onChange={(e) => onChange("is_active", e.target.checked)} />

        <ListingFilterValuesEditor ref={filterEditorRef} mapId={mapId} listingId={listing?.id || null} />

        {error ? <Callout tone="danger">{error}</Callout> : null}
      </form>
    </Dialog>
  );
}

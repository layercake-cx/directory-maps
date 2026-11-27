import React, { useMemo, useState } from "react";
import { BLOCK_REGISTRY } from "../../lib/blockRegistry.generated.js";
import { Button, Callout, Checkbox, Dialog, Field, FieldGrid, Section, Select, SegmentedControl, TextInput, useConfirm } from "../ui/index.js";
import { BlockFieldSet } from "./BlockFields.jsx";
import { cleanData, emptyData, parseBlockError, regionLabel, validateFields } from "../../lib/pageBlocks.js";

const COMMON_FIELDS = BLOCK_REGISTRY.commonFields;
const optionLabel = (o) => String(o).replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

function commonErrors(common) {
  return validateFields(COMMON_FIELDS, common, "common");
}

/** Drops empty common settings so the database never sees "". */
function cleanCommon(common) {
  const out = {};
  for (const f of COMMON_FIELDS) {
    const v = common?.[f.key];
    if (v !== undefined && v !== "" && v !== null && !(f.key === "visibility" && v === "all") && !(f.key === "theme" && v === "default")) out[f.key] = v;
  }
  if (common?.variants && Object.keys(common.variants).length) out.variants = common.variants;
  return out;
}

/**
 * Edit, add or template dialog for one block. Opens with a local draft: Cancel discards it, Save sends it.
 * `mode`: "edit" (an instance on a page), "add" (a new instance) or "template" (a library template).
 */
export default function BlockEditDialog({
  mode, def, block = null, template = null, region = null, isAdmin = false, ctx = {}, entryName = "this page",
  onSave, onReset, onClose,
}) {
  const confirm = useConfirm();
  const startData = block?.data ?? template?.data ?? emptyData(def);
  const startCommon = block?.common ?? template?.common ?? {};
  const [data, setData] = useState(startData);
  const [common, setCommon] = useState(startCommon);
  const [lib, setLib] = useState({
    name: template?.name ?? "",
    region: template?.region ?? region ?? def.allowedRegions[0],
    placement: template?.placement ?? "end",
    lockPosition: template?.lock_position ?? false,
    lockContent: template?.lock_content ?? false,
    autoAdd: template?.auto_add ?? false,
  });
  const [errors, setErrors] = useState({});
  const [general, setGeneral] = useState([]);
  const [saving, setSaving] = useState(false);

  const initial = useMemo(() => JSON.stringify([startData, startCommon, lib]), []); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify([data, common, lib]) !== initial;

  const contentLocked = mode === "edit" && block && block.can_edit_content === false;
  const wholeLocked = mode === "edit" && block && block.can_edit === false;
  const readOnly = wholeLocked;
  const linkedTo = mode === "edit" && block?.template_id ? block.template_name : null;
  const variants = def.variants ?? {};

  async function close() {
    if (dirty && !readOnly && !(await confirm({ title: "Discard your changes?", body: "What you changed in this block has not been saved.", confirmLabel: "Discard", tone: "danger" }))) return;
    onClose();
  }

  async function save() {
    const dataToSend = cleanData(def.fields, data);
    const found = { ...validateFields(def.fields, dataToSend), ...commonErrors(common) };
    if (mode === "template" && !lib.name.trim()) found["library.name"] = "Give this template a name";
    setErrors(found);
    setGeneral([]);
    if (Object.keys(found).length) {
      setGeneral([{ message: "Some fields need attention. They are marked below." }]);
      return;
    }
    setSaving(true);
    try {
      await onSave({ data: contentLocked ? null : dataToSend, common: cleanCommon(common), library: lib });
    } catch (e) {
      const parsed = parseBlockError(e);
      const byPath = {};
      parsed.forEach((p) => { if (p.path) byPath[p.path] = p.message.replace(`${p.path}: `, ""); });
      setErrors(byPath);
      setGeneral(parsed);
      setSaving(false);
    }
  }

  const title = readOnly ? `View block · ${def.name}` : mode === "add" ? `Add block · ${def.name}` : mode === "template" ? `${template ? "Edit" : "New"} template · ${def.name}` : `Edit block · ${def.name}`;

  return (
    <Dialog
      wide
      title={title}
      onClose={close}
      footer={readOnly ? (
        <Button variant="primary" onClick={onClose}>Close</Button>
      ) : (
        <>
          <Button onClick={close} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={saving} loadingLabel="Saving…">{mode === "add" ? "Add block" : "Save"}</Button>
        </>
      )}
    >
      <div className="block-dialog" aria-live="polite">
        <p className="block-dialog__sub">
          {mode === "template" ? "Reusable in this directory's block library." : `On ${entryName} · allowed in ${def.allowedRegions.map(regionLabel).join(", ")}`}
        </p>
        {readOnly ? (
          <Callout tone="info">
            The directory administrator has locked this block. You can read it here, but not change it.
          </Callout>
        ) : contentLocked ? (
          <Callout tone="info">Its content is locked, so it follows the library template. You can change its settings. To change its content, edit the template in the block library.</Callout>
        ) : linkedTo ? (
          <Callout tone="info">
            This block follows the library template “{linkedTo}”. Changing its content makes this page's copy your own, and later template edits no longer reach it.
          </Callout>
        ) : null}
        {mode === "edit" && block?.template_id && !block?.linked ? (
          <Callout tone="info" action={!readOnly && onReset ? <Button size="sm" onClick={onReset}>Use the template again</Button> : null}>
            This page has its own version of “{block.template_name}”.
          </Callout>
        ) : null}
        {def.dataBound ? <Callout tone="info">This block shows information held for the {def.pageKinds.includes("entry") ? "entry" : "page"} automatically. You can set a section label here.</Callout> : null}
        {general.length ? (
          <Callout tone="danger" title="This could not be saved">
            <ul className="block-dialog__errors">{general.map((g, i) => <li key={i}>{g.message}</li>)}</ul>
          </Callout>
        ) : null}

        {mode === "template" ? (
          <Section title="Library settings">
            <FieldGrid>
              <Field label="Template name" required error={errors["library.name"]} hint="Shown to editors when they add a block from the library.">
                <TextInput value={lib.name} maxLength={120} onChange={(e) => setLib({ ...lib, name: e.target.value })} />
              </Field>
              <Field label="Region">
                <Select value={lib.region} disabled={!!template} options={def.allowedRegions.map((r) => ({ value: r, label: regionLabel(r) }))} onChange={(e) => setLib({ ...lib, region: e.target.value })} />
              </Field>
            </FieldGrid>
            <SegmentedControl label="Where it goes in the region" value={lib.placement} options={[{ value: "start", label: "At the start" }, { value: "end", label: "At the end" }]} onChange={(v) => setLib({ ...lib, placement: v })} />
            <Checkbox label="Add to every page" hint="New pages get it automatically. Use “Add to existing pages” in the library to add it to pages that already exist." checked={lib.autoAdd} onChange={(e) => setLib({ ...lib, autoAdd: e.target.checked })} />
            <Checkbox label="Lock position" hint="Editors cannot move or remove it. It stays at the start or end of its region." checked={lib.lockPosition} onChange={(e) => setLib({ ...lib, lockPosition: e.target.checked })} />
            <Checkbox label="Lock content" hint="Editors can see it but not change it. It always shows the template's content." checked={lib.lockContent} onChange={(e) => setLib({ ...lib, lockContent: e.target.checked })} />
          </Section>
        ) : null}

        <Section title="Content">
          {def.fields.length === 0 ? <p className="field-hint">This block has no content of its own to edit.</p> : (
            <BlockFieldSet fields={def.fields} data={data} onChange={setData} errors={errors} path="data" disabled={readOnly || contentLocked} ctx={ctx} />
          )}
        </Section>

        <details className="block-dialog__settings">
          <summary>Block settings</summary>
          <BlockFieldSet fields={COMMON_FIELDS} data={common} onChange={setCommon} errors={errors} path="common" disabled={readOnly} ctx={ctx} />
          {Object.entries(variants).map(([key, options]) => (
            <Field key={key} label={optionLabel(key)}>
              <Select
                disabled={readOnly}
                value={common.variants?.[key] ?? ""}
                options={[{ value: "", label: "Default" }, ...options.map((o) => ({ value: o, label: optionLabel(o) }))]}
                onChange={(e) => {
                  const next = { ...(common.variants ?? {}) };
                  if (e.target.value) next[key] = e.target.value; else delete next[key];
                  setCommon({ ...common, variants: next });
                }}
              />
            </Field>
          ))}
        </details>
      </div>
    </Dialog>
  );
}

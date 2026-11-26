import React from "react";
import {
  Button, Checkbox, CheckboxGroup, Field, FieldGrid, PlusIcon, SegmentedControl, Select, Textarea, TextInput, XIcon,
  ArrowUpIcon, ArrowDownIcon,
} from "../ui/index.js";
import RichTextEditor from "../directories/entryEdit/RichTextEditor.jsx";
import { ICON_NAMES, SPACING_OPTIONS, emptyData } from "../../lib/pageBlocks.js";

/**
 * Registry-driven form controls for block fields (scripts/block-registry.json).
 * `ctx` carries pickers' data: { terms: [{id, label}], entries: [{id, name}] }.
 * Errors are keyed by path ("data.items[0].heading"); each control reads its own.
 */

const optionLabel = (o) => String(o).replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

function ListRepeater({ def, value, onChange, errors, path, disabled, ctx }) {
  const items = Array.isArray(value) ? value : [];
  const max = def.max ?? 99;
  const move = (i, d) => {
    const next = items.slice();
    const [it] = next.splice(i, 1);
    next.splice(i + d, 0, it);
    onChange(next);
  };
  return (
    <fieldset className="block-list" disabled={disabled}>
      <legend className="field-label">{def.label}</legend>
      {errors[path] ? <span className="field-error">{errors[path]}</span> : null}
      {items.map((item, i) => (
        <div className="block-list__item" key={i}>
          <div className="block-list__head">
            <span className="block-list__n">{def.label.replace(/s$/, "")} {i + 1}</span>
            <span className="block-list__tools">
              <Button size="sm" variant="ghost" aria-label={`Move ${def.label} ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUpIcon /></Button>
              <Button size="sm" variant="ghost" aria-label={`Move ${def.label} ${i + 1} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDownIcon /></Button>
              <Button size="sm" variant="ghost" aria-label={`Remove ${def.label} ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}><XIcon /></Button>
            </span>
          </div>
          <BlockFieldSet fields={def.itemFields} data={item} onChange={(next) => onChange(items.map((x, j) => (j === i ? next : x)))} errors={errors} path={`${path}[${i}]`} disabled={disabled} ctx={ctx} />
        </div>
      ))}
      {items.length < max ? (
        <Button size="sm" onClick={() => onChange([...items, emptyData({ fields: def.itemFields })])}><PlusIcon /> Add {def.label.toLowerCase().replace(/s$/, "")}</Button>
      ) : null}
    </fieldset>
  );
}

function TextListRepeater({ def, value, onChange, errors, path, disabled }) {
  const items = Array.isArray(value) ? value : [];
  const max = def.max ?? 99;
  return (
    <fieldset className="block-list" disabled={disabled}>
      <legend className="field-label">{def.label}</legend>
      {errors[path] ? <span className="field-error">{errors[path]}</span> : null}
      {items.map((item, i) => (
        <div className="block-list__row" key={i}>
          <TextInput aria-label={`${def.label} ${i + 1}`} value={item} maxLength={def.itemMaxLength} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <Button size="sm" variant="ghost" aria-label={`Remove ${def.label} ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}><XIcon /></Button>
        </div>
      ))}
      {items.length < max ? <Button size="sm" onClick={() => onChange([...items, ""])}><PlusIcon /> Add item</Button> : null}
    </fieldset>
  );
}

function TableEditor({ def, value, onChange, errors, path, disabled }) {
  const rows = Array.isArray(value) && value.length ? value : [["", ""]];
  const cols = Math.max(...rows.map((r) => r.length), 1);
  const maxCols = def.maxColumns ?? 6;
  const maxRows = def.maxRows ?? 30;
  const set = (r, c, v) => onChange(rows.map((row, i) => (i === r ? Array.from({ length: cols }, (_, j) => (j === c ? v : row[j] ?? "")) : row)));
  return (
    <fieldset className="block-list" disabled={disabled}>
      <legend className="field-label">{def.label}</legend>
      {errors[path] ? <span className="field-error">{errors[path]}</span> : null}
      <div className="block-table">
        {/* gridTemplateColumns is dynamic: the number of columns is the editor's choice */}
        {rows.map((row, r) => (
          <div className="block-table__row" key={r} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr)) auto` }}>
            {Array.from({ length: cols }, (_, c) => (
              <TextInput key={c} aria-label={`Row ${r + 1}, column ${c + 1}`} value={row[c] ?? ""} onChange={(e) => set(r, c, e.target.value)} />
            ))}
            <Button size="sm" variant="ghost" aria-label={`Remove row ${r + 1}`} disabled={rows.length <= 1} onClick={() => onChange(rows.filter((_, i) => i !== r))}><XIcon /></Button>
          </div>
        ))}
      </div>
      <div className="block-list__tools">
        {rows.length < maxRows ? <Button size="sm" onClick={() => onChange([...rows, Array.from({ length: cols }, () => "")])}><PlusIcon /> Add row</Button> : null}
        {cols < maxCols ? <Button size="sm" onClick={() => onChange(rows.map((row) => [...Array.from({ length: cols }, (_, j) => row[j] ?? ""), ""]))}><PlusIcon /> Add column</Button> : null}
        {cols > 1 ? <Button size="sm" onClick={() => onChange(rows.map((row) => Array.from({ length: cols - 1 }, (_, j) => row[j] ?? "")))}>Remove last column</Button> : null}
      </div>
    </fieldset>
  );
}

function LinkControl({ def, value, onChange, errors, path, disabled, ctx }) {
  const v = value ?? { kind: "url", target: "", label: "" };
  const set = (patch) => onChange({ ...v, ...patch });
  const entries = ctx?.entries ?? [];
  return (
    <fieldset className="block-link" disabled={disabled}>
      <legend className="field-label">{def.label}{def.required ? <span className="field-required" aria-hidden="true">*</span> : null}</legend>
      <FieldGrid>
        <Field label="Link text"><TextInput value={v.label ?? ""} maxLength={80} onChange={(e) => set({ label: e.target.value })} /></Field>
        <Field label="Goes to">
          <Select value={v.kind ?? "url"} onChange={(e) => set({ kind: e.target.value, target: "" })}
            options={[{ value: "url", label: "A web address" }, { value: "anchor", label: "A heading on this page" }, ...(entries.length ? [{ value: "entry", label: "Another entry" }] : [])]} />
        </Field>
      </FieldGrid>
      {v.kind === "entry" ? (
        <Field label="Entry" error={errors[path]}>
          <Select value={v.target ?? ""} onChange={(e) => set({ target: e.target.value })} options={[{ value: "", label: "Choose an entry" }, ...entries.map((e) => ({ value: e.id, label: e.name }))]} />
        </Field>
      ) : (
        <Field label={v.kind === "anchor" ? "Anchor ID" : "Web address"} error={errors[path]} hint={v.kind === "anchor" ? "The Anchor ID set in another block's settings, e.g. fees." : "Start with https://, mailto: or tel:"}>
          <TextInput value={v.target ?? ""} onChange={(e) => set({ target: e.target.value.trim() })} />
        </Field>
      )}
    </fieldset>
  );
}

function ImageControl({ def, value, onChange, errors, path, disabled }) {
  const v = value ?? { url: "", alt: "" };
  const set = (patch) => onChange({ ...v, ...patch });
  return (
    <fieldset className="block-link" disabled={disabled}>
      <legend className="field-label">{def.label}{def.required ? <span className="field-required" aria-hidden="true">*</span> : null}</legend>
      <Field label="Image web address" error={errors[path]} hint="A public https:// address of the image.">
        <TextInput value={v.url ?? ""} onChange={(e) => set({ url: e.target.value.trim() })} />
      </Field>
      <Field label="Alt text" required={!!def.altTextRequired} hint="Describe the image for people who cannot see it.">
        <TextInput value={v.alt ?? ""} maxLength={200} onChange={(e) => set({ alt: e.target.value })} />
      </Field>
      {/^https?:\/\//i.test(v.url ?? "") ? <img className="block-link__thumb" src={v.url} alt="" /> : null}
    </fieldset>
  );
}

function MapControl({ def, value, onChange, disabled, ctx }) {
  const v = value ?? {};
  const terms = ctx?.terms ?? [];
  if (terms.length === 0) return <p className="field-hint">{def.label}: no categorisation terms are available to describe on this page.</p>;
  return (
    <fieldset className="block-list" disabled={disabled}>
      <legend className="field-label">{def.label}</legend>
      {def.note ? <span className="field-hint">{def.note}</span> : null}
      {terms.map((t) => (
        <Field key={t.id} label={t.label}>
          <TextInput value={v[t.id] ?? ""} maxLength={300} onChange={(e) => onChange({ ...v, [t.id]: e.target.value })} />
        </Field>
      ))}
    </fieldset>
  );
}

/** One field, by registry type. */
export function BlockField({ def, value, onChange, errors = {}, path, disabled = false, ctx = {} }) {
  const error = errors[path];
  const common = { disabled };
  const label = def.label;
  const count = def.maxLength && (def.type === "text" || def.type === "textarea") ? { value: (value ?? "").length, max: def.maxLength } : undefined;

  switch (def.type) {
    case "text":
      return <Field label={label} required={!!def.required} error={error} hint={def.note} count={count}><TextInput {...common} value={value ?? ""} onChange={(e) => onChange(e.target.value)} /></Field>;
    case "textarea":
      return <Field label={label} required={!!def.required} error={error} hint={def.note} count={count}><Textarea {...common} rows={3} value={value ?? ""} onChange={(e) => onChange(e.target.value)} /></Field>;
    case "richText":
    case "richTextBasic":
      return (
        <div className="field">
          <span className="field-label">{label}</span>
          <RichTextEditor value={value ?? ""} onChange={onChange} editable={!disabled} />
          {def.maxLength ? <span className="field-hint">Up to {def.maxLength} characters of text.</span> : null}
          {error ? <span className="field-error">{error}</span> : null}
        </div>
      );
    case "enum": {
      const opts = def.options.map((o) => ({ value: o, label: optionLabel(o) }));
      return opts.length <= 4 ? (
        <div className="field"><SegmentedControl label={label} value={value ?? def.options[0]} options={opts} onChange={onChange} />{error ? <span className="field-error">{error}</span> : null}</div>
      ) : (
        <Field label={label} error={error}><Select {...common} value={value ?? ""} options={opts} onChange={(e) => onChange(e.target.value)} /></Field>
      );
    }
    case "multiEnum":
      return <CheckboxGroup legend={label} disabled={disabled} options={def.options.map((o) => ({ value: o, label: optionLabel(o) }))} value={value ?? []} onChange={onChange} />;
    case "boolean":
      return <div className="field"><Checkbox {...common} label={label} hint={def.note} checked={!!value} onChange={(e) => onChange(e.target.checked)} /></div>;
    case "number":
      return <Field label={label} error={error}><TextInput {...common} type="number" min={def.min} max={def.max} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} /></Field>;
    case "slug":
      return <Field label={label} required={!!def.required} error={error} hint="Lowercase letters, numbers and hyphens."><TextInput {...common} value={value ?? ""} onChange={(e) => onChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} /></Field>;
    case "tokenRef":
      return <Field label={label}><Select {...common} value={value ?? ""} options={SPACING_OPTIONS} onChange={(e) => onChange(e.target.value)} /></Field>;
    case "icon":
      return <Field label={label}><Select {...common} value={value ?? ""} options={[{ value: "", label: "No icon" }, ...ICON_NAMES.map((n) => ({ value: n, label: optionLabel(n) }))]} onChange={(e) => onChange(e.target.value)} /></Field>;
    case "taxonomyRef":
      return (
        <Field label={label}>
          <Select {...common} value={value ?? ""} options={[{ value: "", label: "None" }, ...(ctx.terms ?? []).map((t) => ({ value: t.id, label: t.label }))]} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    case "link":
      return <LinkControl def={def} value={value} onChange={onChange} errors={errors} path={path} disabled={disabled} ctx={ctx} />;
    case "image":
      return <ImageControl def={def} value={value} onChange={onChange} errors={errors} path={path} disabled={disabled} />;
    case "list":
      return <ListRepeater def={def} value={value} onChange={onChange} errors={errors} path={path} disabled={disabled} ctx={ctx} />;
    case "textList":
      return <TextListRepeater def={def} value={value} onChange={onChange} errors={errors} path={path} disabled={disabled} />;
    case "table":
      return <TableEditor def={def} value={value} onChange={onChange} errors={errors} path={path} disabled={disabled} />;
    case "map":
      return <MapControl def={def} value={value} onChange={onChange} disabled={disabled} ctx={ctx} />;
    default:
      return <p className="field-hint">{label} cannot be edited here yet.</p>;
  }
}

/** All fields of a block (or list item), honouring the registry's requiredWhen/visibility conventions. */
export function BlockFieldSet({ fields, data, onChange, errors = {}, path = "data", disabled = false, ctx = {} }) {
  return (
    <div className="block-fields">
      {fields.map((f) => (
        <BlockField
          key={f.key}
          def={f}
          value={data?.[f.key]}
          onChange={(v) => onChange({ ...data, [f.key]: v })}
          errors={errors}
          path={`${path}.${f.key}`}
          disabled={disabled}
          ctx={ctx}
        />
      ))}
    </div>
  );
}

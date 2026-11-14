import React, { cloneElement, forwardRef, isValidElement, useEffect, useId, useRef, useState } from "react";
import { checkContrast, contrastLevel } from "../../lib/colorContrast.js";
import { useSettingRow } from "./layout.jsx";
import { XIcon, PlusIcon } from "./icons.jsx";

/**
 * Field owns label, hint, error, required marker and id wiring. Never render a bare input in a page.
 * @param {{ label: string, hint?: React.ReactNode, error?: string, required?: boolean,
 *   count?: {value: number, max: number}, children: React.ReactElement }} props
 */
export function Field({ label, hint, error, required = false, count, children, className = "", ...rest }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id: children.props.id || id,
        "aria-describedby": [children.props["aria-describedby"], describedBy].filter(Boolean).join(" ") || undefined,
        "aria-invalid": error ? true : children.props["aria-invalid"],
        required: required || children.props.required,
      })
    : children;
  const forId = isValidElement(children) ? children.props.id || id : undefined;
  return (
    <div className={`field ${className}`.trim()} {...rest}>
      <label htmlFor={forId}>
        {label}
        {required ? <span className="field-required" aria-hidden="true">*</span> : null}
      </label>
      {control}
      {count ? (
        <span className="field-count" aria-live="off">{count.value}/{count.max}</span>
      ) : null}
      {hint && !error ? <span id={hintId} className="field-hint">{hint}</span> : null}
      {hint && error ? <span id={hintId} className="sr-only">{hint}</span> : null}
      {error ? <span id={errorId} className="field-error">{error}</span> : null}
    </div>
  );
}

export const TextInput = forwardRef(function TextInput({ className = "", type = "text", ...rest }, ref) {
  return <input ref={ref} type={type} className={`input ${className}`.trim()} {...rest} />;
});

/** Native select styled as .select. Use a Mantine wrapper only if you need search-in-select. */
export const Select = forwardRef(function Select({ className = "", options, children, ...rest }, ref) {
  return (
    <select ref={ref} className={`select ${className}`.trim()} {...rest}>
      {options
        ? options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)
        : children}
    </select>
  );
});

export const Textarea = forwardRef(function Textarea({ className = "", rows = 4, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={`textarea ${className}`.trim()} {...rest} />;
});

/** @param {{ label: React.ReactNode, hint?: React.ReactNode }} props */
export const Checkbox = forwardRef(function Checkbox({ label, hint, className = "", ...rest }, ref) {
  return (
    <label className={`check ${className}`.trim()}>
      <input ref={ref} type="checkbox" {...rest} />
      <span className="check-text">
        <span className="check-label">{label}</span>
        {hint ? <span className="field-hint">{hint}</span> : null}
      </span>
    </label>
  );
});

/** Grouped checkboxes in a fieldset. `options`: [{value, label, hint?}] */
export function CheckboxGroup({ legend, options, value = [], onChange, disabled, className = "" }) {
  const toggle = (v) => onChange?.(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <fieldset className={`choice-group ${className}`.trim()} disabled={disabled}>
      <legend className="field-label">{legend}</legend>
      {options.map((o) => (
        <Checkbox key={o.value} label={o.label} hint={o.hint} checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
      ))}
    </fieldset>
  );
}

/** Two-up grid; collapses to one column under 720px. */
export function FieldGrid({ className = "", children, ...rest }) {
  return <div className={`field-grid ${className}`.trim()} {...rest}>{children}</div>;
}

/**
 * Switch: <button role="switch">. Inside a SettingRow its name and description come from the row.
 * @param {{ checked: boolean, onChange: (next: boolean) => void, disabled?: boolean }} props
 */
export function Switch({ checked, onChange, disabled, className = "", ...rest }) {
  const row = useSettingRow();
  const labelled = rest["aria-label"] || rest["aria-labelledby"] ? {} : row ? { "aria-labelledby": row.labelId, "aria-describedby": row.descId } : {};
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked ? "true" : "false"}
      disabled={disabled}
      className={`switch ${className}`.trim()}
      onClick={() => onChange?.(!checked)}
      {...labelled}
      {...rest}
    />
  );
}

/**
 * Segmented control (2-4 options). role=radiogroup; arrow keys move the selection.
 * @param {{ label: string, value: string, options: {value: string, label: string}[], onChange: (v: string) => void }} props
 */
export function SegmentedControl({ label, value, options, onChange, className = "" }) {
  const refs = useRef([]);
  const onKeyDown = (e) => {
    const i = options.findIndex((o) => o.value === value);
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % options.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + options.length) % options.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    if (next >= 0) {
      e.preventDefault();
      onChange(options[next].value);
      refs.current[next]?.focus();
    }
  };
  return (
    <div role="radiogroup" aria-label={label} className={`segmented ${className}`.trim()} onKeyDown={onKeyDown}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={on ? "true" : "false"}
            tabIndex={on || (!value && i === 0) ? 0 : -1}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * RadioCards: fieldset of selectable cards, for options that need a description or thumbnail.
 * `options`: [{value, label, description?, content?}]
 */
export function RadioCards({ legend, name, value, options, onChange, className = "" }) {
  const auto = useId();
  return (
    <fieldset className={`radio-cards ${className}`.trim()}>
      <legend className="field-label">{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className="radio-card">
          <input type="radio" name={name || auto} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.content}
          <span className="setting-row-label">{o.label}</span>
          {o.description ? <span className="setting-row-desc">{o.description}</span> : null}
        </label>
      ))}
    </fieldset>
  );
}

/** WCAG readability badge. `contrast` is checkContrast()'s result; `base` renders the neutral "Base colour" badge. */
export function ContrastBadge({ contrast, base }) {
  if (base) return <span className="pill pill--neutral">Base colour</span>;
  if (!contrast) return null;
  const level = contrastLevel(contrast.ratio);
  const tone = level.tone === "good" ? "live" : level.tone === "warn" ? "warn" : "danger";
  return (
    <span className={`pill pill--${tone}`} title={`Contrast ${contrast.ratio.toFixed(2)}:1 against its background`}>
      {level.label} · {contrast.ratio.toFixed(1)}:1
    </span>
  );
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Swatch + name + purpose + hex input + optional contrast badge. */
export function ColourField({ label, hint, value, onChange, contrast, base, disabled }) {
  const id = useId();
  const hexOk = HEX.test(value || "");
  return (
    <div className="colour-field">
      <input type="color" className="swatch" aria-label={`${label} colour picker`} value={hexOk ? value : "#000000"} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      <div className="colour-field-text">
        <label htmlFor={id} className="field-label">{label}</label>
        {hint ? <span className="field-hint">{hint}</span> : null}
      </div>
      <input id={id} className="input colour-field-hex" value={value || ""} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      <ContrastBadge contrast={contrast} base={base} />
    </div>
  );
}

/**
 * Colour token that may be left unset. `value` is the stored hex (or undefined), `fallback` the colour used
 * while unset. Typing only commits a valid #rrggbb; anything else shows an error and is never stored.
 */
export function OptionalColourField({ label, hint, value, fallback, onChange, contrast }) {
  const id = useId();
  const [text, setText] = useState(value || "");
  useEffect(() => setText(value || ""), [value]);
  const invalid = text !== "" && !HEX.test(text);
  const commit = (next) => {
    setText(next);
    if (next === "") onChange(undefined);
    else if (HEX.test(next)) onChange(next);
  };
  return (
    <div className="colour-field">
      <input type="color" className="swatch" aria-label={`${label} colour picker`} value={value || fallback} onChange={(e) => commit(e.target.value)} />
      <div className="colour-field-text">
        <label htmlFor={id} className="field-label">{label}</label>
        {hint ? <span className="field-hint">{hint}</span> : null}
        {invalid ? <span className="field-error" role="alert">Use a hex colour like #2E5A39. This value won&apos;t be saved.</span> : null}
      </div>
      <input id={id} className="input colour-field-hex" value={text} placeholder={fallback} aria-invalid={invalid} onChange={(e) => commit(e.target.value)} />
      <ContrastBadge contrast={contrast} />
    </div>
  );
}

/** Contrast of `fg` against a hex colour or RegionBackground (gradients: worst stop wins). */
export function contrastOf(fg, bg, opts) {
  return checkContrast(fg, bg, opts);
}

/**
 * TagPicker: removable chips plus a dashed "+ Add {thing}" button.
 * @param {{ items: {id: string, name: string}[], onRemove: (id: string) => void, onAdd: () => void, addLabel: string }} props
 */
export function TagPicker({ items, onRemove, onAdd, addLabel, disabled, className = "" }) {
  return (
    <div className={`tag-picker ${className}`.trim()}>
      {items.map((t) => (
        <span key={t.id} className="chip-removable">
          {t.name}
          <button type="button" className="chip-remove" aria-label={`Remove ${t.name}`} disabled={disabled} onClick={() => onRemove(t.id)}>
            <XIcon size={14} />
          </button>
        </span>
      ))}
      <button type="button" className="chip-add" onClick={onAdd} disabled={disabled}>
        <PlusIcon size={14} />
        {addLabel}
      </button>
    </div>
  );
}

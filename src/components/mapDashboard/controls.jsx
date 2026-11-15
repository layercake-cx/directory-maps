import React, { forwardRef, useRef } from "react";
import { Button, Field, Pill, RadioCards } from "../ui";

/**
 * Range slider with a visible value, for use as the single child of Field (Field clones `id` and aria props onto it).
 * @param {{ value: number, onChange: (next: number) => void, min: number, max: number, step?: number, display?: React.ReactNode }} props
 */
export const RangeControl = forwardRef(function RangeControl({ value, onChange, min, max, step = 1, display, className = "", ...rest }, ref) {
  return (
    <div className={`md-range ${className}`.trim()}>
      <input
        ref={ref}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={display != null ? String(display) : undefined}
        onChange={(e) => onChange(Number(e.target.value))}
        {...rest}
      />
      <output htmlFor={rest.id} className="md-range-value">{display ?? value}</output>
    </div>
  );
});

/**
 * Labelled slider. `display` is the text shown beside it ("12px", "50%", "Medium").
 * @param {{ label: string, hint?: React.ReactNode, value: number, onChange: (n: number) => void, min: number, max: number,
 *   step?: number, display?: React.ReactNode }} props
 */
export function RangeField({ label, hint, value, onChange, min, max, step = 1, display }) {
  return (
    <Field label={label} hint={hint}>
      <RangeControl value={value} onChange={onChange} min={min} max={max} step={step} display={display} />
    </Field>
  );
}

/**
 * Button that opens a hidden file input. The input keeps its own onChange (handlers stay in the page).
 * @param {{ children: React.ReactNode, accept: string, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
 *   disabled?: boolean, loading?: boolean, loadingLabel?: string }} props
 */
export function FileButton({ children, accept, onChange, disabled, loading, loadingLabel, size = "sm" }) {
  const ref = useRef(null);
  return (
    <>
      <Button size={size} disabled={disabled} loading={loading} loadingLabel={loadingLabel} onClick={() => ref.current?.click()}>
        {children}
      </Button>
      <input ref={ref} type="file" accept={accept} onChange={onChange} disabled={disabled || loading} hidden />
    </>
  );
}

/** Auto-save status for the design tabs: "" | "saving" | "saved". */
export function DraftStatus({ status, savedLabel = "Draft saved" }) {
  return (
    <div className="md-draft-status" role="status" aria-live="polite">
      {status ? <Pill tone={status === "saving" ? "neutral" : "ok"}>{status === "saving" ? "Saving…" : savedLabel}</Pill> : null}
    </div>
  );
}

/**
 * RadioCards that report every click on an option, including a click on the one already selected (the tiles this
 * replaces were buttons, which always fired). `onSelect(value)` is the only handler; selection state is the page's.
 * @param {{ onSelect: (value: string) => void }} props plus RadioCards props
 */
export function ChoiceCards({ onSelect, ...cards }) {
  return (
    <div
      onClick={(e) => {
        if (e.target instanceof HTMLInputElement && e.target.type === "radio") onSelect(e.target.value);
      }}
    >
      <RadioCards {...cards} onChange={() => {}} />
    </div>
  );
}

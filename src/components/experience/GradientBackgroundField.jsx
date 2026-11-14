import React, { useId, useState } from "react";
import { Button, ColourField, SegmentedControl, TextInput, XIcon } from "../ui/index.js";
import { backgroundToCss } from "../../lib/directoryThemeDraft.js";
import "../../styles/wave-a/batch-4.css";

const MAX_STOPS = 4;
const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Slider with an optional number box, in the kit's Field structure (label, control, hint).
 * The kit's Field wraps a single control, so this composes the same classes around a row.
 */
export function RangeField({ label, hint, value, min, max, onChange, number }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="b4-range-row">
        <input id={id} type="range" min={min} max={max} value={value} aria-describedby={hintId} onChange={(e) => onChange(Number(e.target.value))} />
        {number ? (
          <>
            <TextInput
              className="b4-input-xs"
              type="number"
              aria-label={number.label}
              min={min}
              max={max}
              value={value}
              onChange={(e) => number.onChange(e)}
            />
            <span className="field-hint">{number.unit}</span>
          </>
        ) : null}
      </div>
      {hint ? <span id={hintId} className="field-hint">{hint}</span> : null}
    </div>
  );
}

function StopRow({ stop, index, onChange, onRemove, canRemove }) {
  return (
    <div className="b4-stoprow">
      <input type="color" className="swatch" aria-label={`Stop ${index + 1} colour picker`} value={HEX.test(stop.color || "") ? stop.color : "#FFFFFF"} onChange={(e) => onChange({ ...stop, color: e.target.value })} />
      <TextInput className="b4-input-sm" aria-label={`Stop ${index + 1} hex`} value={stop.color || ""} onChange={(e) => onChange({ ...stop, color: e.target.value })} />
      <TextInput className="b4-input-xs" type="number" min={0} max={100} aria-label={`Stop ${index + 1} position percent`} value={stop.position ?? 0} onChange={(e) => onChange({ ...stop, position: Number(e.target.value) })} />
      <span className="field-hint">%</span>
      {canRemove && (
        <Button variant="ghost" size="sm" iconOnly aria-label={`Remove stop ${index + 1}`} onClick={onRemove}>
          <XIcon />
        </Button>
      )}
    </div>
  );
}

/**
 * Solid / gradient background editor for one page region (header, footer). `value` is a
 * RegionBackground object or undefined (unset = fallbackColor, matching generate_directory_site).
 * `collapseStops` hides the stop rows behind an "Edit colour stops (n)" disclosure.
 */
export default function GradientBackgroundField({ label = "Background", name, value, onChange, fallbackColor, disabled, collapseStops }) {
  const bg = value || { type: "solid", color: fallbackColor };
  const isGradient = bg.type === "gradient";
  const stops = bg.gradient?.stops || [];
  const [stopsOpen, setStopsOpen] = useState(!collapseStops);

  function switchType(type) {
    if (type === "gradient" && !bg.gradient) {
      onChange({
        ...bg,
        type,
        gradient: { type: "linear", angle: 135, stops: [{ color: bg.color || fallbackColor, position: 0 }, { color: "#FFFFFF", position: 100 }] },
      });
    } else {
      onChange({ ...bg, type });
    }
  }
  const updateGradient = (patch) => onChange({ ...bg, gradient: { ...bg.gradient, ...patch } });
  const gType = bg.gradient?.type || "linear";

  return (
    <fieldset disabled={disabled} className="b4-gradient" data-name={name}>
      <legend className="field-label">{label}</legend>
      <SegmentedControl label={`${label} type`} value={isGradient ? "gradient" : "solid"} onChange={switchType} options={[{ value: "solid", label: "Solid" }, { value: "gradient", label: "Gradient" }]} />

      {!isGradient && (
        <ColourField label="Solid" value={bg.color || ""} onChange={(v) => onChange({ ...bg, type: "solid", color: v })} disabled={disabled} />
      )}

      {isGradient && (
        <div className="b4-stack">
          {/* dynamic: the gradient being edited */}
          <div aria-hidden="true" className="b4-gradient-bar" style={{ background: backgroundToCss(bg, fallbackColor) }} />
          <div className="b4-row">
            <SegmentedControl label="Gradient shape" value={gType} onChange={(v) => updateGradient({ type: v })} options={[{ value: "linear", label: "Linear" }, { value: "radial", label: "Radial" }]} />
            {gType === "linear" && (
              <RangeField label={`Angle (${bg.gradient?.angle ?? 135}°)`} min={0} max={360} value={bg.gradient?.angle ?? 135} onChange={(v) => updateGradient({ angle: v })} />
            )}
          </div>
          {collapseStops && (
            <Button size="sm" aria-expanded={stopsOpen} onClick={() => setStopsOpen((v) => !v)}>
              {stopsOpen ? "Hide colour stops" : `Edit colour stops (${stops.length})`}
            </Button>
          )}
          {stopsOpen && (
            <div className="b4-stops">
              {stops.map((stop, i) => (
                <StopRow
                  key={i}
                  stop={stop}
                  index={i}
                  canRemove={stops.length > 2}
                  onChange={(next) => updateGradient({ stops: stops.map((s, si) => (si === i ? next : s)) })}
                  onRemove={() => updateGradient({ stops: stops.filter((_, si) => si !== i) })}
                />
              ))}
              {stops.length < MAX_STOPS && (
                <Button size="sm" onClick={() => updateGradient({ stops: [...stops, { color: "#FFFFFF", position: 100 }] })}>
                  Add colour stop
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </fieldset>
  );
}

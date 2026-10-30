import React, { useId, useState } from "react";
import { SegmentedControl } from "./ui.jsx";
import { backgroundToCss } from "../../lib/directoryThemeDraft.js";

const MAX_STOPS = 4;

function StopRow({ stop, index, onChange, onRemove, canRemove }) {
  return (
    <div className="xp-stoprow">
      <input type="color" className="xp-swatch" aria-label={`Stop ${index + 1} colour picker`} value={/^#[0-9a-fA-F]{6}$/.test(stop.color || "") ? stop.color : "#FFFFFF"} onChange={(e) => onChange({ ...stop, color: e.target.value })} />
      <input className="xp-input" style={{ width: 100 }} aria-label={`Stop ${index + 1} hex`} value={stop.color || ""} onChange={(e) => onChange({ ...stop, color: e.target.value })} />
      <input className="xp-input" style={{ width: 70 }} type="number" min={0} max={100} aria-label={`Stop ${index + 1} position percent`} value={stop.position ?? 0} onChange={(e) => onChange({ ...stop, position: Number(e.target.value) })} />
      <span className="xp-help">%</span>
      {canRemove && (
        <button type="button" className="xp-iconbtn" aria-label={`Remove stop ${index + 1}`} onClick={onRemove}>×</button>
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
  const solidId = useId();

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
    <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 10, minWidth: 0 }}>
      <legend style={{ fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 6 }}>{label}</legend>
      <SegmentedControl label={`${label} type`} name={`${name}-type`} value={isGradient ? "gradient" : "solid"} onChange={switchType} options={[{ value: "solid", label: "Solid" }, { value: "gradient", label: "Gradient" }]} />

      {!isGradient && (
        <div className="xp-row">
          <input type="color" className="xp-swatch" aria-label={`${label} colour picker`} value={/^#[0-9a-fA-F]{6}$/.test(bg.color || "") ? bg.color : "#FFFFFF"} onChange={(e) => onChange({ ...bg, type: "solid", color: e.target.value })} />
          <label htmlFor={solidId} style={{ position: "absolute", left: -9999 }}>{label} hex</label>
          <input id={solidId} className="xp-input" style={{ width: 130 }} value={bg.color || ""} onChange={(e) => onChange({ ...bg, type: "solid", color: e.target.value })} />
        </div>
      )}

      {isGradient && (
        <div style={{ display: "grid", gap: 10 }}>
          <div aria-hidden="true" style={{ height: 24, borderRadius: 6, border: "1px solid var(--lc-border)", background: backgroundToCss(bg, fallbackColor) }} />
          <div className="xp-row">
            <SegmentedControl label="Gradient shape" name={`${name}-shape`} value={gType} onChange={(v) => updateGradient({ type: v })} options={[{ value: "linear", label: "Linear" }, { value: "radial", label: "Radial" }]} />
            {gType === "linear" && (
              <label className="xp-row" style={{ fontSize: 13 }}>
                Angle ({bg.gradient?.angle ?? 135}°)
                <input type="range" min={0} max={360} value={bg.gradient?.angle ?? 135} onChange={(e) => updateGradient({ angle: Number(e.target.value) })} />
              </label>
            )}
          </div>
          {collapseStops && (
            <button type="button" className="xp-btn" style={{ justifySelf: "start" }} aria-expanded={stopsOpen} onClick={() => setStopsOpen((v) => !v)}>
              {stopsOpen ? "Hide colour stops" : `Edit colour stops (${stops.length})`}
            </button>
          )}
          {stopsOpen && (
            <div className="xp-stops">
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
                <button type="button" className="xp-btn" style={{ justifySelf: "start" }} onClick={() => updateGradient({ stops: [...stops, { color: "#FFFFFF", position: 100 }] })}>
                  + Add colour stop
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </fieldset>
  );
}

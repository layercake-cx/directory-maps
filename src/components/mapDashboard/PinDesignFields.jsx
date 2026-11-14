import React from "react";
import { Button, ColourField, SegmentedControl, Section } from "../ui";
import { markerIconDataUrl, pinPreviewScale, MARKER_ANCHORS } from "../../lib/markerIcons";
import { PIN_STYLES } from "./mapDashboardData.js";
import { ChoiceCards, FileButton, RangeField } from "./controls.jsx";

/*
 * Pin design sections shared by the map-wide Pin design tab and the per-group override editor.
 * Each section is controlled: the page (or MapGroupDesignEditor) owns the values and the save behaviour.
 */

const SIZE_OPTIONS = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg";
const PIN_ACCEPT = "image/svg+xml,image/png,.svg,.png";

/**
 * Reads a small image file as a data URL (pin icon). Mirrors the original inline handler: 48KB cap, clears the error on success.
 */
export function readPinIconFile(e, { onValue, onError }) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 48 * 1024) {
    onError("Image must be under 48KB.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    onValue(reader.result || "");
    onError("");
  };
  reader.readAsDataURL(file);
  e.target.value = "";
}

/**
 * Pin style tiles (Pin, Rounded pin, Dot, Custom icon) plus the size control.
 * `design`: { color, borderColor, borderWidth, faviconUrl, dropShadowPx, dropShadowDistance, dropShadowOpacity, customUrl } is what the previews draw.
 * @param {{ idPrefix: string, styleValue: string, onStyleChange: (id: string) => void, design: object, pinSize: string,
 *   onPinSizeChange: (id: string) => void, customFileInputRef: React.RefObject, onCustomFile: Function,
 *   sizeLabel?: string, onUseDefaultSize?: (() => void) | null }} props
 */
export function PinStyleSection({
  idPrefix, styleValue, onStyleChange, design, pinSize, onPinSizeChange, customFileInputRef, onCustomFile,
  sizeLabel = "Pin size", onUseDefaultSize = null,
}) {
  const scale = pinPreviewScale(pinSize);
  const options = PIN_STYLES.map(({ id, label }) => {
    const isCustom = id === "custom";
    const src = isCustom && design.customUrl
      ? design.customUrl
      : !isCustom
        ? markerIconDataUrl(id, design.color, {
            borderColor: design.borderColor,
            borderWidth: design.borderWidth,
            pinFaviconUrl: (id === "pin" || id === "teardrop") ? design.faviconUrl : undefined,
            dropShadowPx: design.dropShadowPx,
            dropShadowDistance: design.dropShadowDistance,
            dropShadowOpacity: design.dropShadowOpacity,
          })
        : null;
    const anchor = (MARKER_ANCHORS[id] || MARKER_ANCHORS.pin).scaledSize;
    return {
      value: id,
      label,
      content: (
        <span className="md-pin-preview">
          {src ? (
            <img
              src={src}
              alt=""
              width={Math.round(anchor.w * 0.75)}
              height={Math.round(anchor.h * 0.75)}
              style={{ transform: `scale(${scale})` }} /* dynamic: preview scales with the chosen pin size */
            />
          ) : (
            <span className="md-pin-upload">Upload</span>
          )}
        </span>
      ),
    };
  });
  return (
    <Section as="h3" title="Style">
      <ChoiceCards
        className="md-radio-grid md-hide-legend"
        legend="Pin style"
        name={`${idPrefix}-style`}
        value={styleValue}
        options={options}
        onSelect={(id) => {
          if (id === "custom" && !design.customUrl) customFileInputRef.current?.click();
          else onStyleChange(id);
        }}
      />
      <input ref={customFileInputRef} type="file" accept={PIN_ACCEPT} onChange={onCustomFile} hidden />
      <SegmentedControl label={sizeLabel} value={pinSize} options={SIZE_OPTIONS} onChange={onPinSizeChange} />
      {onUseDefaultSize ? (
        <div className="md-actions">
          <Button size="sm" onClick={onUseDefaultSize}>Use map default</Button>
        </div>
      ) : null}
    </Section>
  );
}

/** Uploaded custom pin icon: preview, upload/change, and any extra action (Remove, Use map default). */
export function CustomIconSection({ url, uploading, onFile, extraAction }) {
  return (
    <Section as="h3" title="Custom icon" description="SVG or PNG, up to 200KB. Shown exactly as uploaded — colour, outline and drop-shadow don't apply to custom icons.">
      <div className="md-upload-row">
        {url ? <img className="md-icon-preview" src={url} alt="" /> : null}
        <FileButton accept={PIN_ACCEPT} onChange={onFile} loading={uploading} loadingLabel="Uploading…">
          {url ? "Change…" : "Upload icon"}
        </FileButton>
        {extraAction}
      </div>
    </Section>
  );
}

/**
 * Colours for the pin (marker, border, cluster) and border size / cluster transparency sliders.
 * `cluster` is null when clustering is off or not editable here (the per-group editor).
 * @param {{ title?: string, marker: object, border: object, borderSize: object, cluster?: { color: object, opacity: object } | null }} props
 * Each colour/slider is `{ value, onChange }`.
 */
export function PinColoursSection({ marker, border, borderSize, cluster = null }) {
  return (
    <Section as="h3" title="Colours">
      <ColourField label="Marker colour" value={marker.value} onChange={marker.onChange} />
      <ColourField label="Border colour" value={border.value} onChange={border.onChange} />
      {cluster ? <ColourField label="Cluster colour" value={cluster.color.value} onChange={cluster.color.onChange} /> : null}
      <RangeField label="Pin border size" min={0} max={15} value={borderSize.value} onChange={borderSize.onChange} display={`${borderSize.value}px`} />
      {cluster ? (
        <RangeField label="Cluster transparency" min={0} max={100} value={cluster.opacity.value} onChange={cluster.opacity.onChange} display={`${cluster.opacity.value}%`} />
      ) : null}
    </Section>
  );
}

/** Cluster colour and transparency only (used when pins are custom icons, so pin colours do not apply). */
export function ClusterColoursSection({ color, opacity }) {
  return (
    <Section as="h3" title="Cluster colours">
      <ColourField label="Cluster colour" value={color.value} onChange={color.onChange} />
      <RangeField label="Cluster transparency" min={0} max={100} value={opacity.value} onChange={opacity.onChange} display={`${opacity.value}%`} />
    </Section>
  );
}

/** Drop shadow size, distance and transparency. Transparency is shown inverted (100 - opacity), as before. */
export function DropShadowSection({ size, distance, opacity }) {
  return (
    <Section as="h3" title="Drop shadow">
      <RangeField label="Size" min={0} max={30} value={size.value} onChange={size.onChange} display={size.value} />
      <RangeField label="Distance from pin" min={0} max={30} value={distance.value} onChange={distance.onChange} display={distance.value} />
      <RangeField
        label="Transparency"
        min={0}
        max={100}
        value={100 - opacity.value}
        onChange={(n) => opacity.onChange(100 - n)}
        display={`${100 - opacity.value}%`}
      />
    </Section>
  );
}

/**
 * Small icon drawn inside the pin (favicon). `actions` holds the extra buttons (Remove, No icon, Use map default).
 */
export function PinIconSection({ title = "Pin icon", description, url, onValue, onError, actions }) {
  return (
    <Section as="h3" title={title} description={description}>
      <div className="md-upload-row">
        {url ? <img className="md-icon-preview md-icon-preview--sm" src={url} alt="" /> : null}
        <FileButton accept={IMAGE_ACCEPT} onChange={(e) => readPinIconFile(e, { onValue, onError })}>
          {url ? "Change…" : "Upload icon"}
        </FileButton>
        {actions}
      </div>
    </Section>
  );
}

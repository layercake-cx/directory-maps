import React from "react";
import { Button, EmptyState } from "../ui";
import { normalizePinSize } from "../../lib/markerIcons";
import {
  CustomIconSection, PinColoursSection, PinIconSection, PinStyleSection,
} from "./PinDesignFields.jsx";

/**
 * Groups tab: drag to reorder, then edit one group's design overrides.
 * Drag state, saving and the override values live in the page; this renders them.
 * @param {object} props
 */
export default function MapGroupsPanel({
  orderedGroups, onDragStart, onDragOver, onDrop, onEditGroup, onSaveOrder, savingGroups, editor,
}) {
  return (
    <div className="md-stack">
      <p className="md-intro">Drag to reorder groups. Order is used in the embed map search bar.</p>
      {orderedGroups.length === 0 ? (
        <EmptyState art="none" title="No groups yet" body="Add groups when importing data." />
      ) : (
        <ul className="md-group-list">
          {orderedGroups.map((gr, index) => (
            <li
              key={gr.id}
              className="md-group-item"
              draggable
              onDragStart={(e) => onDragStart(e, index)}
              onDragOver={onDragOver}
              onDrop={(e) => onDrop(e, index)}
            >
              <span className="md-grip" aria-hidden="true" />
              <span className="md-group-name">{gr.name || "—"}</span>
              <Button size="sm" onClick={() => onEditGroup(gr)}>Edit design</Button>
            </li>
          ))}
        </ul>
      )}
      <div className="md-actions">
        <Button variant="primary" onClick={onSaveOrder} loading={savingGroups} loadingLabel="Saving…" disabled={orderedGroups.length === 0}>
          Save order
        </Button>
      </div>
      {editor}
    </div>
  );
}

/**
 * Per-group design overrides. `design` is the group's override object (or null); `globalDesign` is the map-wide design it
 * falls back to. Every change goes through `onChange((prev) => next)`, the page's setGroupEditDesign.
 * @param {object} props
 */
export function MapGroupDesignEditor({
  group, design, globalDesign, onChange, fileInputRef, onCustomFile, customPinUploading, saving, onReset, onClose, onError,
}) {
  const set = (patch) => onChange((p) => ({ ...(p || {}), ...patch }));
  const styleValue = design?.marker_style ?? globalDesign.marker_style;
  const customUrl = design?.custom_pin_url ?? globalDesign.custom_pin_url;
  const effectiveSize = normalizePinSize(design?.pinSize ?? globalDesign.pinSize);
  const faviconMode = design?.pin_favicon_mode ?? "inherit";
  const previewFavicon = faviconMode === "custom"
    ? design?.pin_favicon_url
    : faviconMode === "off"
      ? undefined
      : globalDesign.pin_favicon_url || undefined;
  const previewDesign = {
    color: design?.marker_color ?? globalDesign.marker_color,
    borderColor: design?.pinBorderColor ?? globalDesign.pinBorderColor,
    borderWidth: design?.pinBorderSize ?? globalDesign.pinBorderSize,
    faviconUrl: previewFavicon,
    dropShadowPx: globalDesign.pinDropShadow,
    dropShadowDistance: globalDesign.pinShadowDistance,
    dropShadowOpacity: globalDesign.pinShadowOpacity,
    customUrl,
  };
  return (
    <div className="md-group-editor">
      <h3 className="md-group-editor-title">Group design overrides</h3>
      <p className="md-intro">
        Editing: <strong>{group?.name || "Untitled group"}</strong>
      </p>
      <p className="md-muted">Override global design for this group&apos;s pins. Leave as default to use map design.</p>
      <div className="md-stack">
        <PinStyleSection
          idPrefix="group-pin"
          styleValue={styleValue}
          onStyleChange={(id) => set({ marker_style: id })}
          design={previewDesign}
          pinSize={effectiveSize}
          onPinSizeChange={(id) => set({ pinSize: id })}
          sizeLabel="Pin size for this category"
          customFileInputRef={fileInputRef}
          onCustomFile={onCustomFile}
          onUseDefaultSize={design?.pinSize != null ? () => set({ pinSize: null }) : null}
        />

        {styleValue === "custom" ? (
          <CustomIconSection
            url={customUrl}
            uploading={customPinUploading}
            onFile={onCustomFile}
            extraAction={design?.custom_pin_url ? <Button size="sm" onClick={() => set({ custom_pin_url: null })}>Use map default</Button> : null}
          />
        ) : null}

        {styleValue !== "custom" ? (
          <PinColoursSection
            marker={{ value: design?.marker_color ?? globalDesign.marker_color, onChange: (v) => set({ marker_color: v }) }}
            border={{ value: design?.pinBorderColor ?? globalDesign.pinBorderColor, onChange: (v) => set({ pinBorderColor: v }) }}
            borderSize={{ value: design?.pinBorderSize ?? globalDesign.pinBorderSize, onChange: (n) => set({ pinBorderSize: n }) }}
          />
        ) : null}

        {styleValue !== "custom" ? (
          <PinIconSection
            title="Icon"
            description="Overrides the map's default icon for this category's pins."
            url={design?.pin_favicon_url}
            onValue={(url) => set({ pin_favicon_mode: "custom", pin_favicon_url: url })}
            onError={onError}
            actions={
              <>
                {faviconMode !== "off" ? (
                  <Button size="sm" onClick={() => set({ pin_favicon_mode: "off", pin_favicon_url: null })}>No icon</Button>
                ) : null}
                {faviconMode !== "inherit" ? (
                  <Button size="sm" onClick={() => set({ pin_favicon_mode: "inherit", pin_favicon_url: null })}>Use map default</Button>
                ) : null}
              </>
            }
          />
        ) : null}

        <div className="md-actions md-actions--between">
          <Button onClick={onReset}>Reset design</Button>
          {saving ? <span className="md-muted" role="status">Saving…</span> : null}
          <Button onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

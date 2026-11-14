import React from "react";
import { ColourField, Section, SettingRow, Switch } from "../ui";
import { DETAIL_LEVEL_LABELS } from "../../lib/mapStyleSettings.js";
import { ChoiceCards, DraftStatus, RangeField } from "./controls.jsx";
import MapStyleThumb from "./MapStyleThumb.jsx";
import { BASE_TYPE_OPTIONS, DETAIL_CONTROLS, MAP_TYPES, OVERLAY_CONTROLS } from "./mapDashboardData.js";

const COLOUR_FIELDS = [
  { key: "land", label: "Land" },
  { key: "water", label: "Water" },
  { key: "roads", label: "Roads" },
];

function thumbOptions(list) {
  return list.map(({ id, label }) => ({
    value: id,
    label,
    content: <span className="md-style-thumb"><MapStyleThumb styleId={id} /></span>,
  }));
}

/**
 * Map style tab: presets, base type, colours, map detail and overlays. Draft auto-saves (the page owns that).
 * `selectedPreset` is null once any style setting has been tweaked after choosing a preset.
 * @param {{ draftStatus: string, selectedPreset: string|null, onApplyPreset: (id: string) => void,
 *   settings: object, onBaseTypeChange: (id: string) => void, onSettingsChange: (updater: Function) => void }} props
 */
export default function MapStylePanel({ draftStatus, selectedPreset, onApplyPreset, settings, onBaseTypeChange, onSettingsChange }) {
  return (
    <div className="md-stack">
      <DraftStatus status={draftStatus} />

      <Section as="h3" title="Presets">
        <ChoiceCards
          className="md-radio-grid md-hide-legend"
          legend="Presets"
          name="map-style-preset"
          value={selectedPreset}
          options={thumbOptions(MAP_TYPES)}
          onSelect={onApplyPreset}
        />
      </Section>

      <Section as="h3" title="Base type">
        <ChoiceCards
          className="md-radio-grid md-hide-legend"
          legend="Base type"
          name="map-style-base-type"
          value={settings.baseType}
          options={thumbOptions(BASE_TYPE_OPTIONS)}
          onSelect={onBaseTypeChange}
        />
      </Section>

      <Section as="h3" title="Colours">
        {COLOUR_FIELDS.map((field) => (
          <ColourField
            key={field.key}
            label={field.label}
            value={settings.colors[field.key]}
            onChange={(value) =>
              onSettingsChange((prev) => ({ ...prev, colors: { ...prev.colors, [field.key]: value } }))
            }
          />
        ))}
      </Section>

      <Section as="h3" title="Map detail">
        {DETAIL_CONTROLS.map((control) => (
          <RangeField
            key={control.key}
            label={control.label}
            hint={control.description}
            min={0}
            max={3}
            step={1}
            value={settings.detail[control.key]}
            display={DETAIL_LEVEL_LABELS[settings.detail[control.key]]}
            onChange={(value) =>
              onSettingsChange((prev) => ({ ...prev, detail: { ...prev.detail, [control.key]: value } }))
            }
          />
        ))}
      </Section>

      <Section as="h3" title="Overlays">
        {OVERLAY_CONTROLS.map((overlay) => (
          <SettingRow
            key={overlay.key}
            label={overlay.label}
            description={overlay.description}
            control={
              <Switch
                checked={!!settings.overlays[overlay.key]}
                onChange={(checked) =>
                  onSettingsChange((prev) => ({ ...prev, overlays: { ...prev.overlays, [overlay.key]: checked } }))
                }
              />
            }
          />
        ))}
      </Section>
    </div>
  );
}

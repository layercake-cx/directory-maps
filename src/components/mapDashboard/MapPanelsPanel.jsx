import React from "react";
import { ColourField, RadioCards, Section } from "../ui";
import { DraftStatus, RangeField } from "./controls.jsx";

const LAYOUT_OPTIONS = [
  { value: "map", label: "Map panel", description: "Floating card next to the pin on the map." },
  { value: "drawer", label: "Side drawer", description: "Slides in from the edge with a scrollable area for descriptions and full details." },
];

/**
 * Panels tab: how the listing detail panel is laid out and coloured. Draft auto-saves (the page owns that).
 * @param {object} props
 */
export default function MapPanelsPanel({
  draftStatus, pinDetailLayout, onPinDetailLayoutChange,
  panelBackgroundColor, onPanelBackgroundColorChange, panelBackgroundOpacity, onPanelBackgroundOpacityChange,
  panelBorderRadius, onPanelBorderRadiusChange, panelLinkColor, onPanelLinkColorChange, buttonColor, onButtonColorChange,
}) {
  return (
    <div className="md-stack">
      <DraftStatus status={draftStatus} />
      <p className="md-intro">
        Style the listing detail panel and choose whether it appears beside the pin on the map or in a side drawer (drawer mode shows extended description text when you have added it in Data).
      </p>

      <Section as="h3" title="Layout">
        <RadioCards
          className="md-radio-stack"
          legend="Listing detail display"
          name="pinDetailLayout"
          value={pinDetailLayout}
          options={LAYOUT_OPTIONS}
          onChange={onPinDetailLayoutChange}
        />
      </Section>

      <Section as="h3" title="Appearance">
        <ColourField label="Background colour" value={panelBackgroundColor} onChange={onPanelBackgroundColorChange} />
        <RangeField
          label="Translucency"
          min={0}
          max={1}
          step={0.05}
          value={panelBackgroundOpacity}
          onChange={onPanelBackgroundOpacityChange}
          display={`${Math.round(panelBackgroundOpacity * 100)}%`}
        />
        <RangeField label="Corner roundness" min={0} max={28} value={panelBorderRadius} onChange={onPanelBorderRadiusChange} display={`${panelBorderRadius}px`} />
      </Section>

      <Section as="h3" title="Colours">
        <ColourField label="Link colour" value={panelLinkColor} onChange={onPanelLinkColorChange} />
        <ColourField label="Button colour" value={buttonColor} onChange={onButtonColorChange} />
      </Section>
    </div>
  );
}

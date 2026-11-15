import React from "react";
import { Button, Callout, Field, Section, SettingRow, Switch, TextInput, Textarea } from "../ui";
import { DraftStatus, RangeControl, RangeField } from "./controls.jsx";

/**
 * General tab: name, slug, description, default location and clustering. Auto-saves as a draft (the page owns that).
 * Location lookup (geocoding) stays in the page; this component only renders its controls.
 * `slugPlaceholder` and `slugHint` are optional (the admin page suggests a slug from the name).
 * @param {object} props
 */
export default function MapGeneralPanel({
  draftStatus, name, onNameChange, slug, onSlugChange, description, onDescriptionChange,
  locationQuery, onLocationQueryChange, onLookupLocation, geocoding, centerLabel,
  zoom, onZoomChange, enableClustering, onEnableClusteringChange, clusterRadius, onClusterRadiusChange,
  slugPlaceholder, slugHint,
}) {
  return (
    <div className="md-stack">
      <DraftStatus status={draftStatus} savedLabel="Saved" />

      <Section as="h3" title="Map">
        <Field label="Map name">
          <TextInput value={name} onChange={(e) => onNameChange(e.target.value)} />
        </Field>
        <Field label="Slug" hint={slugHint}>
          <TextInput value={slug} onChange={(e) => onSlugChange(e.target.value)} placeholder={slugPlaceholder} />
        </Field>
        <Field label="Description" hint="Optional. Shown beneath the title in the search panel.">
          <Textarea value={description} onChange={(e) => onDescriptionChange(e.target.value)} rows={4} />
        </Field>
      </Section>

      <Section as="h3" title="Location">
        <div className="md-inline md-inline--end">
          <Field label="Search city, country or address" className="md-grow">
            <TextInput
              value={locationQuery}
              onChange={(e) => onLocationQueryChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onLookupLocation(e)}
            />
          </Field>
          <Button onClick={onLookupLocation} loading={geocoding} loadingLabel="Searching…">Search</Button>
        </div>
        {centerLabel ? <Callout tone="info">{centerLabel}</Callout> : null}
        <Field label="Zoom level">
          <RangeControl min={1} max={20} step={1} value={Number(zoom) || 10} onChange={(n) => onZoomChange(String(n))} display={zoom || 10} />
        </Field>
      </Section>

      <Section as="h3" title="Display">
        <SettingRow
          label="Enable clustering"
          control={<Switch checked={enableClustering} onChange={onEnableClusteringChange} />}
        />
        {enableClustering ? (
          <RangeField label="Clustering radius" min={40} max={200} step={10} value={clusterRadius} onChange={onClusterRadiusChange} display={`${clusterRadius}px`} />
        ) : null}
      </Section>
    </div>
  );
}

import React from "react";
import MapTileThumb from "../MapTileThumb.jsx";
import PricingPlans from "../PricingPlans.jsx";
import {
  Button, Callout, ChevronLeftIcon, DataTable, Field, FieldGrid, Pill, SegmentedControl, Section, Select, TextInput,
} from "../ui";

const THUMB_SIZES = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

const DATE_FORMAT = { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" };

/**
 * Full-page publish view: publish note, publish and discard, embed code, version history.
 * All state and the publish / discard / restore handlers belong to the page; this only renders them.
 * Position and background come from the `.publish-page` shell (admin.css), which overlays the map area.
 * @param {object} props
 */
export default function MapPublishPage({
  onBack, hasActiveSubscription, pricingOrigin = "Client publish tab", err,
  map, lat, lng, zoom, publishedAt, publishNote, onPublishNoteChange,
  hasUnpublishedChanges, canDiscard, discarding, onDiscard, publishing, onPublish,
  embedWidth, onEmbedWidthChange, embedWidthUnit, onEmbedWidthUnitChange, embedHeight, onEmbedHeightChange,
  embedIframe, onCopyEmbed, onOpenEmbed, thumbSize, onThumbSizeChange, embedThumbnail, onCopyThumbnail,
  publicationHistory, rollingBack, onRestore,
}) {
  const versionColumns = [
    { key: "published_at", label: "Date", render: (row) => new Date(row.published_at).toLocaleString(undefined, DATE_FORMAT) },
    {
      key: "version",
      label: "Version",
      render: (row) => (
        <span className="md-version">
          <span className="md-version-name">v{row.version}</span>
          {row.id === map?.current_publication_id ? <Pill tone="live">Current</Pill> : null}
        </span>
      ),
    },
    { key: "note", label: "Notes", render: (row) => row.note?.trim() || "—" },
    {
      key: "restore",
      label: "Restore",
      render: (row) => (
        row.id === map?.current_publication_id ? (
          "—"
        ) : (
          <Button size="sm" disabled={rollingBack} onClick={() => onRestore(row.id)}>Restore</Button>
        )
      ),
    },
  ];

  return (
    <div className="publish-page">
      <div className="publish-page__inner md-publish">
        <div>
          <Button variant="ghost" size="sm" icon={<ChevronLeftIcon />} onClick={onBack}>Back to map</Button>
        </div>

        {err ? <Callout tone="danger">{err}</Callout> : null}

        {!hasActiveSubscription ? (
          <PricingPlans originSection={pricingOrigin} />
        ) : (
          <>
            <Section
              title={map?.name || "Untitled map"}
              actions={hasUnpublishedChanges ? <Pill tone="warn">Unpublished changes</Pill> : <Pill tone="live">Published</Pill>}
            >
              <div className="md-publish-head">
                <div className="md-publish-thumb">
                  <MapTileThumb lat={lat || map?.default_lat} lng={lng || map?.default_lng} zoom={zoom ?? map?.default_zoom} width={180} height={130} />
                </div>
                <div className="md-publish-meta">
                  <p className="md-muted">
                    {publishedAt ? (
                      <>Last published: <strong>{new Date(publishedAt).toLocaleString(undefined, DATE_FORMAT)}</strong></>
                    ) : (
                      "Not yet published"
                    )}
                  </p>
                  <Field label="Publish note (optional)">
                    <TextInput value={publishNote} onChange={(e) => onPublishNoteChange(e.target.value)} />
                  </Field>
                  <div className="md-actions">
                    <Button onClick={onDiscard} loading={discarding} loadingLabel="Resetting…" disabled={!canDiscard}>Discard draft</Button>
                    <Button variant="primary" onClick={onPublish} loading={publishing} loadingLabel="Publishing…" disabled={!hasUnpublishedChanges}>
                      {hasUnpublishedChanges ? "Publish changes" : "Published"}
                    </Button>
                  </div>
                </div>
              </div>
            </Section>

            <div className="md-embeds">
              <Section title="Full embed" as="h3">
                <FieldGrid>
                  <Field label="Width">
                    <TextInput
                      type="number"
                      min={1}
                      max={embedWidthUnit === "%" ? 100 : 4000}
                      value={embedWidth}
                      onChange={(e) => onEmbedWidthChange(e.target.value)}
                    />
                  </Field>
                  <Field label="Width unit">
                    <Select value={embedWidthUnit} onChange={(e) => onEmbedWidthUnitChange(e.target.value)}>
                      <option value="%">%</option>
                      <option value="px">px</option>
                    </Select>
                  </Field>
                  <Field label="Height (px)">
                    <TextInput type="number" min={200} max={2400} value={embedHeight} onChange={(e) => onEmbedHeightChange(e.target.value)} />
                  </Field>
                </FieldGrid>
                <pre className="md-code" tabIndex={0} aria-label="Full embed code">{embedIframe}</pre>
                <div className="md-actions">
                  <Button onClick={onCopyEmbed}>Copy code</Button>
                  <Button onClick={onOpenEmbed}>Preview</Button>
                </div>
              </Section>

              <Section title="Thumbnail embed" as="h3">
                <SegmentedControl label="Thumbnail size" value={thumbSize} options={THUMB_SIZES} onChange={onThumbSizeChange} />
                <pre className="md-code md-code--thumb" tabIndex={0} aria-label="Thumbnail embed code">{embedThumbnail}</pre>
                <div className="md-actions">
                  <Button onClick={onCopyThumbnail}>Copy code</Button>
                </div>
              </Section>
            </div>

            {publicationHistory.length > 0 ? (
              <Section title="Version history" flush>
                <DataTable columns={versionColumns} rows={publicationHistory} getRowId={(row) => row.id} getRowLabel={(row) => `version ${row.version}`} />
              </Section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

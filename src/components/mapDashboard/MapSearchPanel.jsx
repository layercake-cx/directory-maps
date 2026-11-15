import React from "react";
import LogoImage from "../LogoImage.jsx";
import { Button, ColourField, Section, SettingRow, Switch } from "../ui";
import { DraftStatus, FileButton, RangeField } from "./controls.jsx";

const LOGO_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg";

/**
 * Search tab: what the search panel on the published map shows, its logo and colours. Draft auto-saves (the page owns that).
 * `display` is [{ key, label, checked, onChange }]; `filterFields` is the map's custom filter fields.
 * @param {object} props
 */
export default function MapSearchPanel({
  draftStatus, display, logoUrl, logoUploading, onLogoFile, onLogoRemove,
  searchPanelBgColor, onSearchPanelBgColorChange, searchPanelTextColor, onSearchPanelTextColorChange,
  searchPanelBgOpacity, onSearchPanelBgOpacityChange, listingBgColor, onListingBgColorChange,
  listingBorderColor, onListingBorderColorChange, listingOpacity, onListingOpacityChange,
  filterFields, onManageFilters,
}) {
  const shownFilterFields = filterFields.filter((f) => f.is_active && f.show_in_filter_bar);
  return (
    <div className="md-stack">
      <DraftStatus status={draftStatus} />
      <p className="md-intro">
        Configure the logo and styling of the search panel shown on the published map. Changes save automatically and go live on Publish.
      </p>

      <Section as="h3" title="Display options">
        {display.map((row) => (
          <SettingRow key={row.key} label={row.label} control={<Switch checked={row.checked} onChange={row.onChange} />} />
        ))}
      </Section>

      <Section as="h3" title="Logo">
        <div className="md-upload-row">
          <div className="md-logo-preview">
            {logoUrl ? <LogoImage src={logoUrl} maxWidth={96} maxHeight={56} /> : <span className="md-logo-empty">No logo</span>}
          </div>
          <FileButton accept={LOGO_ACCEPT} onChange={onLogoFile} loading={logoUploading} loadingLabel="Uploading…">
            {logoUrl ? "Change…" : "Upload logo"}
          </FileButton>
          {logoUrl ? <Button size="sm" onClick={onLogoRemove}>Remove</Button> : null}
        </div>
      </Section>

      <Section as="h3" title="Search bar options">
        <ColourField label="Background colour" value={searchPanelBgColor} onChange={onSearchPanelBgColorChange} />
        <ColourField label="Font colour" value={searchPanelTextColor} onChange={onSearchPanelTextColorChange} />
        <RangeField
          label="Background transparency"
          min={0}
          max={1}
          step={0.05}
          value={searchPanelBgOpacity}
          onChange={onSearchPanelBgOpacityChange}
          display={`${Math.round(searchPanelBgOpacity * 100)}%`}
        />
        <ColourField label="Search listing background colour" value={listingBgColor} onChange={onListingBgColorChange} />
        <ColourField label="Search listing border" value={listingBorderColor} onChange={onListingBorderColorChange} />
        <RangeField
          label="Search listing transparency"
          min={0}
          max={1}
          step={0.05}
          value={listingOpacity}
          onChange={onListingOpacityChange}
          display={`${Math.round(listingOpacity * 100)}%`}
        />
      </Section>

      <Section as="h3" title="Custom filter fields">
        {shownFilterFields.length === 0 ? (
          <p className="md-muted">No custom filter fields are shown in the search bar yet.</p>
        ) : (
          <ul className="md-list">
            {shownFilterFields.map((f) => (
              <li key={f.id}>{f.label}</li>
            ))}
          </ul>
        )}
        <div className="md-actions">
          <Button onClick={onManageFilters}>Manage filter fields</Button>
        </div>
      </Section>
    </div>
  );
}

import React from "react";
import { DataTable, Switch, XIcon } from "../ui/index.js";
import SourcePill from "./SourcePill.jsx";
import "../../styles/wave-b/map-data.css";

// Preset logo backgrounds. Hex values are data (what gets saved to listings.logo_bg), not UI colours.
export const LOGO_BG_SWATCHES = [
  { label: "None", value: "" },
  { label: "Light", value: "#d4d4d4" },
  { label: "Mid", value: "#737373" },
  { label: "Dark", value: "#1a1a1a" },
];
const CUSTOM_BG_DEFAULT = LOGO_BG_SWATCHES[1].value;

function LogoBgPicker({ listing, onSetLogoBg }) {
  const currentBg = listing.logo_bg || "";
  const name = listing.name || "listing";
  const customSelected = !!currentBg && !LOGO_BG_SWATCHES.some((s) => s.value === currentBg);
  return (
    <div className="md-bg-row">
      {currentBg ? (
        <span className="md-bg-current" title={currentBg} style={{ background: currentBg }} /> // dynamic: the saved colour
      ) : (
        <span className="md-muted">none</span>
      )}
      {LOGO_BG_SWATCHES.map((swatch) => {
        const selected = currentBg === swatch.value || (!currentBg && swatch.value === "");
        return (
          <button
            key={swatch.label}
            type="button"
            className="md-swatch"
            aria-pressed={selected}
            aria-label={`Logo background ${swatch.label.toLowerCase()} for ${name}`}
            title={swatch.label}
            onClick={() => onSetLogoBg(listing.id, swatch.value)}
            style={swatch.value ? { background: swatch.value } : undefined} // dynamic: the preset colour
          >
            {!swatch.value ? <XIcon size={12} /> : null}
          </button>
        );
      })}
      <label
        className={`md-swatch ${customSelected ? "is-selected" : ""}`.trim()}
        title="Custom colour"
        style={currentBg ? { background: currentBg } : undefined} // dynamic: the saved colour
      >
        <input
          type="color"
          value={currentBg || CUSTOM_BG_DEFAULT}
          onChange={(e) => onSetLogoBg(listing.id, e.target.value)}
          aria-label={`Custom logo background for ${name}`}
        />
      </label>
    </div>
  );
}

function LogoCell({ listing, uploading, onUploadLogo }) {
  const currentBg = listing.logo_bg || "";
  if (listing.logo_url) {
    return (
      <span
        className={`md-logo-thumb ${currentBg ? "has-bg" : ""}`.trim()}
        title="Hover to preview"
        style={currentBg ? { background: currentBg } : undefined} // dynamic: the saved colour
      >
        <img src={listing.logo_url} alt={`${listing.name || "Listing"} logo`} />
      </span>
    );
  }
  return (
    <label
      className="md-logo-upload"
      aria-disabled={uploading ? "true" : undefined}
      title="Upload a logo (SVG, PNG, JPG or WebP, max 500 KB)"
    >
      {uploading ? "Uploading…" : "Upload"}
      <input
        className="sr-only"
        type="file"
        accept=".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp"
        disabled={uploading}
        aria-label={`Upload a logo for ${listing.name || "listing"}`}
        onChange={(e) => onUploadLogo(e, listing.id)}
      />
    </label>
  );
}

/**
 * "All listings" table: visibility switch, logo and logo background per listing. Shared by the client and
 * admin map Data pages. Presentational: the page owns the data and the save handlers.
 *
 * @param {{
 *   listings: object[],                          // the current page of listings
 *   groupNameById: Map<string, string>,
 *   ingestionMethodMap: Map<string, string>,     // inferred source for legacy rows
 *   logoUploadingId: string|null,
 *   onToggleActive: (listingId: string, next: boolean) => void,
 *   onSetLogoBg: (listingId: string, value: string) => void,
 *   onUploadLogo: (event: React.ChangeEvent<HTMLInputElement>, listingId: string) => void,
 *   pagination: {page: number, pageSize: number, total: number, onPage: (page: number) => void},
 *   empty: React.ReactNode,
 * }} props
 */
export default function ListingLogoTable({
  listings, groupNameById, ingestionMethodMap, logoUploadingId, onToggleActive, onSetLogoBg, onUploadLogo, pagination, empty,
}) {
  const columns = [
    { key: "name", label: "Name", width: "20%", render: (l) => <span className="md-cell-name" title={l.name || "—"}>{l.name || "—"}</span> },
    { key: "group", label: "Group", width: "16%", render: (l) => <span className="md-cell-name" title={groupNameById.get(l.group_id) || "—"}>{groupNameById.get(l.group_id) || "—"}</span> },
    { key: "source", label: "Source", render: (l) => <SourcePill source={l.source || ingestionMethodMap.get(l.id) || "manual"} /> },
    {
      key: "status",
      label: "Status",
      render: (l) => {
        const visible = l.is_active !== false;
        return (
          <Switch
            checked={visible}
            onChange={(next) => onToggleActive(l.id, next)}
            aria-label={`Show ${l.name || "listing"} on map`}
            title={visible ? "Visible on map — click to hide" : "Hidden from map — click to show"}
          />
        );
      },
    },
    { key: "logo", label: "Logo", render: (l) => <LogoCell listing={l} uploading={logoUploadingId === l.id} onUploadLogo={onUploadLogo} /> },
    { key: "logo_bg", label: "Logo background", render: (l) => <LogoBgPicker listing={l} onSetLogoBg={onSetLogoBg} /> },
  ];
  return (
    <DataTable
      caption="All listings"
      columns={columns}
      rows={listings}
      getRowId={(l) => l.id}
      getRowLabel={(l) => l.name || "listing"}
      empty={empty}
      pagination={pagination}
    />
  );
}

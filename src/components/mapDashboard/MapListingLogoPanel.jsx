import React from "react";
import { DataTable, EmptyState, Field, TextInput } from "../ui";
import { LOGO_BG_SWATCHES } from "./mapDashboardData.js";

/**
 * Listing logo background picker (the "data" overlay). No settings tab opens it today; kept so the page keeps its behaviour.
 * Swatch colours are user data, so their backgrounds are set inline.
 * @param {object} props
 */
export default function MapListingLogoPanel({
  search, onSearchChange, listings, groupNameById, onChangeLogoBg, page, pageSize, total, onPage,
}) {
  const columns = [
    { key: "name", label: "Name", render: (listing) => listing.name || "—" },
    { key: "group", label: "Group", render: (listing) => groupNameById.get(listing.group_id) || "—" },
    {
      key: "logo_bg",
      label: "Logo BG",
      render: (listing) => {
        const currentBg = listing.logo_bg || "";
        const customSelected = currentBg && !LOGO_BG_SWATCHES.some((s) => s.value === currentBg);
        return (
          <div className="md-swatches">
            {currentBg ? (
              <span className="md-swatch-current" title={currentBg} style={{ background: currentBg }} /> /* dynamic: user-chosen colour */
            ) : (
              <span className="md-muted">—</span>
            )}
            {LOGO_BG_SWATCHES.map((swatch) => {
              const selected = currentBg === swatch.value || (!currentBg && swatch.value === "");
              return (
                <button
                  key={swatch.label}
                  type="button"
                  className={`md-swatch${selected ? " is-selected" : ""}`}
                  aria-pressed={selected}
                  aria-label={`${swatch.label} logo background for ${listing.name || "listing"}`}
                  title={swatch.label}
                  style={{ background: swatch.value || undefined }} /* dynamic: swatch colour */
                  onClick={() => onChangeLogoBg(listing.id, swatch.value)}
                />
              );
            })}
            <input
              type="color"
              className={`md-swatch md-swatch--custom${customSelected ? " is-selected" : ""}`}
              title="Custom"
              value={currentBg || "#d4d4d4"}
              onChange={(e) => onChangeLogoBg(listing.id, e.target.value)}
              aria-label={`Custom logo background for ${listing.name || "listing"}`}
            />
          </div>
        );
      },
    },
  ];
  return (
    <div className="md-stack">
      <Field label="Filter by name or address">
        <TextInput type="text" value={search} onChange={(e) => onSearchChange(e.target.value)} />
      </Field>
      <DataTable
        columns={columns}
        rows={listings}
        getRowId={(listing) => listing.id}
        getRowLabel={(listing) => listing.name || "listing"}
        empty={<EmptyState art="none" title="No listings found" />}
        pagination={{ page, pageSize, total, onPage }}
      />
    </div>
  );
}

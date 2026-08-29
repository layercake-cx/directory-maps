import React from "react";
import { Link } from "react-router-dom";

const TABS = [
  { key: "basic", label: "Basic Info" },
  { key: "categories", label: "Categories" },
  { key: "content", label: "Content" },
  { key: "seo", label: "Search & Metadata" },
  { key: "panel", label: "Panel Style" },
  { key: "preview", label: "Preview & Publish" },
];

/**
 * Tab bar for the full-page directory entry editor. Route-based — each tab
 * is its own URL (basePath, or basePath/<tab> for non-default tabs) so tabs
 * are bookmarkable/linkable, matching the Map editor's convention.
 */
export default function EntryEditSubNav({ basePath, activeTab, disabled = false }) {
  return (
    <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--lc-border)", marginBottom: 16, flexWrap: "wrap" }}>
      {TABS.map((t) => {
        const isActive = activeTab === t.key;
        const isDisabled = disabled && t.key !== "basic";
        const path = t.key === "basic" ? basePath : `${basePath}/${t.key}`;
        const label = (
          <span
            style={{
              display: "inline-block",
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 600,
              color: isActive ? "var(--lc-brand, #4a9baa)" : isDisabled ? "#9ca3af" : "inherit",
              borderBottom: isActive ? "2px solid var(--lc-brand, #4a9baa)" : "2px solid transparent",
              cursor: isDisabled ? "not-allowed" : "pointer",
            }}
          >
            {t.label}
          </span>
        );
        return isDisabled ? (
          <span key={t.key} title="Save the basic info first">{label}</span>
        ) : (
          <Link key={t.key} to={path} style={{ textDecoration: "none" }}>{label}</Link>
        );
      })}
    </div>
  );
}

import React from "react";
import { Link } from "react-router-dom";
import { Tabs } from "../../ui/index.js";

export const ENTRY_EDIT_TABS = [
  { key: "basic", label: "Basic Info" },
  { key: "categories", label: "Categories" },
  { key: "content", label: "Content" },
  { key: "seo", label: "Search & Metadata" },
  { key: "panel", label: "Panel Style" },
  { key: "preview", label: "Preview & Publish" },
];

/** Route-based tab list (kit Tabs props): each tab is its own URL (basePath, or basePath/<tab> for non-default tabs). */
export function entryEditTabs(basePath) {
  return ENTRY_EDIT_TABS.map((t) => ({ ...t, to: t.key === "basic" ? basePath : `${basePath}/${t.key}` }));
}

/**
 * Tab bar for the full-page directory entry editor. Route-based: each tab
 * is its own URL so tabs are bookmarkable/linkable, matching the Map editor's
 * convention. DirectoryEntryEditor passes the same list to RecordLayout; this
 * component renders it standalone and, while `disabled`, shows the tabs that
 * need a saved entry as inert text.
 */
export default function EntryEditSubNav({ basePath, activeTab, disabled = false }) {
  if (!disabled) {
    return <Tabs tabs={entryEditTabs(basePath)} current={activeTab} label="Entry sections" />;
  }
  return (
    <nav className="tabs" aria-label="Entry sections">
      {entryEditTabs(basePath).map((t) =>
        t.key === "basic" ? (
          <Link key={t.key} to={t.to} className="tab" aria-current="page">{t.label}</Link>
        ) : (
          <span key={t.key} className="tab tab--disabled" aria-disabled="true" title="Save the basic info first">{t.label}</span>
        ),
      )}
    </nav>
  );
}

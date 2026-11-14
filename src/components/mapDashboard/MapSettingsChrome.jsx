import React from "react";
import { Button, Callout, XIcon } from "../ui";
import { tabLabel } from "./mapDashboardData.js";

/**
 * The strip of settings tabs on the right of the map. Tabs open the overlay panel (or close it when open already).
 * Positioning comes from the shared `.admin-map-page__*` classes (admin.css); the controls are kit buttons.
 * @param {{ primaryTabs: string[], secondaryTabs: string[], openTab: string|null, onOpenTab: (tab: string) => void,
 *   onPreview: () => void, message?: string }} props
 */
export function MapSettingsStrip({ primaryTabs, secondaryTabs, openTab, onOpenTab, onPreview, message }) {
  const renderTabs = (tabs) => tabs.map((t) => (
    <Button
      key={t}
      variant="ghost"
      size="sm"
      className="md-strip-tab"
      aria-expanded={openTab === t ? "true" : "false"}
      onClick={() => onOpenTab(t)}
    >
      {tabLabel(t)}
    </Button>
  ));
  return (
    <div className="admin-map-page__controls">
      <h2 className="md-strip-title">Map settings</h2>
      {renderTabs(primaryTabs)}
      <hr className="admin-map-page__controls-divider" />
      {renderTabs(secondaryTabs)}
      <hr className="admin-map-page__controls-divider" />
      <div className="admin-map-page__controls-footer">
        <Button size="sm" onClick={onPreview}>Preview map</Button>
        {message ? <span className="md-strip-msg" role="status">{message}</span> : null}
      </div>
    </div>
  );
}

/**
 * The slide-out panel that holds the active settings tab. Closed, it is inert (no focus, hidden from assistive tech).
 * Esc closes it. `error` shows as a danger Callout; `notice` as an info Callout.
 * @param {{ tab: string|null, open: boolean, onClose: () => void, error?: string, notice?: React.ReactNode,
 *   children: React.ReactNode }} props
 */
export function MapOverlayPanel({ tab, open, onClose, error, notice, children }) {
  return (
    <div
      className={`admin-map-overlay__panel md-panel ${open ? "admin-map-overlay__panel--open" : ""}`}
      role="dialog"
      aria-label={tab ? `${tabLabel(tab)} settings` : ""}
      aria-hidden={!open}
      inert={!open}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <header className="admin-map-overlay__header">
        <h2 className="md-panel-title">{tab ? tabLabel(tab) : ""}</h2>
        <Button variant="ghost" size="sm" iconOnly icon={<XIcon />} onClick={onClose} aria-label="Close" />
      </header>
      <div className="admin-map-overlay__body md-panel-body">
        {error ? <Callout tone="danger">{error}</Callout> : null}
        {notice ? <Callout tone="info">{notice}</Callout> : null}
        {children}
      </div>
    </div>
  );
}

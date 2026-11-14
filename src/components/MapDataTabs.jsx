import React from "react";
import "../styles/wave-b/map-data.css";

/**
 * Tab strip shared by AdminMapData.jsx and ClientMapData.jsx's map Data panel.
 * Same props as before; restyled onto the kit's `.tabs` / `.tab`. A disabled tab stays focusable
 * (aria-disabled) and carries its reason as a title and as screen-reader text.
 *
 * @param {{ id: string, label: string, disabled?: boolean, disabledReason?: string }[]} tabs
 * @param {string} activeTab
 * @param {(tabId: string) => void} onChange
 */
export default function MapDataTabs({ tabs, activeTab, onChange }) {
  return (
    <nav className="tabs md-tabs" aria-label="Map data sections">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className="tab"
          aria-current={activeTab === tab.id ? "page" : undefined}
          aria-disabled={tab.disabled ? "true" : undefined}
          onClick={() => !tab.disabled && onChange(tab.id)}
          title={tab.disabled ? tab.disabledReason : undefined}
        >
          {tab.label}
          {tab.disabled && tab.disabledReason ? <span className="sr-only"> ({tab.disabledReason})</span> : null}
        </button>
      ))}
    </nav>
  );
}

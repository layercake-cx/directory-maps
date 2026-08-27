import React from "react";

/**
 * Tab strip shared by AdminMapData.jsx and ClientMapData.jsx's map Data
 * panel. Extracted verbatim from both files — same classNames, same
 * disabled styling; do not restyle here.
 *
 * @param {{ id: string, label: string, disabled?: boolean, disabledReason?: string }[]} tabs
 * @param {string} activeTab
 * @param {(tabId: string) => void} onChange
 */
export default function MapDataTabs({ tabs, activeTab, onChange }) {
  return (
    <div className="admin-map-tabs" style={{ marginBottom: 20 }}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`admin-map-tabs__tab ${activeTab === tab.id ? "is-active" : ""} ${tab.disabled ? "is-disabled" : ""}`}
          onClick={() => !tab.disabled && onChange(tab.id)}
          title={tab.disabled ? tab.disabledReason : undefined}
          style={tab.disabled ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

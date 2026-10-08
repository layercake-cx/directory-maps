import React from "react";
import FeaturePanel from "./FeaturePanel.jsx";

const ITEMS = [
  { id: "user-activity", label: "User activity", route: "/admin/user-activity" },
  { id: "error-log", label: "Error log", route: "/admin/error-log" },
  { id: "sync-log", label: "Sync log", route: "/admin/sync-log" },
];

/** Platform › Logs panel (IA §7). */
export default function LogsFeaturePanel() {
  return <FeaturePanel title="Logs" backHref="/admin/clients" backLabel="Platform admin" groups={[{ label: null, items: ITEMS }]} />;
}

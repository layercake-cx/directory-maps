import React from "react";
import { Pill } from "../ui/index.js";

/** Where a listing came from: integration (Google Sheets sync), CSV upload or manual entry. */
export default function SourcePill({ source }) {
  if (source === "integration") return <Pill tone="ok">Integration</Pill>;
  if (source === "csv") return <Pill tone="info">CSV</Pill>;
  if (source === "manual") return <Pill tone="neutral">Manual</Pill>;
  return <Pill tone="neutral" dashed>Unknown</Pill>;
}

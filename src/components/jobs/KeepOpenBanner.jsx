import React from "react";
import { Button } from "../ui/index.js";

/**
 * Sticky banner at the top of <main> for work that runs in the browser (geocoding, CSV import).
 * Pair with `useUnsavedGuard(true)` while active so leaving the page asks first.
 * @param {{ title: string, processed?: number, total?: number, onStop?: () => void, stopLabel?: string, detail?: React.ReactNode }} props
 */
export default function KeepOpenBanner({ title, processed = 0, total, onStop, stopLabel = "Stop", detail }) {
  const percent = total ? Math.min(100, Math.round((processed / total) * 100)) : null;
  return (
    <div className="keep-open-banner" role="status" aria-live="polite">
      <strong>{title}{total ? ` · ${processed} of ${total}` : ""}</strong>
      <div
        className={`progress progress--sm ${percent != null ? "" : "progress--indeterminate"}`}
        role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}
        aria-valuetext={total ? `${processed} of ${total}` : "In progress"}
      >
        <div className="progress-fill" style={percent != null ? { width: `${percent}%` } : undefined /* dynamic: progress width */} />
      </div>
      <span><strong>Keep this tab open.</strong> {detail || "This runs in your browser and stops if you leave."}</span>
      {onStop ? <Button size="sm" onClick={onStop}>{stopLabel}</Button> : null}
    </div>
  );
}

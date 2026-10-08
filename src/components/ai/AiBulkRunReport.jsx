import React from "react";
import { formatMoney, formatTokens } from "../../lib/aiUsage.js";

/**
 * What the latest bulk run cost in AI usage and what failed, with a retry for the failures.
 * Usage is Layercake-attributable consumption only; cost is an estimate and appears only when the
 * model's prices are known. Renders nothing for a run that made no requests and had no failures.
 */
export default function AiBulkRunReport({ summary, onRetry, retrying, canRetry = true }) {
  if (!summary || (!summary.requests && !summary.failed)) return null;
  const cost = summary.estimated_cost != null ? formatMoney(Number(summary.estimated_cost), summary.currency) : null;
  return (
    <div style={{ fontSize: 12, margin: "0 0 8px" }}>
      {summary.requests > 0 && (
        <p style={{ margin: "0 0 4px", opacity: 0.75 }}>
          AI usage this run: {summary.requests} {summary.requests === 1 ? "request" : "requests"} ·{" "}
          {formatTokens(summary.input_tokens)} in / {formatTokens(summary.output_tokens)} out
          {cost ? ` · estimated cost about ${cost} (estimate only; your provider account is the authoritative source for billing)` : ""}
        </p>
      )}
      {summary.failed > 0 && (
        <p style={{ margin: 0, color: "#b91c1c" }}>
          {summary.failed} {summary.failed === 1 ? "entry" : "entries"} failed
          {summary.first_error ? `: ${summary.first_error}` : ""}.{" "}
          {canRetry && (
            <button type="button" className="btn" style={{ fontSize: 12, padding: "2px 8px", marginLeft: 4 }} onClick={onRetry} disabled={retrying}>
              {retrying ? "Retrying…" : "Retry failed"}
            </button>
          )}
        </p>
      )}
    </div>
  );
}

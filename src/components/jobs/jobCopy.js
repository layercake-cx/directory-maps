/**
 * Job model and copy (docs/design/discover-ui/PATTERNS.md §1.3 and §1.6).
 * Pure functions: no React, no network. Status rows come from the existing status functions
 * (lib/directoryPublications.js, lib/directories.js); nothing here changes how jobs are started.
 *
 * Normalised job:
 * { id, kind, scopeLabel, status: "running"|"done"|"failed", title, detail, processed, total,
 *   startedAt, finishedAt, error, steps: [{label, state: "done"|"active"|"todo"}]|null,
 *   canLeave, href, isAi, variant }
 */

export function formatElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${s % 60} s`;
}

/**
 * "About N min left" only when there is a real basis: processed/total with a measured rate, after at
 * least 10% done or 20 s elapsed. Returns null otherwise. Never invents an estimate.
 */
export function timeLeftLabel({ processed, total, startedAt, now = Date.now() }) {
  if (!total || !processed || !startedAt) return null;
  const elapsed = now - new Date(startedAt).getTime();
  if (elapsed <= 0) return null;
  if (processed / total < 0.1 && elapsed < 20000) return null;
  const remainingMs = ((total - processed) / (processed / elapsed));
  if (!Number.isFinite(remainingMs) || remainingMs < 0) return null;
  const min = Math.round(remainingMs / 60000);
  if (min < 1) return "less than a minute left";
  return `about ${min} min left`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Publish / restore / regenerate share one server status (site_generation_*). */
export function normalisePublishJob(row, ctx = {}) {
  const variant = ctx.variant || "publish";
  const v = ctx.version;
  const verb = {
    publish: { running: v ? `Publishing version ${v}` : "Publishing your changes", detail: "Generating your public pages. You can leave this page; we'll keep going.", done: v ? `Version ${v} is live` : "Your changes are live", failed: "Generating pages failed" },
    restore: { running: v ? `Restoring version ${v}` : "Restoring a version", detail: v ? `Regenerating every public page from version ${v}.` : "Regenerating every public page.", done: v ? `Version ${v} restored and live` : "Version restored and live", failed: "Restore failed" },
    regenerate: { running: "Regenerating public pages", detail: "Your content hasn't changed; pages are being rebuilt.", done: "Public pages regenerated", failed: "Regenerating pages failed" },
  }[variant];
  const raw = row?.site_generation_status;
  if (!raw) return null;
  const status = raw === "running" ? "running" : raw === "failed" ? "failed" : "done";
  const domain = ctx.domain ? ` on ${ctx.domain}` : "";
  const steps = [
    { label: "Settings saved", state: "done" },
    { label: "Generating pages", state: status === "running" ? "active" : status === "done" ? "done" : "done" },
    { label: `Live${domain}`, state: status === "done" ? "done" : "todo" },
  ];
  return {
    id: ctx.id, kind: "publish", variant, scopeLabel: ctx.scopeLabel, status,
    title: status === "running" ? verb.running : status === "done" ? verb.done : verb.failed,
    detail: status === "running" ? verb.detail
      : status === "failed" ? (row.site_generated_at ? "The live site still shows the last version that generated successfully." : "Nothing has gone live yet.")
      : null,
    processed: null, total: null,
    startedAt: row.site_generation_started_at || null,
    finishedAt: status === "running" ? null : row.site_generated_at || null,
    error: status === "failed" ? row.site_generation_error || "Unknown error" : null,
    steps: status === "failed" ? steps.map((s, i) => (i === 1 ? { ...s, state: "active" } : s)) : steps,
    canLeave: true, href: ctx.href, isAi: false,
  };
}

function bulkAiJob(kind, row, ctx, cfg) {
  const raw = row?.[cfg.status];
  if (!raw) return null;
  const status = raw === "running" ? "running" : raw === "failed" ? "failed" : "done";
  const total = row[cfg.total] ?? 0;
  const processed = row[cfg.processed] ?? 0;
  return {
    id: ctx.id, kind, variant: kind, scopeLabel: ctx.scopeLabel, status,
    title: status === "running" ? cfg.running : status === "done" ? cfg.done(total) : cfg.failed,
    detail: status === "running" ? cfg.detail(processed, total)
      : status === "failed" ? "Entries already drafted are kept. You can try again for the rest."
      : null,
    processed: status === "running" ? processed : total, total: total || null,
    startedAt: row[cfg.started] || null,
    finishedAt: status === "running" ? null : row[cfg.finished] || null,
    error: status === "failed" ? row[cfg.error] || "Unknown error" : null,
    steps: null, canLeave: true, href: ctx.href, isAi: true,
  };
}

export function normaliseAiContentJob(row, ctx = {}) {
  return bulkAiJob("ai-content", row, ctx, {
    status: "ai_content_generation_status", total: "ai_content_generation_total", processed: "ai_content_generation_processed",
    started: "ai_content_generation_started_at", finished: "ai_content_generated_at", error: "ai_content_generation_error",
    running: "Drafting content with AI",
    detail: (p, t) => `${p} of ${t} entries done. You can leave this page.`,
    done: (n) => `${plural(n, "entry", "entries")} drafted`,
    failed: "AI drafting stopped",
  });
}

export function normaliseSeoBackfillJob(row, ctx = {}) {
  return bulkAiJob("seo-backfill", row, ctx, {
    status: "seo_metadata_backfill_status", total: "seo_metadata_backfill_total", processed: "seo_metadata_backfill_processed",
    started: "seo_metadata_backfill_started_at", finished: "seo_metadata_backfill_completed_at", error: "seo_metadata_backfill_error",
    running: "Drafting SEO metadata",
    detail: (p, t) => `${p} of ${t} entries done. You can leave this page.`,
    done: (n) => `Metadata drafted for ${plural(n, "entry", "entries")}`,
    failed: "Metadata drafting stopped",
  });
}

/** Google Sheets sync: client-awaited, indeterminate. Pass `status` and optional `counts`. */
export function buildSheetSyncJob({ id, status, sheetName, startedAt, finishedAt, counts, error, href, scopeLabel }) {
  return {
    id, kind: "sheet-sync", variant: "sheet-sync", scopeLabel, status,
    title: status === "running" ? "Syncing with Google Sheets" : status === "done"
      ? `Sync complete${counts?.rows != null ? ` · ${plural(counts.rows, "listing", "listings")} synced` : ""}`
      : "Sync failed. Your data hasn't changed",
    detail: status === "running" ? `Reading ${sheetName || "your sheet"}. This usually takes under a minute. Keep this tab open until it finishes.`
      : status === "done" ? null
      : "Check that the sheet is shared with the connected Google account, then try again.",
    processed: null, total: null, startedAt, finishedAt: finishedAt || null, error: error || null,
    steps: null, canLeave: false, href, isAi: false,
  };
}

/**
 * Browser-bound work. `kind`: "csv-import" | "geocode".
 * CSV import has no per-row progress (one upsert plus follow-up writes), so it is indeterminate: the row count
 * is only in the title. Geocode (when a page runs it in the browser) is determinate.
 */
export function buildBrowserJob({ id, kind, status, processed, total, startedAt, finishedAt, located, needChecking, imported, error, href, scopeLabel }) {
  const isGeocode = kind === "geocode";
  const x = processed ?? 0;
  const y = total ?? 0;
  let title;
  let detail = null;
  if (isGeocode) {
    title = status === "running" ? `Finding map locations${y ? ` · ${x} of ${y}` : ""}`
      : status === "done" ? `${plural(located ?? x, "location", "locations")} found${needChecking ? ` · ${needChecking} need checking` : ""}`
      : `Stopped at ${x}${y ? ` of ${y}` : ""}`;
  } else {
    title = status === "running" ? `Importing ${plural(y, "row", "rows")}`
      : status === "done" ? `${plural(imported ?? y, "entry", "entries")} imported${needChecking ? ` · ${needChecking} need checking` : ""}`
      : "Import failed";
  }
  if (status === "running") detail = "Keep this tab open. This runs in your browser and stops if you leave.";
  if (status === "failed") detail = isGeocode ? "Rows already processed are kept. You can run it again for the rest." : "Some rows may already be saved. Check your entries before importing again.";
  const determinate = isGeocode;
  return {
    id, kind, variant: kind, scopeLabel, status, title, detail,
    processed: determinate ? (status === "done" ? (total ?? processed) : processed ?? 0) : null,
    total: determinate ? (total ?? null) : null,
    startedAt, finishedAt: finishedAt || null, error: error || null, steps: null, canLeave: false, href, isAi: false,
  };
}

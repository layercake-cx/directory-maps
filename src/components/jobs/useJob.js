import { useCallback, useEffect, useRef } from "react";
import { getDirectorySiteGenerationStatus } from "../../lib/directoryPublications.js";
import { getDirectoryAiContentStatus, getDirectorySeoMetadataBackfillStatus } from "../../lib/directories.js";
import { useJobs } from "./JobsProvider.jsx";
import { normalisePublishJob, normaliseAiContentJob, normaliseSeoBackfillJob } from "./jobCopy.js";

const SOURCES = {
  publish: { fetch: getDirectorySiteGenerationStatus, normalise: normalisePublishJob },
  "ai-content": { fetch: getDirectoryAiContentStatus, normalise: normaliseAiContentJob },
  "seo-backfill": { fetch: getDirectorySeoMetadataBackfillStatus, normalise: normaliseSeoBackfillJob },
};

/** A finished job is only worth showing if we watched it run; running and failed always show until dismissed. */
function visible(job) {
  if (!job || job.hidden) return null;
  if (job.status === "done" && !job.seenRunning) return null;
  return job;
}

/**
 * `useJob("publish" | "ai-content" | "seo-backfill", directoryId, ctx)`: the normalised job for a directory.
 * Reads server status once on mount (so a reload mid-run restores the running state, including jobs started
 * in another tab) and hands polling to JobsProvider, which keeps going after this page unmounts.
 * `ctx`: { href, scopeLabel, version, domain, variant, runningOnly }.
 * Returns { job, running, begin(partial), refresh, dismiss }. `begin` shows the job as running immediately,
 * before the first poll, when the page starts one itself.
 */
export function useJob(kind, directoryId, ctx = {}) {
  const { jobs, upsert, track, dismiss, getJob } = useJobs();
  const id = `${kind}:${directoryId}`;
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const src = SOURCES[kind];

  const poll = useCallback(async () => {
    const row = await src.fetch(directoryId);
    const prev = getJob(id);
    return src.normalise(row, { ...ctxRef.current, id, variant: ctxRef.current.variant || prev?.variant, version: ctxRef.current.version ?? prev?.version });
  }, [src, directoryId, id, getJob]);

  const refresh = useCallback(async () => {
    if (!directoryId) return null;
    try {
      const next = await poll();
      // `runningOnly` (the directory-wide watcher): don't surface finished or old failed runs, only ones in flight.
      if (next && (!ctxRef.current.runningOnly || next.status === "running")) {
        upsert(next);
        if (next.status === "running") track(id, poll);
      }
      return next;
    } catch {
      return null; /* non-fatal: card just stays as it was */
    }
  }, [directoryId, poll, upsert, track, id]);

  useEffect(() => { void refresh(); }, [refresh]);

  const begin = useCallback((partial = {}) => {
    upsert({
      id, kind, status: "running", startedAt: new Date().toISOString(), href: ctxRef.current.href, scopeLabel: ctxRef.current.scopeLabel,
      ...normaliseStub(kind, { ...ctxRef.current, id, ...partial }), ...partial,
    });
    track(id, poll);
  }, [id, kind, upsert, track, poll]);

  const job = visible(jobs[id]);
  return { job, running: job?.status === "running", begin, refresh, dismiss: () => dismiss(id) };
}

/** Optimistic "running" row so the card appears before the first poll returns. */
function normaliseStub(kind, ctx) {
  if (kind === "publish") return normalisePublishJob({ site_generation_status: "running", site_generation_started_at: new Date().toISOString() }, ctx) || {};
  if (kind === "ai-content") return normaliseAiContentJob({ ai_content_generation_status: "running", ai_content_generation_started_at: new Date().toISOString(), ai_content_generation_total: ctx.total ?? 0, ai_content_generation_processed: 0 }, ctx) || {};
  return normaliseSeoBackfillJob({ seo_metadata_backfill_status: "running", seo_metadata_backfill_started_at: new Date().toISOString(), seo_metadata_backfill_total: ctx.total ?? 0, seo_metadata_backfill_processed: 0 }, ctx) || {};
}

/**
 * For browser-bound jobs a page runs itself (Sheets sync, CSV import): returns the job and `upsert`/`dismiss`
 * bound to `id`, with the same "show running, failed, or done-we-watched" rule as useJob.
 */
export function useLocalJob(id) {
  const { jobs, upsert, dismiss } = useJobs();
  return { job: visible(jobs[id]), upsert, dismiss: () => dismiss(id) };
}

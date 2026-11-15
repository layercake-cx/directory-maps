import { useJob } from "./useJob.js";

/**
 * Renders nothing. Mounted by the directory feature panel so a job that is already running (reload mid-run,
 * or started in another tab) shows up in the top bar from any directory page. Polling then belongs to JobsProvider.
 * `base`: the directory's route prefix, e.g. /client/directories/:id.
 */
export default function DirectoryJobsWatcher({ directoryId, base, scopeLabel }) {
  useJob("publish", directoryId, { href: `${base}/publishing`, scopeLabel, runningOnly: true });
  useJob("ai-content", directoryId, { href: `${base}/ai-enrichment`, scopeLabel, runningOnly: true });
  useJob("seo-backfill", directoryId, { href: `${base}/ai-enrichment`, scopeLabel, runningOnly: true });
  return null;
}

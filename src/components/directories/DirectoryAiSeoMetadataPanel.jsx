import AIButton from "../ai/AIButton.jsx";
import React, { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "../ui/index.js";
import { JobCard, useJob } from "../jobs/index.js";
import { useAiFeature } from "../../hooks/useAiFeature.js";
import AiUnavailableNotice from "../ai/AiUnavailableNotice.jsx";
import AiRunSummary from "../ai/AiRunSummary.jsx";
import AiBulkRunReport from "../ai/AiBulkRunReport.jsx";
import { getAiBulkRunSummary, retryFailedBulkJobs } from "../../lib/aiUsage.js";
import {
  countEntriesMissingSeoMetadata,
  triggerDirectorySeoMetadataBackfill,
} from "../../lib/directories.js";

/**
 * SEO metadata backfill — the unattended, "in the AI tab" counterpart to the
 * per-entry "Generate with AI" button on the Search & Metadata tab (Phase 2
 * of the Directory Searchability & AI Metadata plan), and the replacement
 * for an earlier per-publish backfill capped at 20 entries (Phase 3), which
 * the user rightly called out as arbitrary. This runs as its own async
 * queue, independently of publishing, the same way "Generate all entry
 * content" (DirectoryAiContentPanel.jsx) does — but unlike that action,
 * this one can never overwrite existing data (it only ever fills genuinely
 * empty fields), so there's no type-to-confirm friction here.
 */
export default function DirectoryAiSeoMetadataPanel({ directoryId, canManage, recordEvent }) {
  const ai = useAiFeature("seo_metadata");
  const [runSummary, setRunSummary] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [missingCount, setMissingCount] = useState(null);
  const [countLoading, setCountLoading] = useState(true);
  const [queuing, setQueuing] = useState(false);
  const { pathname } = useLocation();
  // Progress comes from the server status via JobsProvider; the page can be left while it runs.
  const { job, running, begin, dismiss } = useJob("seo-backfill", directoryId, { href: pathname });
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const refreshCount = useCallback(async () => {
    if (!directoryId) return;
    try {
      setCountLoading(true);
      setMissingCount(await countEntriesMissingSeoMetadata(directoryId));
    } catch {
      setMissingCount(null);
    } finally {
      setCountLoading(false);
    }
  }, [directoryId]);

  const refreshSummary = useCallback(async () => {
    if (!directoryId) return;
    try {
      setRunSummary(await getAiBulkRunSummary(directoryId, "seo"));
    } catch {
      /* non-fatal: the report just stays stale/empty */
    }
  }, [directoryId]);

  useEffect(() => { void refreshCount(); }, [refreshCount]);
  // Re-read the run report when a run starts or finishes.
  useEffect(() => { void refreshSummary(); }, [refreshSummary, job?.status]);

  // Once a run stops, re-check the missing-entries count so it reflects what the run actually filled.
  const prevRunning = React.useRef(running);
  useEffect(() => {
    if (prevRunning.current && !running) void refreshCount();
    prevRunning.current = running;
  }, [running, refreshCount]);

  async function handleBackfill() {
    setErr("");
    setMsg("");
    try {
      setQueuing(true);
      const queued = await triggerDirectorySeoMetadataBackfill(directoryId);
      recordEvent?.("directory_ai_content_bulk_requested", { directory_id: directoryId, target: "seo_metadata", entries_queued: queued });
      setMsg(queued > 0 ? `Queued ${queued} ${queued === 1 ? "entry" : "entries"} for backfill.` : "Nothing to backfill — every active entry already has all six fields.");
      if (queued > 0) begin({ total: queued });
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setQueuing(false);
    }
  }

  async function handleRetryFailed() {
    setErr("");
    setMsg("");
    try {
      setRetrying(true);
      const n = await retryFailedBulkJobs(directoryId, "seo");
      recordEvent?.("directory_ai_content_bulk_requested", { directory_id: directoryId, target: "seo_metadata", entries_queued: n, retry: true });
      setMsg(n > 0 ? `Re-queued ${n} failed ${n === 1 ? "entry" : "entries"}.` : "Nothing to retry.");
      if (n > 0) begin({ total: n });
      await refreshSummary();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setRetrying(false);
    }
  }

  if (!canManage) {
    return <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>Only an Owner or Manager can trigger the SEO metadata backfill.</p>;
  }

  return (
    <div>
      {job ? (
        <div style={{ margin: "0 0 12px" }}>
          <JobCard
            job={job}
            onRetry={handleRetryFailed}
            onDismiss={dismiss}
            primaryAction={<Button as="a" href="#ai-seo-report">Review drafts</Button>}
          />
        </div>
      ) : null}
      {err && <p style={{ color: "#b91c1c", fontSize: 12, margin: "0 0 8px" }}>{err}</p>}
      {msg && <p style={{ color: "#15803d", fontSize: 12, margin: "0 0 8px" }}>{msg}</p>}

      <p style={{ margin: "0 0 10px", fontSize: 13, opacity: 0.75 }}>
        Fills in meta title, meta description, keywords, social title/description, and AI summary for any active
        entry missing one — never touches a field that already has content, whether an editor wrote it or a previous
        backfill did. New entries with missing fields are also picked up automatically as they're added, without
        needing this button.
      </p>

      <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600 }}>
        {countLoading ? "Checking…" : missingCount == null ? "Could not check how many entries are missing metadata." : `${missingCount} ${missingCount === 1 ? "entry is" : "entries are"} missing SEO/social metadata.`}
      </p>

      <div id="ai-seo-report">
        <AiBulkRunReport summary={runSummary} onRetry={handleRetryFailed} retrying={retrying} canRetry={ai.available} />
      </div>
      {!ai.available && <AiUnavailableNotice message={ai.message} href={ai.integrationsHref} />}
      {ai.available && missingCount > 0 && !running && (
        <AiRunSummary
          plan={ai.plan}
          count={missingCount}
          clientId={ai.clientId}
          directoryId={directoryId}
          featureKey="seo_metadata"
          catalogue={ai.catalogue}
        />
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <AIButton
          compact
          variant="secondary"
          label="Backfill missing metadata"
          onGenerate={async () => { await handleBackfill(); return false; }}
          disabled={queuing || running || !missingCount || !ai.available}
        />
        <button
          type="button"
          className="btn"
          style={{ fontSize: 12, padding: "5px 12px" }}
          onClick={refreshCount}
          disabled={countLoading || running}
        >
          Refresh count
        </button>
      </div>
    </div>
  );
}

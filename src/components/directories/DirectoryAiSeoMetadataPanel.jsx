import React, { useCallback, useEffect, useState } from "react";
import {
  countEntriesMissingSeoMetadata,
  triggerDirectorySeoMetadataBackfill,
  getDirectorySeoMetadataBackfillStatus,
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
  const [missingCount, setMissingCount] = useState(null);
  const [countLoading, setCountLoading] = useState(true);
  const [queuing, setQueuing] = useState(false);
  const [status, setStatus] = useState(null);
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

  const refreshStatus = useCallback(async () => {
    if (!directoryId) return;
    try {
      setStatus(await getDirectorySeoMetadataBackfillStatus(directoryId));
    } catch {
      /* non-fatal: status display just stays stale/empty */
    }
  }, [directoryId]);

  useEffect(() => { void refreshCount(); void refreshStatus(); }, [refreshCount, refreshStatus]);

  // Poll while a bulk run is in progress, so this reflects reality even if
  // triggered from a different tab or this tab was reloaded mid-run. Once it
  // stops running, re-check the missing-entries count so it reflects what
  // the run actually filled.
  const running = status?.seo_metadata_backfill_status === "running";
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => { void refreshStatus(); }, 3000);
    return () => clearInterval(id);
  }, [running, refreshStatus]);

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
      await refreshStatus();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setQueuing(false);
    }
  }

  const statusLine = (() => {
    if (!status?.seo_metadata_backfill_status) return null;
    if (status.seo_metadata_backfill_status === "running") {
      const total = status.seo_metadata_backfill_total ?? 0;
      const processed = status.seo_metadata_backfill_processed ?? 0;
      return (
        <p style={{ fontSize: 12, opacity: 0.7, margin: "0 0 8px" }}>
          ⏳ Backfilling metadata — {processed} of {total} entries done…
        </p>
      );
    }
    if (status.seo_metadata_backfill_status === "failed") {
      return (
        <p style={{ fontSize: 12, color: "#b91c1c", margin: "0 0 8px" }}>
          Last run finished with errors: {status.seo_metadata_backfill_error || "unknown error"}.
        </p>
      );
    }
    return (
      <p style={{ fontSize: 12, opacity: 0.7, margin: "0 0 8px" }}>
        Last backfill run completed {new Date(status.seo_metadata_backfill_completed_at).toLocaleString()}.
      </p>
    );
  })();

  if (!canManage) {
    return <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>Only an Owner or Manager can trigger the SEO metadata backfill.</p>;
  }

  return (
    <div>
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

      {statusLine}

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          className="btn"
          style={{ fontSize: 12, padding: "5px 12px" }}
          onClick={handleBackfill}
          disabled={queuing || running || !missingCount}
        >
          {queuing ? "Queuing…" : "Backfill missing metadata"}
        </button>
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

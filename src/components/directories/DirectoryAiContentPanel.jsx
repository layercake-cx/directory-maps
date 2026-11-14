import AIButton from "../ai/AIButton.jsx";
import React, { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "../ui/index.js";
import { JobCard, useJob } from "../jobs/index.js";
import { supabase } from "../../lib/supabase.js";
import {
  updateDirectory,
  triggerDirectoryAiContentBulkRun,
} from "../../lib/directories.js";

import { useAiFeature } from "../../hooks/useAiFeature.js";
import AiUnavailableNotice from "../ai/AiUnavailableNotice.jsx";
import AiRunSummary from "../ai/AiRunSummary.jsx";
import AiBulkRunReport from "../ai/AiBulkRunReport.jsx";
import { getAiBulkRunSummary, retryFailedBulkJobs } from "../../lib/aiUsage.js";

const inputStyle = { width: "100%", boxSizing: "border-box", padding: "6px 9px", borderRadius: 7, border: "1px solid var(--lc-border)", fontSize: 13 };

const CONFIRM_WORD = "CREATE";

/**
 * Directory-level AI content generation — the directory-entry successor to
 * the removed map-level "AI search enrichment" feature (docs/FEATURES.md
 * §4.4g). One admin prompt per directory; a directory-wide "Generate all
 * entry content" action regenerates EVERY entry's body content (not just
 * empty ones), which is why it's gated behind typing CREATE rather than a
 * plain confirm — existing hand-written content is overwritten, though it's
 * always recoverable via each entry's version history.
 */
export default function DirectoryAiContentPanel({ directory, directoryId, canManage, recordEvent, onSaved }) {
  const ai = useAiFeature("content_generation");
  const [runSummary, setRunSummary] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [prompt, setPrompt] = useState(directory?.ai_content_prompt ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [entryCount, setEntryCount] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [queuing, setQueuing] = useState(false);
  const { pathname } = useLocation();
  // Progress comes from the server status via JobsProvider; the page can be left while it runs.
  const { job, running, begin, dismiss } = useJob("ai-content", directoryId, { href: pathname });

  useEffect(() => {
    setPrompt(directory?.ai_content_prompt ?? "");
  }, [directory?.ai_content_prompt]);

  const refreshSummary = useCallback(async () => {
    if (!directoryId) return;
    try {
      setRunSummary(await getAiBulkRunSummary(directoryId, "content"));
    } catch {
      /* non-fatal: the report just stays stale/empty */
    }
  }, [directoryId]);

  // Re-read the run report when a run starts or finishes.
  useEffect(() => { void refreshSummary(); }, [refreshSummary, job?.status]);

  async function savePrompt(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    try {
      setSaving(true);
      const next = prompt.trim() || null;
      await updateDirectory(directoryId, { ai_content_prompt: next });
      recordEvent?.("directory_ai_content_prompt_updated", { directory_id: directoryId, prompt_set: !!next });
      setMsg("Saved.");
      onSaved?.();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  async function openConfirm() {
    setErr("");
    try {
      const { count, error } = await supabase
        .from("directory_entries")
        .select("id", { count: "exact", head: true })
        .eq("directory_id", directoryId)
        .eq("is_active", true);
      if (error) throw error;
      setEntryCount(count ?? 0);
    } catch (e) {
      setEntryCount(null);
    }
    setConfirmText("");
    setConfirmOpen(true);
  }

  async function handleBulkRun() {
    if (confirmText !== CONFIRM_WORD) return;
    setErr("");
    setMsg("");
    try {
      setQueuing(true);
      const queued = await triggerDirectoryAiContentBulkRun(directoryId);
      recordEvent?.("directory_ai_content_bulk_requested", { directory_id: directoryId, entries_queued: queued });
      setConfirmOpen(false);
      setMsg(`Queued ${queued} ${queued === 1 ? "entry" : "entries"} for regeneration.`);
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
      const n = await retryFailedBulkJobs(directoryId, "content");
      recordEvent?.("directory_ai_content_bulk_requested", { directory_id: directoryId, entries_queued: n, retry: true });
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
    return <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>Only an Owner or Manager can change AI content generation settings.</p>;
  }

  return (
    <div>
      {job ? (
        <div style={{ margin: "0 0 12px" }}>
          <JobCard
            job={job}
            onRetry={handleRetryFailed}
            onDismiss={dismiss}
            primaryAction={<Button as="a" href="#ai-content-report">Review drafts</Button>}
          />
        </div>
      ) : null}
      <form onSubmit={savePrompt} style={{ display: "grid", gap: 10 }}>
        {err && <p style={{ color: "#b91c1c", fontSize: 12, margin: 0 }}>{err}</p>}
        {msg && <p style={{ color: "#15803d", fontSize: 12, margin: 0 }}>{msg}</p>}

        <p style={{ margin: 0, fontSize: 13, opacity: 0.75 }}>
          Describe the page content the AI should write for each entry. New entries with no content are written
          automatically once this is set; existing entries only regenerate when you trigger it. Leave blank to turn
          this off for this directory.
        </p>
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          <span>Content prompt</span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={10}
            placeholder="e.g. Write a warm, factual 2-3 paragraph description covering what this organisation does, who it serves, and why it's included in this directory."
            style={{ ...inputStyle, minHeight: 180, resize: "vertical", fontFamily: "inherit" }}
          />
        </label>

        <div>
          <button type="submit" className="btn btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} disabled={saving}>
            {saving ? "Saving…" : "Save prompt"}
          </button>
        </div>
      </form>

      <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid var(--lc-border)" }} />

      <div id="ai-content-report">
        <AiBulkRunReport summary={runSummary} onRetry={handleRetryFailed} retrying={retrying} canRetry={ai.available} />
      </div>
      {!ai.available && <AiUnavailableNotice message={ai.message} href={ai.integrationsHref} />}
      <AIButton
        compact
        variant="secondary"
        label="Generate all entry content"
        onGenerate={() => { openConfirm(); return false; }}
        disabled={!directory?.ai_content_prompt?.trim() || running || !ai.available}
      />
      {!directory?.ai_content_prompt?.trim() && (
        <p style={{ fontSize: 12, opacity: 0.6, margin: "6px 0 0" }}>Save a content prompt above first.</p>
      )}

      {confirmOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1001, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: 16 }}
          onClick={() => setConfirmOpen(false)}
        >
          <div className="panel-section admin-card" style={{ border: "1px solid #b91c1c", maxWidth: 460, width: "100%" }} onClick={(e) => e.stopPropagation()}>
            <p className="panel-section__title" style={{ color: "#b91c1c" }}>Generate content for every entry?</p>
            <p style={{ margin: "0 0 8px", fontSize: 13 }}>
              This will overwrite the page content of {entryCount == null ? "every" : entryCount} {entryCount === 1 ? "entry" : "entries"} in
              this directory using the prompt above — including entries that already have hand-written content. It
              may take a few minutes and uses your connected AI provider account.
            </p>
            <AiRunSummary
              plan={ai.plan}
              count={entryCount}
              clientId={ai.clientId}
              directoryId={directoryId}
              featureKey="content_generation"
              catalogue={ai.catalogue}
            />
            <p style={{ margin: "0 0 8px", fontSize: 13, opacity: 0.75 }}>
              Every entry's previous content stays recoverable from its version history, so this can't permanently
              lose anything.
            </p>
            <p style={{ margin: "0 0 6px", fontSize: 13 }}>Type <strong>{CONFIRM_WORD}</strong> to confirm:</p>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_WORD}
              style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13 }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                type="button"
                className="btn"
                onClick={handleBulkRun}
                disabled={queuing || confirmText !== CONFIRM_WORD}
                style={{ color: "#fff", background: "#b91c1c", borderColor: "#b91c1c" }}
              >
                {queuing ? "Queuing…" : "Generate all entry content"}
              </button>
              <button type="button" className="btn" onClick={() => setConfirmOpen(false)} disabled={queuing}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

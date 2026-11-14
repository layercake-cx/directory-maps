import AIButton from "../ai/AIButton.jsx";
import React, { useCallback, useEffect, useId, useState } from "react";
import { useLocation } from "react-router-dom";
import { Button, Callout, Dialog, Field, Section, Textarea, TextInput } from "../ui/index.js";
import "../../styles/wave-a/batch-1.css";
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
  const formId = useId();
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

  // Stable so the Dialog's focus handling doesn't restart on every keystroke in the confirmation field.
  const closeConfirm = useCallback(() => setConfirmOpen(false), []);

  if (!canManage) {
    return <Callout tone="info">Only an Owner or Manager can change AI content generation settings.</Callout>;
  }

  const hasPrompt = !!directory?.ai_content_prompt?.trim();

  return (
    <>
      {job ? (
        <JobCard
          job={job}
          onRetry={handleRetryFailed}
          onDismiss={dismiss}
          primaryAction={<Button as="a" href="#ai-content-report">Review drafts</Button>}
        />
      ) : null}

      <Section
        title="Content generation"
        description="Describe the page content the AI should write for each entry. New entries with no content are written automatically once this is set; existing entries only regenerate when you trigger it. Leave blank to turn this off for this directory."
        footer={<Button type="submit" form={formId} variant="primary" loading={saving} loadingLabel="Saving…">Save prompt</Button>}
      >
        <form id={formId} onSubmit={savePrompt} className="b1-form">
          <Field label="Content prompt">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={10}
              placeholder="e.g. Write a warm, factual 2-3 paragraph description covering what this organisation does, who it serves, and why it's included in this directory."
            />
          </Field>
          {err ? <Callout tone="danger">{err}</Callout> : null}
          {msg ? <Callout tone="ok">{msg}</Callout> : null}
        </form>
      </Section>

      <Section
        title="Bulk generation"
        footer={(
          <AIButton
            compact
            variant="secondary"
            label="Generate all entry content"
            onGenerate={() => { openConfirm(); return false; }}
            disabled={!hasPrompt || running || !ai.available}
          />
        )}
      >
        <div id="ai-content-report">
          <AiBulkRunReport summary={runSummary} onRetry={handleRetryFailed} retrying={retrying} canRetry={ai.available} />
        </div>
        {!ai.available && <AiUnavailableNotice message={ai.message} href={ai.integrationsHref} />}
        {!hasPrompt ? <p className="field-hint">Save a content prompt above first.</p> : null}
      </Section>

      {confirmOpen && (
        <Dialog
          title="Generate content for every entry?"
          onClose={closeConfirm}
          footer={(
            <>
              <Button onClick={closeConfirm} disabled={queuing}>Cancel</Button>
              <Button
                variant="danger-solid"
                onClick={handleBulkRun}
                loading={queuing}
                loadingLabel="Queuing…"
                disabled={confirmText !== CONFIRM_WORD}
              >
                Generate all entry content
              </Button>
            </>
          )}
        >
          <div className="b1-form">
            <p>
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
            <Callout tone="info">
              Every entry&apos;s previous content stays recoverable from its version history, so this can&apos;t permanently
              lose anything.
            </Callout>
            <Field label={<>Type <strong>{CONFIRM_WORD}</strong> to confirm</>}>
              <TextInput
                data-autofocus
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={CONFIRM_WORD}
                autoComplete="off"
              />
            </Field>
          </div>
        </Dialog>
      )}
    </>
  );
}

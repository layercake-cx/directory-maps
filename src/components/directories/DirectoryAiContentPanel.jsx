import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import {
  updateDirectory,
  triggerDirectoryAiContentBulkRun,
  getDirectoryAiContentStatus,
} from "../../lib/directories.js";

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
  const [prompt, setPrompt] = useState(directory?.ai_content_prompt ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [entryCount, setEntryCount] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [queuing, setQueuing] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    setPrompt(directory?.ai_content_prompt ?? "");
  }, [directory?.ai_content_prompt]);

  const refreshStatus = useCallback(async () => {
    if (!directoryId) return;
    try {
      setStatus(await getDirectoryAiContentStatus(directoryId));
    } catch {
      /* non-fatal: status display just stays stale/empty */
    }
  }, [directoryId]);

  useEffect(() => { void refreshStatus(); }, [refreshStatus]);

  // Poll while a bulk run is in progress, so this reflects reality even if
  // triggered from a different tab or this tab was reloaded mid-run.
  useEffect(() => {
    if (status?.ai_content_generation_status !== "running") return;
    const id = setInterval(() => { void refreshStatus(); }, 3000);
    return () => clearInterval(id);
  }, [status?.ai_content_generation_status, refreshStatus]);

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
      await refreshStatus();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setQueuing(false);
    }
  }

  const statusLine = (() => {
    if (!status?.ai_content_generation_status) return null;
    if (status.ai_content_generation_status === "running") {
      const total = status.ai_content_generation_total ?? 0;
      const processed = status.ai_content_generation_processed ?? 0;
      return (
        <p style={{ fontSize: 12, opacity: 0.7, margin: "0 0 8px" }}>
          ⏳ Generating content — {processed} of {total} entries done…
        </p>
      );
    }
    if (status.ai_content_generation_status === "failed") {
      return (
        <p style={{ fontSize: 12, color: "#b91c1c", margin: "0 0 8px" }}>
          Last run finished with errors: {status.ai_content_generation_error || "unknown error"}.
        </p>
      );
    }
    return (
      <p style={{ fontSize: 12, opacity: 0.7, margin: "0 0 8px" }}>
        Last full run completed {new Date(status.ai_content_generated_at).toLocaleString()}.
      </p>
    );
  })();

  if (!canManage) {
    return <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>Only an Owner or Manager can change AI content generation settings.</p>;
  }

  return (
    <div>
      <form onSubmit={savePrompt} style={{ display: "grid", gap: 10 }}>
        {err && <p style={{ color: "#b91c1c", fontSize: 12, margin: 0 }}>{err}</p>}
        {msg && <p style={{ color: "#15803d", fontSize: 12, margin: 0 }}>{msg}</p>}

        <p style={{ margin: 0, fontSize: 13, opacity: 0.75 }}>
          Describe the page content Claude should write for each entry. New entries with no content are written
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

      {statusLine}
      <button
        type="button"
        className="btn"
        style={{ fontSize: 12, padding: "5px 12px" }}
        onClick={openConfirm}
        disabled={!directory?.ai_content_prompt?.trim() || status?.ai_content_generation_status === "running"}
      >
        Generate all entry content
      </button>
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
              may take a few minutes and uses your Anthropic API budget.
            </p>
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

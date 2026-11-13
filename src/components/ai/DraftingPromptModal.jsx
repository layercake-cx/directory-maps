import React, { useEffect, useRef, useState } from "react";
import { Modal } from "@mantine/core";
import AIButton, { SparkleIcon } from "./AIButton.jsx";
import "./ai.css";

/**
 * The prompt is admin-authored PLAIN TEXT. Split it on {variable} tokens and return React nodes —
 * never HTML (React escapes text nodes) — so nothing in the prompt can ever render as markup.
 */
export function renderPrompt(text) {
  return String(text ?? "").split(/(\{[a-zA-Z0-9_]+\})/g).map((part, i) =>
    /^\{[a-zA-Z0-9_]+\}$/.test(part) ? <span key={i} className="prompt-var">{part}</span> : part,
  );
}
function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Read-only view of the drafting prompt the directory's administrators configured.
 * `loadPrompt()` -> Promise<{ text, updatedAt? }>, fetched on open and cached for the page session.
 * Mantine's Modal supplies the focus trap, Esc/scrim close, scroll lock and focus return.
 * `onGenerate` (optional) adds the "Generate with AI" button; it closes the modal first.
 */
export default function DraftingPromptModal({ opened, onClose, loadPrompt, onGenerate, canGenerate = true, entityName = "listing", factsWebAddress = true }) {
  const [state, setState] = useState({ status: "idle", text: "", updatedAt: null });
  const cache = useRef(null);

  useEffect(() => {
    if (!opened) return;
    if (cache.current) {
      setState({ status: "ready", ...cache.current });
      return;
    }
    let cancelled = false;
    setState({ status: "loading", text: "", updatedAt: null });
    Promise.resolve(loadPrompt())
      .then((r) => {
        if (cancelled) return;
        cache.current = { text: r?.text ?? "", updatedAt: r?.updatedAt ?? null };
        setState({ status: "ready", ...cache.current });
      })
      .catch(() => !cancelled && setState({ status: "error", text: "", updatedAt: null }));
    return () => { cancelled = true; };
  }, [opened, loadPrompt]);

  const updated = formatDate(state.updatedAt);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      withCloseButton
      size={640}
      radius={16}
      centered
      classNames={{ content: "ai-modal" }}
      title={
        <div className="ai-modal__head">
          <span className="ai-modal__badge"><SparkleIcon /></span>
          <div>
            <h2 className="ai-modal__title" id="ai-prompt-title">Drafting prompt</h2>
            <div className="ai-modal__meta">
              <span className="ai-modal__lock">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                Set by directory administrators
              </span>
              <span>Read only{updated ? ` · Updated ${updated}` : ""}</span>
            </div>
          </div>
        </div>
      }
    >
      <div className="ai-modal__facts">
        {factsWebAddress && <span>Researches the web address in Contact details</span>}
        <span><span className="ai-modal__chip">{"{ }"}</span> Filled in from this {entityName}</span>
      </div>
      <div className="ai-prompt">
        <div className="ai-prompt__bar"><span>PROMPT</span><span>Plain text</span></div>
        <pre className="ai-prompt__body" tabIndex={0} aria-label="Drafting prompt text">
          {state.status === "loading" && "Loading prompt…"}
          {state.status === "error" && "The drafting prompt could not be loaded. Try again in a moment."}
          {state.status === "ready" && (state.text ? renderPrompt(state.text) : "No drafting prompt has been set for this directory.")}
        </pre>
      </div>
      <div className="ai-modal__foot">
        <p>Want it changed? Contact your directory administrator.</p>
        <div className="ai-modal__actions">
          <button type="button" className="ai-outline-btn" onClick={onClose}>Close</button>
          {onGenerate && (
            <AIButton
              label="Generate with AI"
              disabled={!canGenerate}
              liveRegion={false}
              onGenerate={() => { onClose(); return onGenerate(); }}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}

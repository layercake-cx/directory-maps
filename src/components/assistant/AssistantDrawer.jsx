import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, Callout, Pill, SparkIcon, XIcon, ArrowRightIcon, useToast } from "../ui/index.js";
import pipFace from "../../assets/pip/pip-badge-face.svg";
import pipWelcome from "../../assets/pip/pip-welcome.svg";
import { useAssistant } from "./AssistantProvider.jsx";
import AssistantMessage from "./AssistantMessage.jsx";
import { ASSISTANT_NAME } from "./constants.js";
import { MOCK } from "./mockResponses.js";

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const MAX_LINES = 6;

/**
 * The Ask Pip drawer (preview). Fixed right, below the top bar. role=dialog aria-modal: focus goes to the composer,
 * Tab is trapped, Esc / close / scrim click closes and focus returns to the trigger (the provider does the return).
 * Preview notice on first open per session; welcome state with suggested prompts; thinking state with Stop.
 */
export default function AssistantDrawer() {
  const a = useAssistant();
  const { toast } = useToast();
  const ref = useRef(null);
  const composerRef = useRef(null);
  const listRef = useRef(null);
  const [text, setText] = useState(a.prefill || "");
  const [showNotice, setShowNotice] = useState(!a.noticeSeen);
  const { page } = a;

  // Focus the composer on open; a contextual trigger pre-fills the question without sending it.
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.focus();
    if (a.prefill) el.setSelectionRange(el.value.length, el.value.length);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-grow the composer up to six lines.
  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    const line = parseFloat(getComputedStyle(el).lineHeight) || 22;
    el.style.height = `${Math.min(el.scrollHeight, line * MAX_LINES)}px`; // dynamic: auto-grow height
  }, [text]);

  useEffect(() => { listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight }); }, [a.messages.length, a.thinking]);

  useEffect(() => {
    const onKey = (e) => {
      if (document.querySelector(".dialog-backdrop")) return; // a Dialog sits above the drawer and handles its own keys
      if (e.key === "Escape") { e.preventDefault(); a.closeAssistant(); return; }
      if (e.key !== "Tab" || !ref.current) return;
      const items = [...ref.current.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && !ref.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [a]);

  function submit() {
    if (!text.trim() || a.thinking) return;
    a.send(text);
    setText("");
    setShowNotice(false);
  }
  function onComposerKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  }

  const empty = a.messages.length === 0 && !a.thinking;
  const chip = a.sectionContext ? `${page.chip.split(" › ")[0]} › ${a.sectionContext}` : page.chip;
  const name = a.firstName ? ` ${a.firstName}` : "";

  return (
    <>
      <div className="pip-scrim" onClick={a.closeAssistant} aria-hidden="true" />
      <aside className="pip-drawer" role="dialog" aria-modal="true" aria-labelledby="pip-title" ref={ref}>
        <div className="pip-head">
          <img className="pip-avatar" src={pipFace} alt="" />
          <h2 id="pip-title" className="pip-title">{ASSISTANT_NAME}</h2>
          <Pill tone="ai">Preview</Pill>
          <span className="pip-head-spacer" />
          <button type="button" className="pip-icon-btn" aria-label="New conversation" onClick={() => { a.newConversation(); setText(""); }}>
            <SparkIcon size={16} />
          </button>
          <button type="button" className="pip-icon-btn" aria-label="Close" onClick={a.closeAssistant}><XIcon size={18} /></button>
        </div>

        <div className="pip-context">
          <span>Helping with</span>
          <span className="pip-context-chip">{chip}</span>
        </div>

        <div className="pip-messages" ref={listRef}>
          {showNotice ? <Callout tone="info">{MOCK.previewNotice}</Callout> : null}

          {empty ? (
            <div className="pip-welcome">
              <img src={pipWelcome} alt="" className="pip-welcome-art" />
              <h3 className="pip-welcome-title">Hi{name}. {page.welcome.replace("{directory}", page.thing)}</h3>
              <div className="pip-suggestions">
                {page.group.prompts.map((p) => (
                  <button key={p.id} type="button" className="pip-suggestion" onClick={() => a.selectPrompt(p)}>{p.text}</button>
                ))}
              </div>
            </div>
          ) : null}

          {a.messages.map((m) => (
            <AssistantMessage key={m.id} message={m} params={page.params} base={page.base} onRetry={a.retry} onNavigate={a.closeAssistant} />
          ))}

          {a.thinking ? (
            <div className="pip-thinking" role="status">
              <SparkIcon size={16} className="spark--spin" />
              <span>{a.thinking.label}…</span>
              <Button size="sm" variant="ghost" onClick={a.stop}>Stop</Button>
            </div>
          ) : null}
        </div>

        <div className="pip-composer">
          <div className="pip-composer-box">
            <textarea
              ref={composerRef} rows={1} value={text} aria-label={`Message ${ASSISTANT_NAME}`} placeholder="Ask a question"
              onChange={(e) => setText(e.target.value)} onKeyDown={onComposerKey}
            />
            <button type="button" className="pip-send" aria-label="Send" disabled={!text.trim() || !!a.thinking} onClick={submit}>
              <ArrowRightIcon size={18} />
            </button>
          </div>
          <span className="pip-disclaimer">{MOCK.disclaimer}</span>
        </div>
        <span className="sr-only" role="status" aria-live="polite">{a.announce}</span>
      </aside>
    </>
  );
}

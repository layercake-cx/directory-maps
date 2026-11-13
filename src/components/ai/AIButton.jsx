import React, { useEffect, useRef, useState } from "react";
import "./ai.css";

/** The AI mark (filled sparkle). Kept as-is per the handoff: it is what users learn to recognise as AI. */
export function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11 3.5l1.8 4.9 4.9 1.8-4.9 1.8L11 16.9l-1.8-4.9-4.9-1.8 4.9-1.8z" />
      <path d="M18.5 14l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

const TIMEOUT_MS = 60000;
const DONE_MS = 1600;

/**
 * The one shared "AI writes this" button. It owns its state machine:
 *   idle -> loading -> done (1.6s) -> idle,  reject / resolve(false) -> idle.
 * `onGenerate` may resolve `false` to say "no draft was produced" (cancelled confirm,
 * or the caller already showed its own error), which skips the "Draft ready" state.
 * A rejection shows an inline error and is announced. Requests past ~60s count as errors.
 * See docs/design handoff: labels are verb-first; one primary per view.
 */
export default function AIButton({
  variant = "primary",
  size = "md",
  compact = false,
  iconOnly = false,
  label = "Generate with AI",
  onGenerate,
  disabled = false,
  disabledReason,
  describedBy,
  errorMessage = "We couldn't generate a draft. Try again.",
  liveRegion = true,
}) {
  const [state, setState] = useState("idle"); // idle | loading | done
  const [error, setError] = useState("");
  const [announce, setAnnounce] = useState("");
  const timer = useRef(null);
  const mounted = useRef(true);
  const busy = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);

  async function handleClick() {
    if (disabled || busy.current) return;
    busy.current = true;
    setError("");
    setState("loading");
    setAnnounce("Generating a draft…");
    let timeoutId;
    try {
      const result = await Promise.race([
        Promise.resolve(onGenerate?.()),
        new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS); }),
      ]);
      if (!mounted.current) return;
      if (result === false) {
        setState("idle");
        setAnnounce("");
        return;
      }
      setState("done");
      setAnnounce("Draft ready. Review it before saving.");
      timer.current = setTimeout(() => mounted.current && setState("idle"), DONE_MS);
    } catch (e) {
      if (!mounted.current) return;
      const message = e?.message && e.message !== "timeout" ? e.message : errorMessage;
      setError(message);
      setAnnounce(message);
      setState("idle");
    } finally {
      clearTimeout(timeoutId);
      busy.current = false;
    }
  }

  const effective = disabled ? "disabled" : state;
  const text = state === "loading" ? "Generating…" : state === "done" ? "Draft ready" : label;
  const cls = [
    "ai-btn",
    `ai-btn--${variant}`,
    size === "lg" && "ai-btn--lg",
    compact && "ai-btn--compact",
    iconOnly && "ai-btn--icon",
    `is-${effective}`,
  ].filter(Boolean).join(" ");

  return (
    <>
      <button
        type="button"
        className={cls}
        onClick={handleClick}
        disabled={disabled}
        aria-busy={state === "loading" ? "true" : undefined}
        aria-label={iconOnly ? text : undefined}
        aria-describedby={describedBy}
        title={disabled && disabledReason ? disabledReason : iconOnly ? text : undefined}
      >
        {state === "loading" ? <SpinnerIcon /> : state === "done" ? <CheckIcon /> : <SparkleIcon />}
        {iconOnly ? null : <span>{text}</span>}
      </button>
      {liveRegion && <span className="sr-only" role="status" aria-live="polite">{announce}</span>}
      {error && <p className="ai-error" role="alert">{error}</p>}
    </>
  );
}

import React, { useEffect, useRef, useState } from "react";
import "./ai.css";
import { SparkIcon, CheckIcon } from "../ui/icons.jsx";

/**
 * The AI mark is the Discover spark (four-point orange star). It replaced the two-star sparkle on
 * 2026-11-14: one symbol for AI everywhere. `SparkleIcon` stays as an alias so existing imports keep working.
 */
export function SparkleIcon() {
  return <SparkIcon />;
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
  label = "Draft with AI",
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
        {state === "done" ? <CheckIcon /> : <SparkIcon />}
        {iconOnly ? null : <span>{text}</span>}
      </button>
      {liveRegion && <span className="sr-only" role="status" aria-live="polite">{announce}</span>}
      {error && <p className="ai-error" role="alert">{error}</p>}
    </>
  );
}

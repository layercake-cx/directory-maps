import React from "react";
import { useAssistant } from "../assistant/AssistantProvider.jsx";
import { SparkIcon } from "../ui/index.js";
import { ASSISTANT_NAME } from "../assistant/constants.js";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");

/** Top-bar trigger for the Ask Pip preview. Renders nothing when the assistant flag is off for this user. */
export default function AskPipButton() {
  const a = useAssistant();
  if (!a) return null;
  return (
    <button
      type="button"
      className="ask-pip-btn"
      aria-haspopup="dialog"
      aria-expanded={a.open}
      aria-keyshortcuts="Meta+J Control+J"
      onClick={a.toggle}
    >
      <SparkIcon size={16} />
      <span>Ask {ASSISTANT_NAME}</span>
      <span className="ask-pip-kbd" aria-hidden="true">{isMac ? "⌘J" : "Ctrl+J"}</span>
    </button>
  );
}

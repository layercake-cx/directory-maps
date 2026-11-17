import React from "react";
import { Link } from "react-router-dom";
import { Callout } from "../ui/index.js";
import "../../styles/wave-a/batch-4.css";

/**
 * Inline explanation shown beside an AI action that is greyed out because the organisation has no
 * usable AI connection. Plain English, with a link to where the connection is set up. There is no
 * Layercake-held fallback, so this is the only path to using AI.
 */
export default function AiUnavailableNotice({ message, href, style }) {
  if (!message) return null;
  return (
    <Callout tone="warn" className="b4-ai-notice" style={style}>
      {message}{" "}
      {href ? <Link to={href}>Set up your AI account in Integrations</Link> : null}
    </Callout>
  );
}

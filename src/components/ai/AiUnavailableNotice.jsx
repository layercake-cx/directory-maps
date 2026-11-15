import React from "react";
import { Link } from "react-router-dom";
import { Callout } from "../ui/index.js";
import "../../styles/wave-a/batch-4.css";

/** Inline explanation shown instead of (or beside) an AI action when no provider is usable. */
export default function AiUnavailableNotice({ message, href, style }) {
  if (!message) return null;
  return (
    <Callout tone="warn" className="b4-ai-notice" style={style}>
      {message}{" "}
      {href ? <Link to={href}>Connect an AI provider</Link> : null}
    </Callout>
  );
}

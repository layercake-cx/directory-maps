import React from "react";
import { Link } from "react-router-dom";

/** Inline explanation shown instead of (or beside) an AI action when no provider is usable. */
export default function AiUnavailableNotice({ message, href, style }) {
  if (!message) return null;
  return (
    <p
      style={{
        margin: "6px 0",
        padding: "6px 10px",
        borderRadius: 7,
        border: "1px solid #fde68a",
        background: "#fffbeb",
        color: "#92400e",
        fontSize: 12,
        ...style,
      }}
    >
      {message}{" "}
      {href ? (
        <Link to={href} style={{ color: "inherit", fontWeight: 600 }}>
          Connect an AI provider
        </Link>
      ) : null}
    </p>
  );
}

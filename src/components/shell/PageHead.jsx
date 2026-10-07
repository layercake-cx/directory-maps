import React from "react";

/**
 * Standard page heading used across the client portal and staff admin: serif title, one-line muted
 * subtitle, optional actions on the right. Matches the Directories page — use this (not a card
 * title or a bare h2) for the top of every page or workspace section.
 */
export default function PageHead({ title, subtitle, actions, style }) {
  return (
    <div className="page-head" style={{ marginBottom: 16, ...style }}>
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle ? (
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--shell-text-muted)" }}>{subtitle}</p>
        ) : null}
      </div>
      {actions}
    </div>
  );
}

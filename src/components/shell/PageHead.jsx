import React from "react";
import { Link } from "react-router-dom";

/**
 * Standard page heading used across the client portal and staff admin. Always the first child of <main>.
 * @param {{
 *   title: React.ReactNode,                       // required, renders h1.page-title
 *   subtitle?: React.ReactNode,                   // one line, muted
 *   eyebrow?: React.ReactNode,                    // small label above the title ("Platform", "Getting started")
 *   breadcrumb?: {label: string, to?: string}[],  // nav above the title; the last item is plain text
 *   status?: React.ReactNode,                     // a Pill shown after the title
 *   actions?: React.ReactNode,                    // right side: max two buttons, one primary; extras in an OverflowMenu
 *   size?: "md"|"sm",                             // md 40px; record editors pass sm (32px)
 *   style?: React.CSSProperties,
 * }} props
 */
export default function PageHead({ title, subtitle, eyebrow, breadcrumb, status, actions, size = "md", style }) {
  const crumbs = breadcrumb && breadcrumb.length > 0 ? breadcrumb : null;
  return (
    <div className="page-head" style={{ marginBottom: 16, ...style }}>
      <div className="page-head-text">
        {crumbs ? (
          <nav className="breadcrumb" aria-label="Breadcrumb">
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                <React.Fragment key={`${c.label}-${i}`}>
                  {i > 0 ? <span aria-hidden="true">/</span> : null}
                  {last || !c.to ? <span aria-current={last ? "page" : undefined}>{c.label}</span> : <Link to={c.to}>{c.label}</Link>}
                </React.Fragment>
              );
            })}
          </nav>
        ) : null}
        {eyebrow ? <p className="page-eyebrow">{eyebrow}</p> : null}
        <div className="page-title-row">
          <h1 className={`page-title ${size === "sm" ? "page-title--sm" : ""}`.trim()}>{title}</h1>
          {status}
        </div>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-head-actions">{actions}</div> : null}
    </div>
  );
}

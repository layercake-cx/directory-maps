import React from "react";
import PageHead from "../shell/PageHead.jsx";
import { Tabs } from "./layout.jsx";
import { SaveBar } from "./overlays.jsx";

/**
 * Page templates (docs/design/discover-ui/reference/10-13). Pages stop hand-rolling page structure:
 * pick the template, pass `head` (PageHead props) and put Sections inside.
 *
 * Template 4 (platform) is the same helpers rendered inside `context="platform"`.
 */

/**
 * Template 1: rail-level workspace page (no feature panel).
 * @param {{ head: object, summary?: React.ReactNode, aside?: React.ReactNode, children: React.ReactNode }} props
 */
export function PageLayout({ head, summary, aside, children, className = "" }) {
  return (
    <>
      <PageHead {...head} />
      {summary ? <div className="page-summary">{summary}</div> : null}
      <div className={`page-grid ${aside ? "page-grid--aside" : ""} ${className}`.trim()}>
        <div className="page-primary">{children}</div>
        {aside ? <aside className="page-aside">{aside}</aside> : null}
      </div>
    </>
  );
}

/**
 * Template 2: feature-panel sub-page. Stacked Sections (max 880px) and an optional SaveBar.
 * @param {{ head: object, saveBar?: object, children: React.ReactNode }} props `saveBar` is SaveBar's props.
 */
export function SettingsLayout({ head, saveBar, children, className = "" }) {
  return (
    <>
      <PageHead {...head} />
      <div className={`section-stack ${className}`.trim()}>{children}</div>
      {saveBar ? <SaveBar {...saveBar} /> : null}
    </>
  );
}

/**
 * Template 3: record editor. Breadcrumb (via head.breadcrumb), tabs, form column (max 760px),
 * optional sticky preview aside (360px), SaveBar.
 * @param {{ head: object, tabs?: {tabs: object[], current: string, onSelect?: Function, label?: string},
 *   preview?: React.ReactNode, saveBar?: object, children: React.ReactNode }} props
 */
export function RecordLayout({ head, tabs, preview, saveBar, children, className = "" }) {
  return (
    <>
      <PageHead size="sm" {...head} />
      {tabs ? <Tabs {...tabs} /> : null}
      <div className={`record-grid ${preview ? "record-grid--preview" : ""} ${className}`.trim()}>
        <div className="record-form">{children}</div>
        {preview ? <aside className="record-preview" aria-label="Preview">{preview}</aside> : null}
      </div>
      {saveBar ? <SaveBar {...saveBar} /> : null}
    </>
  );
}

import React from "react";

/**
 * The only chrome on the focused editing route: brand, Back, the page's name and state, the Content/SEO toggle, the
 * Editor/Preview toggle (Content only), Save draft and Publish. Dark and greyscale so the page being edited carries the
 * colour. Sticky; wraps onto two rows on narrow screens.
 */
export default function FocusedEditorHeader({
  backHref, backLabel, onBack, collection, title, typeBadge, state, surface, onSurface, contentLabel,
  mode, onMode, onSave, onPublish, saving, publishing, canSave, canPublish, publishTitle,
}) {
  const tabs = [{ id: "content", label: contentLabel }, { id: "seo", label: "SEO" }];
  return (
    <header className="fe-header">
      <div className="fe-header__brand" aria-label="Discover">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></svg>
        <span>Discover</span>
      </div>
      <a className="fe-header__back" href={backHref} onClick={onBack}>← {backLabel}</a>
      <div className="fe-header__title">
        <span className="fe-header__collection">{collection}</span>
        <span className="fe-header__name"><h1>{title}</h1><span className="fe-header__badge">{typeBadge}</span><span className="fe-header__state" role="status">{state}</span></span>
      </div>
      <div className="fe-header__spacer" />
      <div className="fe-toggle" role="tablist" aria-label="What to edit">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" id={`fe-tab-${t.id}`} aria-selected={surface === t.id} aria-controls={`fe-panel-${t.id}`} className={surface === t.id ? "is-on" : ""} onClick={() => onSurface(t.id)}>{t.label}</button>
        ))}
      </div>
      {surface === "content" ? (
        <div className="fe-toggle" role="group" aria-label="Mode">
          {[["edit", "Editor"], ["preview", "Preview"]].map(([id, label]) => (
            <button key={id} type="button" aria-pressed={mode === id} className={mode === id ? "is-on" : ""} onClick={() => onMode(id)}>{label}</button>
          ))}
        </div>
      ) : null}
      <button type="button" className="fe-btn" onClick={onSave} disabled={!canSave || saving}>{saving ? "Saving…" : "Save draft"}</button>
      <button type="button" className="fe-btn fe-btn--primary" onClick={onPublish} disabled={!canPublish || publishing} title={publishTitle}>{publishing ? "Publishing…" : "Publish"}</button>
    </header>
  );
}

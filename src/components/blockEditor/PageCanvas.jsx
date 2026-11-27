import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

/**
 * The page as published, in an iframe, with editing controls laid over it.
 *
 * The HTML comes from the real generator (renderPagePreview), so the canvas is the page itself: same markup, same theme.
 * The iframe is sandboxed without scripts (allow-same-origin only), so nothing in the page can run; the editor reads its
 * DOM to place outlines and toolbars. Controls live in this React tree, over the iframe, never inside the page.
 *
 * Edit mode: every block carries data-ds-block / data-ds-type and every region data-ds-zone (added by the server in
 * edit mode). Hovering outlines a block and shows its toolbar; clicking opens it. Preview mode: the plain page.
 */

const BLOCK = "[data-ds-block]";

function useTick() {
  const [, set] = useState(0);
  const frame = useRef(0);
  return useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => set((n) => n + 1));
  }, []);
}

export default function PageCanvas({
  html, mode, width, loading, error, blocksByKey, selectedKey, onSelect, onEdit, onNudge, onRemove, readOnly,
  drag, onPointerMoveInFrame,
}) {
  const frameRef = useRef(null);
  const wrapRef = useRef(null);
  const [hoverKey, setHoverKey] = useState(null);
  const [docReady, setDocReady] = useState(0);
  const tick = useTick();
  const scrollTop = useRef(0);
  const editing = mode === "edit";

  const doc = () => frameRef.current?.contentDocument ?? null;

  // Keep the reader where they were when the page is re-rendered after an edit.
  useLayoutEffect(() => {
    const d = doc();
    scrollTop.current = d?.scrollingElement?.scrollTop ?? scrollTop.current;
  }, [html]);

  const onLoad = useCallback(() => {
    const d = doc();
    if (!d) return;
    if (d.scrollingElement) d.scrollingElement.scrollTop = scrollTop.current;
    // Nothing in the page may navigate away from the editor.
    d.addEventListener("click", (e) => {
      const a = e.target.closest?.("a[href]");
      if (a && editing) e.preventDefault();
      if (!editing) return;
      const el = e.target.closest?.(BLOCK);
      if (el) { e.preventDefault(); onSelect?.(el.getAttribute("data-ds-block")); onEdit?.(el.getAttribute("data-ds-block")); }
    }, true);
    d.addEventListener("mousemove", (e) => {
      if (!editing) return;
      const el = e.target.closest?.(BLOCK);
      setHoverKey(el ? el.getAttribute("data-ds-block") : null);
      onPointerMoveInFrame?.(e, d);
    });
    d.defaultView.addEventListener("scroll", tick, { passive: true });
    d.defaultView.addEventListener("resize", tick);
    if (typeof ResizeObserver !== "undefined" && d.body) new ResizeObserver(tick).observe(d.body);
    // Images and fonts arrive after load and move things.
    d.defaultView.addEventListener("load", tick);
    setDocReady((n) => n + 1);
    tick();
  }, [editing, onSelect, onEdit, onPointerMoveInFrame, tick]);

  useEffect(() => { tick(); }, [width, mode, tick]);

  const rectOf = (key) => {
    const d = doc();
    if (!d || !key) return null;
    const el = d.querySelector(`[data-ds-block="${CSS.escape(key)}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  };

  const activeKey = hoverKey ?? selectedKey;
  const rect = editing ? rectOf(activeKey) : null;
  const block = activeKey ? blocksByKey.get(activeKey) : null;

  // Toolbar sits in the block's top-right corner, kept inside the frame.
  const toolbarStyle = useMemo(() => {
    if (!rect) return null;
    const frame = frameRef.current;
    const maxLeft = (frame?.clientWidth ?? 800) - 8;
    return { top: Math.max(4, rect.top + 6), left: Math.min(maxLeft, rect.left + rect.width - 6) };
  }, [rect]);

  void docReady;
  return (
    <div className={`fe-canvas fe-canvas--${width}`} ref={wrapRef}>
      {error ? <div className="fe-canvas__msg" role="alert">{error}</div> : null}
      {loading ? <div className="fe-canvas__busy" aria-live="polite">Updating the page…</div> : null}
      <div className="fe-canvas__stage" onMouseLeave={() => setHoverKey(null)}>
        <iframe
          ref={frameRef}
          className="fe-canvas__frame"
          title={editing ? "Page being edited" : "Page preview"}
          sandbox="allow-same-origin"
          srcDoc={html}
          onLoad={onLoad}
        />
        {editing ? (
          <div className="fe-overlay" aria-hidden={false}>
            {rect ? <div className="fe-outline" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} /> : null}
            {drag?.target ? <DropMarker target={drag.target} /> : null}
            {rect && block && toolbarStyle && !drag ? (
              <div className="fe-toolbar" style={{ top: toolbarStyle.top, left: toolbarStyle.left }} role="toolbar" aria-label={`${block.label} block`}>
                <span className="fe-toolbar__name">{block.label}</span>
                {block.badges.map((b) => <span key={b} className="fe-badge">{b}</span>)}
                <button type="button" className="fe-tbtn fe-tbtn--text" onClick={() => onEdit(block.key)}>{block.can_edit ? "Edit" : "View"}</button>
                <button type="button" className="fe-tbtn" aria-label="Move up" disabled={readOnly || !block.can_move} onClick={() => onNudge(block.key, -1)}>↑</button>
                <button type="button" className="fe-tbtn" aria-label="Move down" disabled={readOnly || !block.can_move} onClick={() => onNudge(block.key, 1)}>↓</button>
                <button type="button" className="fe-tbtn" aria-label="Remove" disabled={readOnly || !block.can_remove} onClick={() => onRemove(block.key)}>×</button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DropMarker({ target }) {
  return <div className="fe-drop" style={{ top: target.top, left: target.left, width: target.width }} />;
}

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";

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

/**
 * Where a pointer would drop a block. Geometry only: reads the zones and blocks the server marked in the page.
 * Returns { zone, index, line: {top,left,width} } (coordinates relative to the frame), or null when the pointer is not
 * over any zone. `index` counts the zone's blocks (excluding `excludeKey`, the block being moved) above the pointer.
 */
function hitTestFrame(frame, clientX, clientY, excludeKey) {
  const d = frame?.contentDocument;
  if (!d) return null;
  const fr = frame.getBoundingClientRect();
  const x = clientX - fr.left;
  const y = clientY - fr.top;
  if (x < 0 || y < 0 || x > fr.width || y > fr.height) return null;
  const PAD = 12;
  const zones = [...d.querySelectorAll("[data-ds-zone]")].map((el) => ({ el, name: el.getAttribute("data-ds-zone"), r: el.getBoundingClientRect() }));
  const inside = zones
    .filter(({ r }) => x >= r.left - PAD && x <= r.right + PAD && y >= r.top - PAD && y <= r.bottom + PAD)
    .sort((a, b) => a.r.width * a.r.height - b.r.width * b.r.height);
  const hit = inside[0];
  if (!hit) return null;
  // Blocks that belong to this zone (not to a zone nested inside it), in page order, without the block being dragged.
  const all = zones.filter((z) => z.name === hit.name);
  const blocks = all.flatMap((z) => [...z.el.querySelectorAll("[data-ds-block]")].filter((b) => b.closest("[data-ds-zone]") === z.el))
    .filter((b) => b.getAttribute("data-ds-block") !== excludeKey)
    .map((el) => ({ el, r: el.getBoundingClientRect() }));
  let index = 0;
  for (const b of blocks) if (b.r.top + b.r.height / 2 < y) index += 1;
  const width = hit.r.width;
  let line;
  if (blocks.length === 0) line = { top: hit.r.top + 8, left: hit.r.left, width };
  else if (index < blocks.length) line = { top: blocks[index].r.top - 4, left: blocks[index].r.left, width: blocks[index].r.width };
  else { const last = blocks[blocks.length - 1]; line = { top: last.r.bottom + 2, left: last.r.left, width: last.r.width }; }
  return { zone: hit.name, index, line };
}

const PageCanvas = forwardRef(function PageCanvas({
  html, mode, width, loading, error, blocksByKey, selectedKey, onSelect, onEdit, onNudge, onRemove, readOnly,
  drag, onPointerMoveInFrame, onStartMove,
}, ref) {
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

  useImperativeHandle(ref, () => ({
    hitTest: (x, y, excludeKey) => hitTestFrame(frameRef.current, x, y, excludeKey),
  }), []);

  // While dragging, every zone is outlined: dashed where the block may go, faded where it may not.
  const zoneBoxes = useMemo(() => {
    const d = doc();
    if (!drag || !d) return [];
    const names = { hero: "Hero", main: "Main", sidebar: "Sidebar" };
    return [...d.querySelectorAll("[data-ds-zone]")].map((el) => {
      const r = el.getBoundingClientRect();
      const name = el.getAttribute("data-ds-zone");
      const ok = drag.accepts(name);
      return { key: `${name}-${Math.round(r.top)}-${Math.round(r.left)}`, name, label: `${names[name] ?? name} · ${ok ? `Accepts ${drag.label}` : `Doesn't accept ${drag.label}`}`, ok, top: r.top, left: r.left, width: r.width, height: Math.max(r.height, 36) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, docReady, html]);

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
      <div className={`fe-canvas__stage${drag ? " is-dragging" : ""}`} onMouseLeave={() => setHoverKey(null)}>
        <iframe
          ref={frameRef}
          className="fe-canvas__frame"
          title={editing ? "Page being edited" : "Page preview"}
          sandbox="allow-same-origin"
          srcDoc={html}
          onLoad={onLoad}
        />
        {editing ? (
          <div className={`fe-overlay${drag ? " is-dragging" : ""}`} aria-hidden={false}>
            {rect && !drag ? <div className="fe-outline" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} /> : null}
            {zoneBoxes.map((z) => (
              <div key={z.key} className={`fe-zone ${z.ok ? "is-ok" : "is-no"}`} style={{ top: z.top, left: z.left, width: z.width, height: z.height }}>
                <span className="fe-zone__label">{z.label}</span>
              </div>
            ))}
            {drag?.target ? <DropMarker target={drag.target} /> : null}
            {rect && block && toolbarStyle && !drag ? (
              <div className="fe-toolbar" style={{ top: toolbarStyle.top, left: toolbarStyle.left }} role="toolbar" aria-label={`${block.label} block`}>
                <button type="button" className="fe-tbtn fe-tbtn--grip" aria-label={`Drag ${block.label} to move it`} title="Drag to move" disabled={readOnly || !block.can_move} onPointerDown={(e) => onStartMove?.(e, block.key)}>⋮⋮</button>
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
});

export default PageCanvas;

function DropMarker({ target }) {
  return <div className="fe-drop" style={{ top: target.top, left: target.left, width: target.width }}><span>Drop here</span></div>;
}

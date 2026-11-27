import { useRef, useState } from "react";

/**
 * Pointer-driven drag for the focused editor (library item or a block's grip onto the page).
 *
 * Pointer events, not HTML5 drag and drop (the repo forbids it, and it cannot be told apart from a click or scrolled
 * reliably). The frame is made transparent to the pointer while dragging (see .is-dragging in focused-editor.css) so
 * window-level listeners keep receiving moves. Nothing is re-rendered inside the page during a drag; the overlay in the
 * canvas draws the zones and the drop line from `drag`. Every drag has a non-drag alternative (the + button, the
 * toolbar arrows, the outline's Move-to menu).
 *
 * resolve(payload) -> { label, accepts(zone), excludeKey } or null
 * onDrop(payload, { zone, index })   called once on a valid drop
 * onMessage(text)                    live-region status for refused drops and cancels
 */
export function useBlockDrag({ readOnly, canvasRef, resolve, onDrop, onMessage, onStart }) {
  const [drag, setDrag] = useState(null);
  const last = useRef(null);

  const startDrag = (e, payload) => {
    if (readOnly || e.button !== 0) return;
    const info = resolve(payload);
    if (!info) return;
    const { label, accepts, excludeKey = null } = info;
    const startX = e.clientX;
    const startY = e.clientY;
    let started = false;

    const onMove = (ev) => {
      if (!started) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return;
        started = true;
        document.documentElement.classList.add("fe-dragging");
        onStart?.();
      }
      const hit = canvasRef.current?.hitTest(ev.clientX, ev.clientY, excludeKey) ?? null;
      const ok = hit && accepts(hit.zone) ? hit : null;
      last.current = { ok, hit };
      setDrag({ label, accepts, target: ok ? { ...ok.line, zone: ok.zone, index: ok.index } : null, ghost: { x: ev.clientX, y: ev.clientY } });
    };
    const finish = (cancel) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("fe-dragging");
      setDrag(null);
      if (!started) return;
      if (cancel) { onMessage?.(`${label}: drag cancelled.`); return; }
      const { ok, hit } = last.current ?? {};
      if (!ok) { onMessage?.(hit ? `${label} doesn't go in the ${hit.zone} region.` : `${label} was dropped outside the page, so nothing changed.`); return; }
      onDrop(payload, { zone: ok.zone, index: ok.index });
    };
    const onUp = () => finish(false);
    const onKey = (ev) => { if (ev.key === "Escape") finish(true); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
  };

  return { drag, startDrag };
}

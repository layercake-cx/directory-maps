import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { GripIcon } from "./icons.jsx";
import { OverflowMenu } from "./overlays.jsx";
import { Callout, useToast } from "./feedback.jsx";

/**
 * Drag-to-reorder: one shared pattern for every list in the admin where people change order.
 * Spec: docs/design/discover-ui/REORDER_BRIEF.md. Built on Pointer Events (no HTML5 draggable, no dependency):
 * mouse (move 4px to lift), touch/pen (hold 200ms), keyboard (Space/Enter, arrows, Home/End, Esc) and a ⋯ menu.
 */

const LIFT_MOVE_PX = 4;
const LIFT_HOLD_MS = 200;
const EDGE_PX = 48;
const NEST_PX = 32;

function moveItem(arr, from, to) {
  const next = arr.slice();
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

function scrollParentOf(el) {
  let node = el?.parentElement;
  while (node && node !== document.body) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * The behaviour behind SortableList. Use directly for editor lists with custom rows:
 *   const s = useSortable({ items, getId, getLabel, onReorder });
 *   <ol {...s.listProps}>{s.items.map((it, i) => { const r = s.rowFor(it, i); return <li key={…} {...r.rowProps}>…<SortableHandle {...r.handleProps} /></li>; })}{s.slot}</ol>{s.after}
 * `onReorder(nextItems, { from, to, item, parentId })` is synchronous here; saving rules live in SortableList.
 */
export function useSortable({ items, getId, getLabel, onReorder, disabled = false, nestable = false, getParentId, ariaLabel, variant = "default" }) {
  const instructionId = useId();
  const listEl = useRef(null);
  const rowEls = useRef(new Map());
  const handleEls = useRef(new Map());
  const focusId = useRef(null);
  const [drag, setDrag] = useState(null);
  const [kbd, setKbd] = useState(null);
  const [message, setMessage] = useState("");
  const press = useRef(null);
  const dragRef = useRef(null);
  dragRef.current = drag;
  const kbdRef = useRef(null);
  kbdRef.current = kbd;
  const latest = useRef({});
  latest.current = { items, getId, getLabel, onReorder, nestable, getParentId };

  const announce = useCallback((msg) => setMessage(msg), []);

  // Keyboard mode shows the working order; otherwise the real one.
  const displayItems = useMemo(() => {
    if (!kbd) return items;
    const byId = new Map(items.map((it) => [getId(it), it]));
    return kbd.order.map((id) => byId.get(id)).filter(Boolean);
  }, [items, kbd, getId]);

  useLayoutEffect(() => {
    if (focusId.current != null) {
      handleEls.current.get(focusId.current)?.focus();
      focusId.current = null;
    }
  });

  const commit = useCallback((nextItems, meta) => {
    latest.current.onReorder?.(nextItems, meta);
  }, []);

  /* ---------- shared moves (⋯ menu and keyboard drop) ---------- */
  const moveTo = useCallback((index, target, verb) => {
    const { items: cur, getId: gid, getLabel: gl } = latest.current;
    const t = Math.max(0, Math.min(cur.length - 1, target));
    if (t === index) return;
    const item = cur[index];
    const next = moveItem(cur, index, t);
    focusId.current = null;
    setMessage(`${gl(item)} moved ${verb}, position ${t + 1} of ${cur.length}.`);
    commit(next, { from: index, to: t, item, parentId: undefined, id: gid(item) });
  }, [commit]);

  /* ---------- pointer drag ---------- */
  const measure = () => {
    const { items: cur, getId: gid } = latest.current;
    const tops = [];
    const heights = [];
    cur.forEach((it) => {
      const el = rowEls.current.get(gid(it));
      tops.push(el ? el.offsetTop : 0);
      heights.push(el ? el.offsetHeight : 0);
    });
    return { tops, heights };
  };

  const computeDrag = useCallback((base, clientX, clientY) => {
    const list = listEl.current;
    if (!list) return base;
    const { items: cur, nestable: canNest, getId: gid } = latest.current;
    const rect = list.getBoundingClientRect();
    const h = base.heights[base.from];
    const total = list.scrollHeight;
    let pos = clientY - rect.top - base.grab;
    pos = Math.max(0, Math.min(total - h, pos));
    const center = pos + h / 2;
    let over = 0;
    cur.forEach((_, i) => {
      if (i === base.from) return;
      if (base.tops[i] + base.heights[i] / 2 < center) over += 1;
    });
    // undefined = parent unchanged; an id = nest under that row; null = move out to the top level.
    let nest;
    if (canNest) {
      const dx = clientX - base.startX;
      if (dx >= NEST_PX && over > 0) {
        const others = cur.filter((_, i) => i !== base.from);
        nest = gid(others[over - 1]);
      } else if (dx <= -NEST_PX) {
        nest = null;
      }
    }
    return { ...base, dy: pos - base.tops[base.from], over, nest, pos, outside: false };
  }, []);

  const endPress = useCallback(() => {
    const p = press.current;
    if (!p) return;
    clearTimeout(p.timer);
    cancelAnimationFrame(p.raf);
    document.removeEventListener("keydown", p.onKey, true);
    try { p.handle?.releasePointerCapture?.(p.pointerId); } catch { /* already released */ }
    press.current = null;
  }, []);

  const cancelDrag = useCallback((why = "cancel") => {
    const d = dragRef.current;
    endPress();
    if (d) {
      const { items: cur, getLabel: gl } = latest.current;
      const item = cur[d.from];
      setDrag(null);
      if (why === "cancel" && item) setMessage(`Cancelled. ${gl(item)} is back at position ${d.from + 1}.`);
      focusId.current = d.id;
    }
  }, [endPress]);

  const lift = useCallback(() => {
    const p = press.current;
    if (!p || p.lifted) return;
    p.lifted = true;
    const { items: cur, getLabel: gl } = latest.current;
    const { tops, heights } = measure();
    const rect = listEl.current.getBoundingClientRect();
    const base = {
      id: p.id, from: p.index, over: p.index, dy: 0, nest: undefined, tops, heights,
      grab: p.startY - rect.top - tops[p.index], startX: p.startX, pos: tops[p.index], outside: false, nest: undefined,
    };
    p.base = base;
    setDrag(base);
    setMessage(`Picked up ${gl(cur[p.index])}. Position ${p.index + 1} of ${cur.length}.`);
    navigator.vibrate?.(10);
    // Auto-scroll near the edge of the nearest scroll container; recompute from the last pointer position each frame.
    const scroller = scrollParentOf(listEl.current);
    const loop = () => {
      const cp = press.current;
      if (!cp || !cp.lifted) return;
      const box = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      let speed = 0;
      if (cp.y < box.top + EDGE_PX) speed = -Math.ceil((box.top + EDGE_PX - cp.y) / 4);
      else if (cp.y > box.bottom - EDGE_PX) speed = Math.ceil((cp.y - (box.bottom - EDGE_PX)) / 4);
      speed = Math.max(-18, Math.min(18, speed));
      if (speed) {
        if (scroller) scroller.scrollTop += speed;
        else window.scrollBy(0, speed);
      }
      setDrag((d) => (d ? computeDrag(cp.base, cp.x, cp.y) : d));
      cp.raf = requestAnimationFrame(loop);
    };
    p.raf = requestAnimationFrame(loop);
  }, [computeDrag]);

  const onHandlePointerDown = useCallback((e, id, index) => {
    if (press.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    const handle = e.currentTarget;
    try { handle.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    const onKey = (ev) => {
      if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); cancelDrag(); }
    };
    document.addEventListener("keydown", onKey, true);
    press.current = {
      id, index, handle, pointerId: e.pointerId, type: e.pointerType, startX: e.clientX, startY: e.clientY,
      x: e.clientX, y: e.clientY, lifted: false, onKey, timer: null, raf: 0, base: null,
    };
    if (e.pointerType !== "mouse") press.current.timer = setTimeout(lift, LIFT_HOLD_MS);
  }, [cancelDrag, lift]);

  const onHandlePointerMove = useCallback((e) => {
    const p = press.current;
    if (!p || e.pointerId !== p.pointerId) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (!p.lifted) {
      const moved = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
      if (p.type === "mouse") {
        if (moved >= LIFT_MOVE_PX) lift();
      } else if (moved > 8) {
        endPress(); // finger moved before the hold finished: let the page scroll
      }
      return;
    }
    e.preventDefault();
    setDrag((d) => (d ? computeDrag(p.base, e.clientX, e.clientY) : d));
  }, [computeDrag, endPress, lift]);

  const onHandlePointerUp = useCallback((e) => {
    const p = press.current;
    if (!p || e.pointerId !== p.pointerId) return;
    const d = dragRef.current;
    if (!p.lifted || !d) { endPress(); return; }
    const rect = listEl.current?.getBoundingClientRect();
    const outside = rect && (e.clientX < rect.left - 48 || e.clientX > rect.right + 48 || e.clientY < rect.top - 32 || e.clientY > rect.bottom + 32);
    const final = computeDrag(p.base, e.clientX, e.clientY);
    endPress();
    setDrag(null);
    const { items: cur, getLabel: gl, getParentId: gp, getId: gid } = latest.current;
    const item = cur[final.from];
    focusId.current = final.id;
    if (outside) {
      setMessage(`Cancelled. ${gl(item)} is back at position ${final.from + 1}.`);
      return;
    }
    const currentParent = gp ? gp(item) ?? null : null;
    const nestChanged = latest.current.nestable && final.nest !== undefined && (final.nest ?? null) !== currentParent;
    if (final.over === final.from && !nestChanged) {
      setMessage(`Cancelled. ${gl(item)} is back at position ${final.from + 1}.`);
      return;
    }
    const next = moveItem(cur, final.from, final.over);
    setMessage(`${gl(item)} dropped at position ${final.over + 1} of ${cur.length}.`);
    commit(next, { from: final.from, to: final.over, item, id: gid(item), parentId: latest.current.nestable ? final.nest : undefined });
  }, [commit, computeDrag, endPress]);

  useEffect(() => () => endPress(), [endPress]);

  /* ---------- keyboard ---------- */
  const onHandleKeyDown = useCallback((e, id, index) => {
    const { items: cur, getLabel: gl, getId: gid, getParentId: gp, nestable: canNest } = latest.current;
    const k = kbdRef.current;
    if (!k) {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setKbd({ id, from: index, order: cur.map(gid), parent: gp ? gp(cur[index]) ?? null : null, parentFrom: gp ? gp(cur[index]) ?? null : null });
        setMessage(`Picked up ${gl(cur[index])}. Position ${index + 1} of ${cur.length}.`);
        focusId.current = id;
      }
      return;
    }
    if (k.id !== id) return;
    const pos = k.order.indexOf(id);
    const label = gl(cur.find((it) => gid(it) === id));
    const setOrder = (to) => {
      const order = moveItem(k.order, pos, to);
      setKbd({ ...k, order });
      setMessage(`${label}, position ${to + 1} of ${order.length}.`);
      focusId.current = id;
    };
    if (e.key === "ArrowUp") { e.preventDefault(); if (pos > 0) setOrder(pos - 1); }
    else if (e.key === "ArrowDown") { e.preventDefault(); if (pos < k.order.length - 1) setOrder(pos + 1); }
    else if (e.key === "Home") { e.preventDefault(); if (pos > 0) setOrder(0); }
    else if (e.key === "End") { e.preventDefault(); if (pos < k.order.length - 1) setOrder(k.order.length - 1); }
    else if (canNest && e.key === "ArrowRight") {
      e.preventDefault();
      if (pos > 0) {
        setKbd({ ...k, parent: k.order[pos - 1] });
        setMessage(`${label} nested under ${gl(cur.find((it) => gid(it) === k.order[pos - 1]))}.`);
      }
    } else if (canNest && e.key === "ArrowLeft") {
      e.preventDefault();
      setKbd({ ...k, parent: null });
      setMessage(`${label} is at the top level.`);
    } else if (e.key === " " || e.key === "Enter" || e.key === "Tab") {
      if (e.key !== "Tab") e.preventDefault();
      const to = pos;
      const nestChanged = canNest && (k.parent ?? null) !== (k.parentFrom ?? null);
      setKbd(null);
      focusId.current = id;
      if (to === k.from && !nestChanged) {
        setMessage(`Cancelled. ${label} is back at position ${k.from + 1}.`);
        return;
      }
      const next = moveItem(cur, k.from, to);
      setMessage(`${label} dropped at position ${to + 1} of ${cur.length}.`);
      commit(next, { from: k.from, to, item: cur[k.from], id, parentId: canNest && nestChanged ? k.parent : undefined });
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setKbd(null);
      focusId.current = id;
      setMessage(`Cancelled. ${label} is back at position ${k.from + 1}.`);
    }
  }, [commit]);

  // Clicking away while a row is keyboard-lifted puts it back.
  useEffect(() => {
    if (!kbd) return undefined;
    const onDown = (e) => {
      if (!handleEls.current.get(kbdRef.current?.id)?.contains(e.target)) setKbd(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [kbd]);

  /* ---------- per-row props ---------- */
  const total = displayItems.length;
  const newTops = useMemo(() => {
    if (!drag) return null;
    const order = moveItem(items.map((_, i) => i), drag.from, drag.over);
    const map = new Map();
    let y = 0;
    order.forEach((origIndex) => {
      map.set(origIndex, y);
      y += drag.heights[origIndex];
    });
    return map;
  }, [drag, items]);

  const rowFor = (item, index) => {
    const id = getId(item);
    const label = getLabel(item);
    const origIndex = items.findIndex((it) => getId(it) === id);
    const isLifted = !!drag && drag.id === id;
    const isKbd = !!kbd && kbd.id === id;
    const depth = nestable && getParentId ? (isKbd ? kbd.parent : getParentId(item)) ? 1 : 0 : 0;
    const cls = ["sortable-row", isLifted && "sortable-row--lifted", isKbd && "sortable-row--kbd", depth && "sortable-row--nested"].filter(Boolean).join(" ");
    const style = {};
    if (drag && !isLifted && newTops) style["--sortable-dy"] = `${newTops.get(origIndex) - drag.tops[origIndex]}px`;
    if (isLifted) style["--sortable-dy"] = `${drag.dy}px`;
    const rowProps = {
      ref: (el) => { if (el) rowEls.current.set(id, el); else rowEls.current.delete(id); },
      className: cls,
      style,
      "data-id": id,
    };
    const handleProps = disabled ? null : {
      ref: (el) => { if (el) handleEls.current.set(id, el); else handleEls.current.delete(id); },
      "aria-label": `Reorder ${label}`,
      "aria-describedby": instructionId,
      onPointerDown: (e) => onHandlePointerDown(e, id, origIndex),
      onPointerMove: onHandlePointerMove,
      onPointerUp: onHandlePointerUp,
      onPointerCancel: () => cancelDrag(),
      onKeyDown: (e) => onHandleKeyDown(e, id, isKbd ? kbd.order.indexOf(id) : origIndex),
    };
    const menuItems = (extra = []) => {
      const move = disabled ? [] : [
        { label: "Move to top", disabled: index === 0, onSelect: () => moveTo(index, 0, "to the top") },
        { label: "Move up", disabled: index === 0, onSelect: () => moveTo(index, index - 1, "up") },
        { label: "Move down", disabled: index === total - 1, onSelect: () => moveTo(index, index + 1, "down") },
        { label: "Move to bottom", disabled: index === total - 1, onSelect: () => moveTo(index, total - 1, "to the bottom") },
      ];
      return move.length && extra.length ? [...move, { divider: true }, ...extra] : [...move, ...extra];
    };
    return { id, label, rowProps, handleProps, isDragging: isLifted, isLifted, isKbd, position: index + 1, total, depth, menuItems };
  };

  const slot = drag && newTops ? (
    <li
      aria-hidden="true"
      className={`sortable-slot${drag.nest ? " sortable-slot--nested" : ""}`}
      style={{ top: newTops.get(drag.from), height: drag.heights[drag.from] }}
    >
      {drag.nest ? <span>Nest under {getLabel(items.find((it) => getId(it) === drag.nest))}</span> : null}
    </li>
  ) : null;

  const lifted = kbd ? items.find((it) => getId(it) === kbd.id) : null;
  const after = (
    <>
      <span id={instructionId} className="sortable-sr">
        Press Space or Enter to pick up. Use the arrow keys to move, Space or Enter to drop, Escape to cancel.
      </span>
      <div className="sortable-sr" role="status" aria-live="polite">{message}</div>
      {kbd && lifted ? (
        <div className="sortable-kbd-bar" role="status">
          <strong>Moving {getLabel(lifted)}</strong> · position {kbd.order.indexOf(kbd.id) + 1} of {kbd.order.length}.{" "}
          {nestable ? "↑ ↓ to move, → ← to nest, " : "↑ ↓ to move, "}Space to drop, Esc to cancel.
        </div>
      ) : null}
    </>
  );

  const listProps = {
    ref: listEl,
    className: `sortable${variant === "compact" ? " sortable--compact" : ""}${drag ? " sortable--dragging" : ""}`,
    "aria-label": ariaLabel,
  };

  return { items: displayItems, rowFor, listProps, slot, after, announce, moveTo };
}

/** The drag handle button. Pass `handleProps` from `rowFor`; renders nothing for read-only lists. */
export const SortableHandle = React.forwardRef(function SortableHandle(props, ref) {
  if (!props || Object.keys(props).length === 0) return null;
  const { ref: innerRef, ...rest } = props;
  const setRef = (el) => {
    if (typeof innerRef === "function") innerRef(el);
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };
  return (
    <button type="button" className="sortable-handle" ref={setRef} {...rest}>
      <GripIcon />
    </button>
  );
});

/**
 * Default row: handle, position, title, meta line, trailing actions, ⋯ menu.
 * @param {{ row: ReturnType<ReturnType<typeof useSortable>["rowFor"]>, title: React.ReactNode, meta?: React.ReactNode,
 *   actions?: React.ReactNode, menuExtras?: object[], showPosition?: boolean, readOnly?: boolean }} props
 */
export function SortableRow({ row, title, meta, actions, menuExtras = [], showPosition = true }) {
  const items = row.menuItems(menuExtras);
  return (
    <>
      <SortableHandle {...(row.handleProps || {})} />
      {showPosition ? <span className="sortable-pos">{row.position}</span> : null}
      <span className="sortable-main">
        <span className="sortable-title">{title}</span>
        {meta ? <span className="sortable-meta">{meta}</span> : null}
      </span>
      {actions}
      {items.length ? <OverflowMenu label={`Actions for ${row.label}`} items={items} /> : null}
    </>
  );
}

/**
 * The standalone saving rules as a hook: optimistic update, "Order saved." toast with Undo, revert and an error message on
 * failure, queued saves (never overlapping). `onReorder` may return a Promise and should throw on failure.
 * Pass an `announceRef` ({ current: fn }) to have saves announced in the list's live region.
 * @returns {{ items: any[], save: Function, error: string }}
 */
export function useSavedOrder(items, onReorder, announceRef) {
  const { toast } = useToast();
  const [local, setLocal] = useState(items);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const pending = useRef(null);
  const lastGood = useRef(items);
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const say = (m) => announceRef?.current?.(m);

  useEffect(() => {
    if (saving.current) return;
    setLocal(items);
    lastGood.current = items;
  }, [items]);

  const save = useCallback(async (next, meta, opts) => {
    setError("");
    setLocal(next);
    if (saving.current) { pending.current = { next, meta }; return; }
    saving.current = true;
    let job = { next, meta };
    while (job) {
      const before = lastGood.current;
      const jobMeta = job.meta;
      try {
        await onReorderRef.current(job.next, jobMeta);
        lastGood.current = job.next;
        if (!pending.current) {
          say("Order saved.");
          if (!opts?.silent) {
            toast("Order saved.", { action: { label: "Undo", onClick: () => { void save(before, jobMeta, { silent: true }); } } });
          }
        }
      } catch (e) {
        setLocal(lastGood.current);
        setError(e?.message ?? "Couldn't save the new order. It's been put back.");
        say("Couldn't save the new order. It's been put back.");
        pending.current = null;
        break;
      }
      job = pending.current;
      pending.current = null;
    }
    saving.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  return { items: local, save, error };
}

/**
 * Sortable list with the standalone saving rules: optimistic update, "Order saved." toast with Undo, revert and a
 * danger Callout on failure, queued saves (never overlapping). With mode="form" `onReorder` only updates form state
 * (the page's SaveBar shows the unsaved change): no toast, no queue.
 *
 * @param {{ items: any[], getId: (i:any)=>string, getLabel: (i:any)=>string,
 *   onReorder: (next:any[], meta:{from:number,to:number,item:any,parentId?:string|null})=>void|Promise<void>,
 *   renderItem?: Function, getMeta?: Function, renderActions?: Function, getMenuItems?: Function,
 *   variant?: "default"|"compact", nestable?: boolean, getParentId?: Function, disabled?: boolean,
 *   ariaLabel: string, mode?: "standalone"|"form", showPosition?: boolean }} props
 */
export function SortableList({
  items, getId, getLabel, onReorder, renderItem, getMeta, renderActions, getMenuItems,
  variant = "default", nestable = false, getParentId, disabled = false, ariaLabel, mode = "standalone", showPosition = true,
}) {
  const announceRef = useRef(() => {});
  const standalone = mode !== "form";
  const saved = useSavedOrder(items, onReorder, announceRef);

  const sortable = useSortable({
    items: standalone ? saved.items : items,
    getId, getLabel, disabled, nestable, getParentId, ariaLabel, variant,
    onReorder: (next, meta) => {
      if (standalone) void saved.save(next, meta);
      else onReorder(next, meta);
    },
  });
  announceRef.current = sortable.announce;
  const error = standalone ? saved.error : "";

  return (
    <div className="sortable-wrap">
      {error ? <Callout tone="danger">{error}</Callout> : null}
      <ol {...sortable.listProps}>
        {sortable.items.map((item, i) => {
          const r = sortable.rowFor(item, i);
          const extra = getMenuItems ? getMenuItems(item) : [];
          return (
            <li key={getId(item)} {...r.rowProps}>
              {renderItem ? renderItem(item, {
                index: i, handleProps: r.handleProps, isDragging: r.isDragging, row: r, menuItems: r.menuItems(extra),
              }) : (
                <SortableRow
                  row={r}
                  title={getLabel(item)}
                  meta={getMeta ? getMeta(item) : null}
                  actions={renderActions ? renderActions(item) : null}
                  menuExtras={extra}
                  showPosition={showPosition}
                />
              )}
            </li>
          );
        })}
        {sortable.slot}
      </ol>
      {sortable.after}
    </div>
  );
}

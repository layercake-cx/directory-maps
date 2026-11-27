import React, { useMemo, useState } from "react";
import { Button, Pill, PlusIcon, Tabs, TextInput } from "../ui/index.js";
import { availableBlocks, blockName, blockSummary, groupedBlocks, regionLabel } from "../../lib/pageBlocks.js";

/**
 * Left panel of the focused editor. "Add blocks" is the library (the + button adds to the first region that accepts
 * the block; dragging onto the page does the same at the drop point). "On this page" lists the blocks with the same
 * actions as the canvas toolbar, so everything can be done without the pointer.
 */
export default function BlockLibraryPanel({
  kind, templates, usedTemplateIds, blocks, selectedKey, readOnly, onAdd, onAddTemplate, onSelect, onEdit, onNudge, onRemove, onMoveToRegion, onStartDrag,
}) {
  const [tab, setTab] = useState("add");
  const [q, setQ] = useState("");
  const groups = useMemo(() => groupedBlocks(kind), [kind]);
  const match = (name, extra = "") => !q.trim() || `${name} ${extra}`.toLowerCase().includes(q.trim().toLowerCase());
  const lib = templates.filter((t) => !usedTemplateIds.has(t.id) && match(t.name, blockName(t.block_type)));

  return (
    <aside className="fe-library" aria-label="Blocks">
      <Tabs
        label="Blocks panel"
        current={tab}
        onSelect={setTab}
        tabs={[{ id: "add", label: "Add blocks" }, { id: "page", label: `On this page (${blocks.length})` }]}
      />
      {tab === "add" ? (
        <div className="fe-library__body" role="tabpanel">
          <p className="fe-library__hint">Drag a block onto the page, or press + to add it to the first region that accepts it.</p>
          <TextInput type="search" aria-label="Search blocks" placeholder="Search blocks" value={q} onChange={(e) => setQ(e.target.value)} />
          {lib.length > 0 ? (
            <section aria-label="From the library">
              <h3 className="fe-library__group">From the library</h3>
              <ul className="fe-library__list">
                {lib.map((t) => (
                  <li key={t.id} className="fe-item" onPointerDown={(e) => !readOnly && onStartDrag?.(e, { template: t })}>
                    <span className="fe-item__main"><strong>{t.name}</strong><span>{blockName(t.block_type)} · {regionLabel(t.region)}</span></span>
                    {t.lock_position ? <Pill tone="warn">Position</Pill> : null}
                    {t.lock_content ? <Pill tone="warn">Content</Pill> : null}
                    <Button size="sm" aria-label={`Add ${t.name}`} disabled={readOnly} onClick={() => onAddTemplate(t)}><PlusIcon /></Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {groups.map((g) => {
            const items = g.blocks.filter((b) => match(b.name, b.purpose));
            if (items.length === 0) return null;
            return (
              <section key={g.id} aria-label={g.label}>
                <h3 className="fe-library__group">{g.label}</h3>
                <ul className="fe-library__list">
                  {items.map((b) => (
                    <li key={b.id} className="fe-item" onPointerDown={(e) => !readOnly && onStartDrag?.(e, { def: b })}>
                      <span className="fe-item__main"><strong>{b.name}</strong><span>{b.allowedRegions.map(regionLabel).join(" · ")}</span></span>
                      <Button size="sm" aria-label={`Add ${b.name}`} disabled={readOnly} onClick={() => onAdd(b)}><PlusIcon /></Button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="fe-library__body" role="tabpanel">
          {["hero", "main", "sidebar"].map((r) => {
            const inRegion = blocks.filter((b) => b.region === r);
            return (
              <section key={r} aria-label={`${regionLabel(r)} blocks`}>
                <h3 className="fe-library__group">{regionLabel(r)}</h3>
                {inRegion.length === 0 ? <p className="fe-library__empty">Nothing here.</p> : (
                  <ol className="fe-library__list fe-outline-list">
                    {inRegion.map((b, i) => (
                      <li key={b.key} className={`fe-item fe-item--row${selectedKey === b.key ? " is-selected" : ""}`}>
                        <button type="button" className="fe-item__title" onClick={() => onSelect(b.key)}>
                          <strong>{blockName(b.block_type)}</strong>
                          <span>{blockSummary(b)}</span>
                        </button>
                        <span className="fe-item__badges">
                          {b.template_id && b.linked ? <Pill tone="info">Library</Pill> : null}
                          {b.template_id && !b.linked ? <Pill>Edited</Pill> : null}
                          {b.lock_position ? <Pill tone="warn">Position locked</Pill> : null}
                          {b.lock_content ? <Pill tone="warn">Content locked</Pill> : null}
                          {b.common?.visibility === "hidden" ? <Pill>Hidden</Pill> : null}
                        </span>
                        <span className="fe-item__actions">
                          <Button size="sm" onClick={() => onEdit(b.key)}>{b.can_edit ? "Edit" : "View"}</Button>
                          <Button size="sm" aria-label={`Move ${blockName(b.block_type)} up`} disabled={readOnly || !b.can_move || i === 0} onClick={() => onNudge(b.key, -1)}>↑</Button>
                          <Button size="sm" aria-label={`Move ${blockName(b.block_type)} down`} disabled={readOnly || !b.can_move || i === inRegion.length - 1} onClick={() => onNudge(b.key, 1)}>↓</Button>
                          <select
                            className="select fe-item__move"
                            aria-label={`Move ${blockName(b.block_type)} to another region`}
                            disabled={readOnly || !b.can_move}
                            value=""
                            onChange={(e) => e.target.value && onMoveToRegion(b.key, e.target.value)}
                          >
                            <option value="">Move to…</option>
                            {availableRegionsFor(b).map((rr) => <option key={rr} value={rr}>{regionLabel(rr)}</option>)}
                          </select>
                          <Button size="sm" aria-label={`Remove ${blockName(b.block_type)}`} disabled={readOnly || !b.can_remove} onClick={() => onRemove(b.key)}>×</Button>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            );
          })}
        </div>
      )}
    </aside>
  );
}

function availableRegionsFor(b) {
  const def = availableBlocks("entry").concat(availableBlocks("content_page")).find((x) => x.id === b.block_type);
  return (def?.allowedRegions ?? []).filter((r) => r !== b.region);
}

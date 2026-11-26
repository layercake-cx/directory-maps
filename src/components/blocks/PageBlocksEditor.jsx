import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { markDirectoryContentChanged } from "../../lib/directoryPublications.js";
import {
  Button, Callout, Dialog, EmptyState, ErrorState, Field, FieldGrid, Pill, PlusIcon, Section, Skeleton, SortableList, TextInput,
  Checkbox, SegmentedControl, useConfirm, useToast,
} from "../ui/index.js";
import BlockEditDialog from "./BlockEditDialog.jsx";
import {
  REGIONS, addPageBlock, blockDef, blockName, blockSummary, convertPageToBlocks, getPageBlocks, groupedBlocks, listBlockTemplates,
  movePageBlock, promotePageBlockToTemplate, regionLabel, removePageBlock, resetPageBlockToTemplate, updatePageBlock,
} from "../../lib/pageBlocks.js";
import "../../styles/blocks-editor.css";

/**
 * The block editor for one page (an entry or a content page). Used by admins, client directory admins and page editors
 * (RLS and the RPCs decide what each may do) and, with `claimId`, by listing owners in the Listing Manager.
 *
 * Layout is a schematic of the page in three regions. Blocks are reordered with the shared drag-or-keyboard sortable
 * list; moving between regions is a menu action. Locks come from the server per block (`can_edit`, `can_move`,
 * `can_remove`) and the server refuses anything not allowed, so the UI only mirrors them.
 */
export default function PageBlocksEditor({ pageKind, pageId, directoryId, entryName = "this page", claimId = null, canEdit = true, recordEvent, onChanged, onLoaded }) {
  const confirm = useConfirm();
  const { toast } = useToast();
  const [state, setState] = useState(null); // { converted, is_admin, blocks }
  const [templates, setTemplates] = useState([]);
  const [ctx, setCtx] = useState({ terms: [], entries: [] });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(null); // region id
  const [dialog, setDialog] = useState(null); // { mode: "edit"|"add", block?, def, region? }
  const [promote, setPromote] = useState(null); // block
  const [actionError, setActionError] = useState("");

  const event = useCallback((type, meta) => recordEvent?.(type, { directory_id: directoryId, page_kind: pageKind, page_id: pageId, ...meta }), [recordEvent, directoryId, pageKind, pageId]);

  const load = useCallback(async () => {
    try {
      const s = await getPageBlocks(pageKind, pageId, claimId);
      setState(s);
      setErr("");
      onLoaded?.(s);
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }, [pageKind, pageId, claimId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setState(null); void load(); }, [load]);

  // Pickers' data is optional: a listing owner cannot read these tables, and the controls degrade without them.
  useEffect(() => {
    let live = true;
    (async () => {
      const [tpl, ents, terms] = await Promise.all([
        claimId ? [] : listBlockTemplates(directoryId).catch(() => []),
        claimId ? [] : supabase.from("directory_entries").select("id, name").eq("directory_id", directoryId).order("name").limit(1000).then((r) => r.data ?? [], () => []),
        pageKind === "entry" && !claimId
          ? supabase.from("entry_category_terms").select("term_id, category_terms(id, label)").eq("entry_id", pageId).then((r) => (r.data ?? []).map((x) => ({ id: x.term_id, label: x.category_terms?.label ?? x.term_id })), () => [])
          : [],
      ]);
      if (live) { setTemplates(tpl.filter((t) => t.page_kind === pageKind)); setCtx({ entries: ents, terms }); }
    })();
    return () => { live = false; };
  }, [directoryId, pageId, pageKind, claimId]);

  const changed = useCallback(async () => {
    await load();
    void markDirectoryContentChanged({ directoryId, entryId: pageKind === "entry" ? pageId : undefined });
    onChanged?.();
  }, [load, directoryId, pageId, pageKind, onChanged]);

  const act = useCallback(async (fn, okMessage) => {
    setBusy(true);
    setActionError("");
    try {
      await fn();
      if (okMessage) toast(okMessage);
      await changed();
    } catch (e) {
      setActionError(e?.message ?? String(e));
      throw e;
    } finally {
      setBusy(false);
    }
  }, [changed, toast]);

  const blocks = state?.blocks ?? [];
  const isAdmin = !!state?.is_admin;
  const usedTemplateIds = useMemo(() => new Set(blocks.map((b) => b.template_id).filter(Boolean)), [blocks]);

  async function convert() {
    const ok = await confirm({
      title: "Switch this page to blocks?",
      body: "The page looks the same afterwards. Its notes and standard sections become blocks you can edit, move and remove. This does not switch back automatically.",
      confirmLabel: "Switch to blocks",
    });
    if (!ok) return;
    await act(async () => {
      const n = await convertPageToBlocks(pageKind, pageId, claimId);
      event("directory_page_blocks_converted", { blocks_created: n, source: claimId ? "claim_manager" : "page_editor" });
    }, "This page now uses blocks.").catch(() => {});
  }

  async function removeBlock(b) {
    const ok = await confirm({ title: `Remove this ${blockName(b.block_type).toLowerCase()}?`, body: "It is removed from this page only. You can add it again from the library or block list.", confirmLabel: "Remove", tone: "danger" });
    if (!ok) return;
    await act(async () => {
      await removePageBlock(b.id, claimId);
      event("directory_page_block_removed", { block_id: b.id, block_type: b.block_type, template_id: b.template_id });
    }, "Block removed.").catch(() => {});
  }

  async function reorder(region, next, meta) {
    await act(async () => {
      await movePageBlock({ blockId: meta.item.id, region, index: meta.to, claimId });
      event("directory_page_block_moved", { block_id: meta.item.id, block_type: meta.item.block_type, region, to_index: meta.to });
    });
  }

  async function moveToRegion(b, region) {
    await act(async () => {
      await movePageBlock({ blockId: b.id, region, index: 1000000, claimId });
      event("directory_page_block_moved", { block_id: b.id, block_type: b.block_type, region, from_region: b.region });
    }, `${blockName(b.block_type)} moved to ${regionLabel(region)}.`).catch(() => {});
  }

  async function saveDialog({ data, common }) {
    const d = dialog;
    if (d.mode === "add") {
      const id = await addPageBlock({ pageKind, pageId, region: d.region, blockType: d.def.id, data, common, claimId });
      event("directory_page_block_added", { block_id: id, block_type: d.def.id, region: d.region, source: claimId ? "claim_manager" : "page_editor" });
      toast(`${d.def.name} added to ${regionLabel(d.region)}.`);
    } else {
      await updatePageBlock({ blockId: d.block.id, data, common, claimId });
      event("directory_page_block_updated", { block_id: d.block.id, block_type: d.block.block_type, detached_from_template: !!d.block.template_id && d.block.linked && data != null });
      toast("Block saved.");
    }
    setDialog(null);
    await changed();
  }

  async function addFromTemplate(t) {
    setPicker(null);
    await act(async () => {
      const id = await addPageBlock({ pageKind, pageId, templateId: t.id, claimId });
      event("directory_page_block_added", { block_id: id, block_type: t.block_type, region: t.region, template_id: t.id, source: claimId ? "claim_manager" : "page_editor" });
    }, `${t.name} added.`).catch(() => {});
  }

  function menuFor(b) {
    const def = blockDef(b.block_type);
    const items = [];
    for (const r of REGIONS) {
      if (r.id !== b.region && def?.allowedRegions.includes(r.id)) items.push({ label: `Move to ${r.label}`, disabled: !canEdit || !b.can_move, onSelect: () => moveToRegion(b, r.id) });
    }
    if (b.template_id && !b.linked && b.can_edit_content) {
      items.push({ label: "Use the template again", disabled: !canEdit, onSelect: () => act(async () => { await resetPageBlockToTemplate(b.id, claimId); event("directory_page_block_reset", { block_id: b.id, block_type: b.block_type, template_id: b.template_id }); }, "Block reset to the template.").catch(() => {}) });
    }
    if (isAdmin && !b.template_id && def && !def.dataBound) items.push({ label: "Save as library template…", onSelect: () => setPromote(b) });
    items.push({ label: "Remove", danger: true, disabled: !canEdit || !b.can_remove, onSelect: () => removeBlock(b) });
    return items;
  }

  if (err) return <ErrorState title="We couldn't load this page's blocks" body={`${err} Nothing has been lost.`} onRetry={load} />;
  if (!state) return <Skeleton variant="form" rows={4} label="Loading blocks" />;

  if (!state.converted) {
    return (
      <Section title="Page blocks">
        <EmptyState
          art="searching"
          title="This page is not using blocks yet"
          body="Switch it to blocks to arrange, edit and add sections. It looks the same afterwards."
          actions={canEdit ? <Button variant="primary" onClick={convert} loading={busy} loadingLabel="Switching…">Switch to blocks</Button> : null}
        />
      </Section>
    );
  }

  return (
    <div className="block-editor">
      {actionError ? <Callout tone="danger" title="That did not work">{actionError}</Callout> : null}
      <p className="block-editor__intro">
        {isAdmin ? "You can change anything here, including blocks others cannot." : "Blocks marked locked were set by the directory administrator."}
      </p>
      {REGIONS.map((r) => {
        const inRegion = blocks.filter((b) => b.region === r.id);
        const canAddHere = groupedBlocks(pageKind, r.id).length > 0;
        return (
          <Section
            key={r.id}
            title={r.label}
            description={r.hint}
            actions={canEdit && canAddHere ? <Button size="sm" onClick={() => setPicker(r.id)}><PlusIcon /> Add block</Button> : null}
          >
            {inRegion.length === 0 ? (
              <p className="field-hint">Nothing here yet.</p>
            ) : (
              <SortableList
                ariaLabel={`${r.label} blocks`}
                items={inRegion}
                getId={(b) => b.id}
                getLabel={(b) => blockName(b.block_type)}
                disabled={!canEdit || busy}
                onReorder={(next, meta) => reorder(r.id, next, meta)}
                getMeta={(b) => (
                  <>
                    <span className="block-row__summary">{blockSummary(b)}</span>
                    {b.template_id && b.linked ? <Pill tone="info">From library</Pill> : null}
                    {b.template_id && !b.linked ? <Pill>Edited here</Pill> : null}
                    {b.lock_position ? <Pill tone="warn">Position locked</Pill> : null}
                    {b.lock_content ? <Pill tone="warn">Content locked</Pill> : null}
                  </>
                )}
                renderActions={(b) => (
                  <Button size="sm" onClick={() => setDialog({ mode: "edit", block: b, def: blockDef(b.block_type) })}>
                    {b.can_edit ? "Edit" : "View"}
                  </Button>
                )}
                getMenuItems={menuFor}
              />
            )}
          </Section>
        );
      })}

      {picker ? (
        <Dialog title={`Add a block to ${regionLabel(picker)}`} onClose={() => setPicker(null)} footer={<Button onClick={() => setPicker(null)}>Cancel</Button>}>
          {templates.filter((t) => t.region === picker && !usedTemplateIds.has(t.id)).length > 0 ? (
            <Section title="From the library">
              <ul className="block-picker">
                {templates.filter((t) => t.region === picker && !usedTemplateIds.has(t.id)).map((t) => (
                  <li key={t.id}><Button onClick={() => addFromTemplate(t)}><strong>{t.name}</strong> <span className="field-hint">{blockName(t.block_type)}</span></Button></li>
                ))}
              </ul>
            </Section>
          ) : null}
          {groupedBlocks(pageKind, picker).map((g) => (
            <Section key={g.id} title={g.label}>
              <ul className="block-picker">
                {g.blocks.map((b) => (
                  <li key={b.id}>
                    <Button onClick={() => { setPicker(null); setDialog({ mode: "add", def: b, region: picker }); }}>
                      <strong>{b.name}</strong> <span className="field-hint">{b.purpose}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            </Section>
          ))}
        </Dialog>
      ) : null}

      {dialog ? (
        <BlockEditDialog
          mode={dialog.mode}
          def={dialog.def}
          block={dialog.block ?? null}
          region={dialog.region ?? null}
          isAdmin={isAdmin}
          ctx={ctx}
          entryName={entryName}
          onClose={() => setDialog(null)}
          onSave={saveDialog}
          onReset={dialog.block?.template_id ? async () => { await act(async () => { await resetPageBlockToTemplate(dialog.block.id, claimId); event("directory_page_block_reset", { block_id: dialog.block.id, block_type: dialog.block.block_type, template_id: dialog.block.template_id }); }, "Block reset to the template.").catch(() => {}); setDialog(null); } : null}
        />
      ) : null}

      {promote ? (
        <PromoteDialog
          block={promote}
          onClose={() => setPromote(null)}
          onSubmit={async (opts) => {
            await act(async () => {
              const id = await promotePageBlockToTemplate({ blockId: promote.id, ...opts });
              event("directory_block_template_saved", { template_id: id, block_type: promote.block_type, source: "page_editor", from_page: true });
            }, "Saved to the library.");
            setPromote(null);
          }}
        />
      ) : null}
    </div>
  );
}

function PromoteDialog({ block, onClose, onSubmit }) {
  const [name, setName] = useState(`${blockName(block.block_type)}`);
  const [placement, setPlacement] = useState("end");
  const [lockPosition, setLockPosition] = useState(false);
  const [lockContent, setLockContent] = useState(false);
  const [autoAdd, setAutoAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setSaving(true);
    try { await onSubmit({ name, placement, lockPosition, lockContent, autoAdd }); } catch (e) { setError(e?.message ?? String(e)); setSaving(false); }
  }
  return (
    <Dialog
      title="Save as library template"
      onClose={onClose}
      footer={<><Button onClick={onClose} disabled={saving}>Cancel</Button><Button variant="primary" onClick={submit} loading={saving} loadingLabel="Saving…" disabled={!name.trim()}>Save template</Button></>}
    >
      <p className="field-hint">This page's block becomes a template other pages can use. This page's block then follows the template.</p>
      {error ? <Callout tone="danger">{error}</Callout> : null}
      <FieldGrid><Field label="Template name" required><TextInput value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></Field></FieldGrid>
      <SegmentedControl label="Where it goes in the region" value={placement} options={[{ value: "start", label: "At the start" }, { value: "end", label: "At the end" }]} onChange={setPlacement} />
      <Checkbox label="Add to every new page" checked={autoAdd} onChange={(e) => setAutoAdd(e.target.checked)} />
      <Checkbox label="Lock position" hint="Editors cannot move or remove it." checked={lockPosition} onChange={(e) => setLockPosition(e.target.checked)} />
      <Checkbox label="Lock content" hint="Editors cannot change it." checked={lockContent} onChange={(e) => setLockContent(e.target.checked)} />
    </Dialog>
  );
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { getDirectoryEntry } from "../../lib/directories.js";
import {
  Button, Callout, ConfirmProvider, Dialog, EmptyState, ErrorState, Skeleton, ToastProvider, useConfirm, useToast,
} from "../ui/index.js";
import BlockEditDialog from "../blocks/BlockEditDialog.jsx";
import EntrySeoTab from "../directories/entryEdit/EntrySeoTab.jsx";
import FocusedEditorHeader from "./FocusedEditorHeader.jsx";
import BlockLibraryPanel from "./BlockLibraryPanel.jsx";
import PageCanvas from "./PageCanvas.jsx";
import { previewRows, useBlockWorkingCopy } from "./useBlockWorkingCopy.js";
import {
  blockDef, blockName, convertPageToBlocks, emptyData, listBlockTemplates,
} from "../../lib/pageBlocks.js";
import { getPagePublishState, isStaleSave, publishPage, renderPagePreview, validatePageBlocks } from "../../lib/pagePublish.js";
import "../../styles/admin-shell-tokens.css";
import "../../styles/discover-ui.css";
import "../../styles/blocks-editor.css";
import "../../styles/focused-editor.css";

/**
 * The focused editing route for one listing (entry) or site page: the page as published with editing controls on top,
 * a Content/SEO toggle, Editor/Preview modes, a working copy with Save draft, and a safeguarded single-page Publish.
 * Spec: discover-content-editor (SPEC.md). Rendered with no app navigation; the route supplies the providers.
 */
export default function FocusedBlockEditor(props) {
  // Outside the app shell: bring the Discover UI scope and its toast and confirm providers with us.
  return (
    <div className="shell fe">
      <ToastProvider>
        <ConfirmProvider>
          <Editor {...props} />
        </ConfirmProvider>
      </ToastProvider>
    </div>
  );
}

const labelOf = (b) => blockName(b.block_type);
function badgesOf(b) {
  return [
    b.template_id && b.linked ? "From library" : null,
    b.template_id && !b.linked ? "Edited here" : null,
    b.lock_position ? "Position locked" : null,
    b.lock_content ? "Content locked" : null,
    b.common?.visibility === "hidden" ? "Hidden" : null,
  ].filter(Boolean);
}

function Editor({ kind, id, directoryId, claimId = null, backHref, canEdit = true, recordEvent }) {
  const confirm = useConfirm();
  const { toast } = useToast();
  const isEntry = kind === "entry";

  const [record, setRecord] = useState(null);
  const [recordErr, setRecordErr] = useState("");
  const [templates, setTemplates] = useState([]);
  const [surface, setSurface] = useState("content");
  const [mode, setMode] = useState("edit");
  const [width, setWidth] = useState("desktop");
  const [html, setHtml] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [previewErr, setPreviewErr] = useState("");
  const [selectedKey, setSelectedKey] = useState(null);
  const [dialog, setDialog] = useState(null); // { key, isNew }
  const [publishState, setPublishState] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [status, setStatus] = useState("");
  const [guard, setGuard] = useState(null); // { href }
  const [seoDirty, setSeoDirty] = useState(false);

  const wc = useBlockWorkingCopy({ kind, id, claimId, templates });
  const readOnly = !canEdit;
  const say = useCallback((m) => setStatus(m), []);

  // ---- the page's own record (name, slug, SEO) ----
  const loadRecord = useCallback(async () => {
    try {
      if (isEntry) setRecord(await getDirectoryEntry(id));
      else {
        const { data, error } = await supabase.from("directory_content_pages").select("*").eq("id", id).single();
        if (error) throw error;
        setRecord(data);
      }
      setRecordErr("");
    } catch (e) {
      setRecordErr(e?.message ?? String(e));
    }
  }, [id, isEntry]);
  useEffect(() => { void loadRecord(); }, [loadRecord]);

  useEffect(() => {
    if (claimId) return;
    listBlockTemplates(directoryId).then((t) => setTemplates(t.filter((x) => x.page_kind === kind))).catch(() => {});
  }, [directoryId, kind, claimId]);

  const refreshPublishState = useCallback(async () => {
    try { setPublishState(await getPagePublishState(kind, id, claimId)); } catch { /* the header just shows no state */ }
  }, [kind, id, claimId]);
  useEffect(() => { void refreshPublishState(); }, [refreshPublishState]);

  // ---- the canvas: the real page, rendered by the server from the working copy (debounced) ----
  const rows = useMemo(() => previewRows(wc.draft), [wc.draft]);
  const reqRef = useRef(0);
  useEffect(() => {
    if (!wc.loaded || !wc.converted || surface !== "content") return undefined;
    const n = ++reqRef.current;
    setPreviewing(true);
    const t = setTimeout(async () => {
      try {
        const out = await renderPagePreview({ kind, id, blocks: rows, mode });
        if (n === reqRef.current) { setHtml(out); setPreviewErr(""); }
      } catch (e) {
        if (n === reqRef.current) setPreviewErr(e?.message ?? String(e));
      } finally {
        if (n === reqRef.current) setPreviewing(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [rows, mode, wc.loaded, wc.converted, kind, id, surface]);

  // ---- leaving with unsaved changes ----
  const unsaved = wc.dirty || seoDirty;
  useEffect(() => {
    if (!unsaved) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [unsaved]);

  const event = useCallback((type, meta) => recordEvent?.(type, { directory_id: directoryId, page_kind: kind, page_id: id, ...(claimId ? { claim_id: claimId } : {}), ...meta }), [recordEvent, directoryId, kind, id, claimId]);

  // ---- block actions ----
  const blocksByKey = useMemo(() => new Map(wc.draft.map((b) => [b.key, { ...b, label: labelOf(b), badges: badgesOf(b) }])), [wc.draft]);

  const firstRegion = (def) => (["main", "sidebar", "hero"].find((r) => def.allowedRegions.includes(r)) ?? def.allowedRegions[0]);
  const addBlock = (def, region = firstRegion(def), index = null) => {
    const key = wc.addBlock({ region, block_type: def.id, data: emptyData(def), index });
    setSelectedKey(key);
    setDialog({ key, isNew: true });
    say(`${def.name} added to ${region}.`);
  };
  const addTemplate = (t, index = null) => {
    const key = wc.addFromTemplate(t, index);
    setSelectedKey(key);
    say(`${t.name} added.`);
    if (t.lock_content === false || wc.isAdmin) setDialog({ key, isNew: true });
  };
  const nudge = (key, d) => { if (wc.nudge(key, d)) say(`${blockName(wc.byKey(key)?.block_type)} moved ${d < 0 ? "up" : "down"}.`); };
  const moveToRegion = (key, region) => { if (wc.moveBlock(key, region, null)) say(`Moved to ${region}.`); };
  const remove = async (key) => {
    const b = wc.byKey(key);
    if (!b) return;
    const ok = await confirm({ title: `Remove this ${blockName(b.block_type).toLowerCase()}?`, body: "It is removed from the page when you save the draft. Until then you can discard your changes to bring it back.", confirmLabel: "Remove", tone: "danger" });
    if (!ok) return;
    if (wc.removeBlock(key)) { setSelectedKey(null); say(`${blockName(b.block_type)} removed.`); }
  };

  // ---- save, back, publish ----
  const saveDraft = async () => {
    try {
      await wc.save();
      await refreshPublishState();
      setStatus("Draft saved.");
      toast("Draft saved.");
      event("directory_page_draft_saved", { block_count: wc.draft.length });
      return true;
    } catch (e) {
      if (isStaleSave(e)) {
        const reload = await confirm({ title: "This page changed while you were editing", body: "Someone else saved a newer version. Reload to see it. Your unsaved changes in this editor will be lost, so copy anything you need first.", confirmLabel: "Reload the page" });
        if (reload) { await wc.load(); await loadRecord(); }
      } else {
        toast(e?.message ?? String(e));
        setStatus(e?.message ?? String(e));
      }
      return false;
    }
  };

  const onBack = (e) => {
    if (!unsaved) return;
    e.preventDefault();
    setGuard({ href: backHref });
  };

  const handlePublish = async () => {
    if (wc.dirty) {
      const ok = await confirm({ title: "Save your draft first?", body: "Publishing uses the saved draft. Save it now and continue to the publish check.", confirmLabel: "Save draft and continue" });
      if (!ok || !(await saveDraft())) return;
    }
    let problems = [];
    try { problems = await validatePageBlocks(kind, id, claimId); } catch (e) { toast(e?.message ?? String(e)); return; }
    if (problems.length > 0) {
      await confirm({
        title: "Fix these blocks before publishing",
        body: problems.map((p) => `${blockName(p.block_type)}: ${(p.errors ?? []).map((x) => x.message).join("; ")}`).join("\n"),
        confirmLabel: "Back to editing",
      });
      return;
    }
    const ps = publishState ?? (await getPagePublishState(kind, id, claimId));
    if (!ps.directory_published) {
      await confirm({ title: "Publish the directory first", body: "A single page can only be published into a site that already exists. Publish the whole directory once from Settings › Publishing, then come back.", confirmLabel: "OK" });
      return;
    }
    const name = record?.name ?? record?.title ?? "this page";
    const go = await confirm({
      title: `Publish “${name}”?`,
      body: "Only this page goes live. Other pages, the navigation, the listings page and the sitemap are not changed. Whatever you saved in this draft, including its SEO settings, becomes visible to visitors now.",
      confirmLabel: "Publish this page",
    });
    if (!go) return;
    setPublishing(true);
    try {
      const fresh = await wc.load();
      await publishPage({ kind, id, expectedUpdatedAt: fresh?.page_updated_at ?? wc.pageUpdatedAt });
      event("directory_page_published", { block_count: wc.draft.length });
      toast("Published.");
      setStatus("Published.");
      await refreshPublishState();
    } catch (e) {
      await confirm({ title: "This page was not published", body: e?.message ?? String(e), confirmLabel: "OK" });
    } finally {
      setPublishing(false);
    }
  };

  // ---- dialog ----
  const dialogBlock = dialog ? wc.byKey(dialog.key) : null;
  // Cancelling the dialog for a block that was just added takes it back out; saving it keeps it.
  const closeDialog = () => {
    if (dialog?.isNew && dialogBlock) wc.removeBlock(dialog.key);
    setDialog(null);
  };

  // ---- render ----
  const title = record?.name ?? record?.title ?? "";
  const publishBlocked = !publishState?.directory_published;
  const state = publishing ? "Publishing…" : wc.saving ? "Saving…" : unsaved ? "Unsaved changes" : publishState?.has_unpublished_changes ? "Saved · not yet published" : "All changes saved";
  const usedTemplateIds = useMemo(() => new Set(wc.draft.map((b) => b.template_id).filter(Boolean)), [wc.draft]);

  let content;
  if (recordErr || wc.error) {
    content = <ErrorState title="We couldn't open this page" body={`${recordErr || wc.error} Nothing has been lost.`} onRetry={() => { void loadRecord(); void wc.load(); }} />;
  } else if (!record || !wc.loaded) {
    content = <div className="fe-center"><Skeleton variant="form" rows={4} label="Opening the editor" /></div>;
  } else if (!wc.converted) {
    content = (
      <div className="fe-center">
        <EmptyState
          art="searching"
          title="This page is not using blocks yet"
          body="Switch it to blocks to edit it on the page. It looks the same afterwards."
          actions={canEdit ? <Button variant="primary" onClick={async () => { await convertPageToBlocks(kind, id, claimId); event("directory_page_blocks_converted", { source: "focused_editor" }); await wc.load(); }}>Switch to blocks</Button> : null}
        />
      </div>
    );
  } else if (surface === "seo") {
    content = (
      <div className="fe-surface" role="tabpanel" id="fe-panel-seo" aria-labelledby="fe-tab-seo">
        {isEntry ? (
          <EntrySeoTab directoryId={directoryId} entryId={id} entry={record} canEdit={canEdit} recordEvent={recordEvent} onSaved={() => { void loadRecord(); void wc.load(); void refreshPublishState(); setSeoDirty(false); }} />
        ) : (
          <Callout tone="info">SEO for site pages is edited in Pages › the page's own settings for now.</Callout>
        )}
      </div>
    );
  } else {
    content = (
      <div className="fe-body">
        {mode === "edit" ? (
          <BlockLibraryPanel
            kind={kind}
            templates={templates}
            usedTemplateIds={usedTemplateIds}
            blocks={wc.draft}
            selectedKey={selectedKey}
            readOnly={readOnly}
            onAdd={(def) => addBlock(def)}
            onAddTemplate={(t) => addTemplate(t)}
            onSelect={setSelectedKey}
            onEdit={(key) => { setSelectedKey(key); setDialog({ key, isNew: false }); }}
            onNudge={nudge}
            onRemove={remove}
            onMoveToRegion={moveToRegion}
          />
        ) : null}
        <div className="fe-main" role="tabpanel" id="fe-panel-content" aria-labelledby="fe-tab-content">
          {mode === "preview" ? (
            <div className="fe-previewbar">
              <span><strong>Preview.</strong> This is the page as visitors will see it. Switch to Editor to make changes.</span>
              <div className="fe-toggle" role="group" aria-label="Preview width">
                {[["desktop", "Desktop"], ["mobile", "Mobile"]].map(([w, label]) => (
                  <button key={w} type="button" aria-pressed={width === w} className={width === w ? "is-on" : ""} onClick={() => setWidth(w)}>{label}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className="fe-status" role="status">{status || `${wc.draft.length} blocks${readOnly ? " · view only" : wc.isAdmin ? " · you can change anything, including locked blocks" : " · locked blocks are fixed"}. Hover a block for its controls, click it to edit.`}</div>
          )}
          <PageCanvas
            html={html}
            mode={mode}
            width={mode === "preview" ? width : "desktop"}
            loading={previewing}
            error={previewErr}
            blocksByKey={blocksByKey}
            selectedKey={selectedKey}
            readOnly={readOnly}
            onSelect={setSelectedKey}
            onEdit={(key) => setDialog({ key, isNew: false })}
            onNudge={nudge}
            onRemove={remove}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <FocusedEditorHeader
        backHref={backHref}
        backLabel={`Back to ${title || "page"} ${isEntry ? "listing" : "page"}`}
        onBack={onBack}
        collection={isEntry ? "Listings" : "Site pages"}
        title={title || "…"}
        typeBadge={isEntry ? "Listing" : "Site page"}
        state={state}
        surface={surface}
        onSurface={setSurface}
        contentLabel={isEntry ? "Listing content" : "Page content"}
        mode={mode}
        onMode={(m) => { setMode(m); setSelectedKey(null); }}
        onSave={saveDraft}
        onPublish={handlePublish}
        saving={wc.saving}
        publishing={publishing}
        canSave={canEdit && wc.dirty}
        canPublish={canEdit && wc.loaded && wc.converted && !publishBlocked}
        publishTitle={publishBlocked ? "Publish the whole directory once before publishing single pages" : undefined}
      />
      {content}

      {dialog && dialogBlock ? (
        <BlockEditDialog
          mode={dialog.isNew ? "add" : "edit"}
          def={blockDef(dialogBlock.block_type)}
          block={{ ...dialogBlock, template_name: dialogBlock.template_name }}
          region={dialogBlock.region}
          isAdmin={wc.isAdmin}
          entryName={title}
          onClose={closeDialog}
          onSave={async ({ data, common }) => {
            wc.updateBlock(dialog.key, { data, common });
            setDialog(null);
            say(`${blockName(dialogBlock.block_type)} updated.`);
          }}
          onReset={dialogBlock.template_id ? () => { wc.resetToTemplate(dialog.key); setDialog(null); say("Block reset to its library template."); } : null}
        />
      ) : null}

      {guard ? (
        <Dialog
          title="You have unsaved changes"
          onClose={() => setGuard(null)}
          footer={
            <div className="fe-guard-actions">
              <Button onClick={() => setGuard(null)}>Stay</Button>
              <Button variant="danger" onClick={() => { window.location.assign(guard.href); }}>Discard and go back</Button>
              <Button variant="primary" onClick={async () => { if (await saveDraft()) window.location.assign(guard.href); else setGuard(null); }}>Save draft and go back</Button>
            </div>
          }
        >
          <p>Going back now loses what you have not saved in this draft.</p>
        </Dialog>
      ) : null}
    </>
  );
}

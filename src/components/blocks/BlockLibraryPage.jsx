import React, { useCallback, useEffect, useState } from "react";
import { useDirectory } from "../../hooks/useDirectory.js";
import {
  Button, Callout, DataTable, Dialog, EmptyState, ErrorState, Field, PageLayout, Pill, PlusIcon, Section, SegmentedControl, Select,
  Skeleton, useConfirm, useToast,
} from "../ui/index.js";
import BlockEditDialog from "./BlockEditDialog.jsx";
import {
  availableBlocks, blockDef, blockName, blockTemplateUsage, deleteBlockTemplate, groupedBlocks, listBlockTemplates, regionLabel,
  saveBlockTemplate, stampBlockTemplate, REGIONS,
} from "../../lib/pageBlocks.js";
import "../../styles/blocks-editor.css";

const KIND_LABEL = { entry: "Entry pages", content_page: "Content pages" };

/**
 * Directory › Experience › Page blocks. The library of block templates: reusable content a directory's pages can start
 * from. Pages hold their own copy that stays linked to the template until an editor changes it. Directory admins only.
 */
export default function BlockLibraryPage() {
  const { directoryId, recordEvent } = useDirectory();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [templates, setTemplates] = useState(null);
  const [usage, setUsage] = useState({});
  const [err, setErr] = useState("");
  const [actionError, setActionError] = useState("");
  const [creating, setCreating] = useState(false);
  const [dialog, setDialog] = useState(null); // { def, template?, region?, pageKind }
  const [busyId, setBusyId] = useState(null);

  const event = useCallback((type, meta) => recordEvent?.(type, { directory_id: directoryId, source: "directory_block_library", ...meta }), [recordEvent, directoryId]);

  const load = useCallback(async () => {
    try {
      const [t, u] = await Promise.all([listBlockTemplates(directoryId), blockTemplateUsage(directoryId)]);
      setTemplates(t);
      setUsage(u);
      setErr("");
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }, [directoryId]);

  useEffect(() => { void load(); }, [load]);

  async function save({ data, common, library }) {
    const { def, template, pageKind } = dialog;
    const id = await saveBlockTemplate({
      id: template?.id, directoryId, pageKind, name: library.name.trim(), blockType: def.id, region: library.region,
      data, common, lockPosition: library.lockPosition, lockContent: library.lockContent, placement: library.placement, autoAdd: library.autoAdd,
    }).catch(async (e) => {
      // Locking content would discard pages' own versions: ask, then retry with an explicit reset.
      if (/Locking its content would discard/.test(e?.message ?? "")) {
        const ok = await confirm({ title: "Reset pages that changed this block?", body: `${e.message} They will show the template again.`, confirmLabel: "Reset them", tone: "danger" });
        if (!ok) throw new Error("Not saved. Pages that edited this block were left as they are.");
        return saveBlockTemplate({
          id: template?.id, directoryId, pageKind, name: library.name.trim(), blockType: def.id, region: library.region,
          data, common, lockPosition: library.lockPosition, lockContent: library.lockContent, placement: library.placement, autoAdd: library.autoAdd, relinkDetached: true,
        });
      }
      throw e;
    });
    event("directory_block_template_saved", {
      template_id: id, block_type: def.id, page_kind: pageKind, new: !template,
      lock_position: library.lockPosition, lock_content: library.lockContent, auto_add: library.autoAdd,
    });
    toast(template ? "Template saved." : "Template created.");
    setDialog(null);
    await load();
  }

  async function addToPages(t) {
    const ok = await confirm({
      title: `Add “${t.name}” to every ${t.page_kind === "entry" ? "entry" : "content"} page?`,
      body: "Each page is switched to blocks first so it keeps its content. Pages that removed this block get it back.",
      confirmLabel: "Add to pages",
    });
    if (!ok) return;
    setBusyId(t.id);
    setActionError("");
    try {
      const total = await stampBlockTemplate(t.id);
      event("directory_block_template_stamped", { template_id: t.id, block_type: t.block_type, pages_stamped: total });
      toast(total === 0 ? "Every page already has it." : `Added to ${total} page${total === 1 ? "" : "s"}.`);
      await load();
    } catch (e) {
      setActionError(e?.message ?? String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(t) {
    const u = usage[t.id] ?? { linked: 0, edited: 0 };
    const ok = await confirm({
      title: `Delete “${t.name}”?`,
      body: `${u.linked + u.edited} page${u.linked + u.edited === 1 ? "" : "s"} use it. They keep what they show today and stop following the template. This cannot be undone.`,
      confirmLabel: "Delete template",
      tone: "danger",
    });
    if (!ok) return;
    setBusyId(t.id);
    setActionError("");
    try {
      await deleteBlockTemplate(t.id);
      event("directory_block_template_deleted", { template_id: t.id, block_type: t.block_type, pages_detached: u.linked + u.edited });
      toast("Template deleted.");
      await load();
    } catch (e) {
      setActionError(e?.message ?? String(e));
    } finally {
      setBusyId(null);
    }
  }

  const columns = [
    { key: "name", label: "Template", render: (t) => <strong>{t.name}</strong> },
    { key: "block_type", label: "Block", render: (t) => blockName(t.block_type) },
    { key: "page_kind", label: "For", render: (t) => `${KIND_LABEL[t.page_kind]} · ${regionLabel(t.region)}` },
    {
      key: "settings", label: "Settings",
      render: (t) => (
        <>
          {t.auto_add ? <Pill tone="info">Every page</Pill> : null}{" "}
          {t.lock_position ? <Pill tone="warn">Position locked</Pill> : null}{" "}
          {t.lock_content ? <Pill tone="warn">Content locked</Pill> : null}
          {!t.auto_add && !t.lock_position && !t.lock_content ? <span className="block-library__usage">None</span> : null}
        </>
      ),
    },
    {
      key: "usage", label: "Used on",
      render: (t) => {
        const u = usage[t.id] ?? { linked: 0, edited: 0 };
        return <span className="block-library__usage">{u.linked + u.edited === 0 ? "No pages" : `${u.linked} as is, ${u.edited} edited`}</span>;
      },
    },
  ];

  return (
    <PageLayout
      head={{
        title: "Page blocks",
        subtitle: "Reusable blocks for this directory's pages.",
        actions: <Button variant="primary" onClick={() => setCreating(true)}><PlusIcon /> New template</Button>,
      }}
    >
      <Callout tone="info">
        A template is content you set once, such as a safeguarding notice. Editors add it to a page, where it follows the template until they change it.
        You can lock a template's position, or its content, so standard wording stays as you wrote it. Locks never apply to Owners and Managers.
      </Callout>
      {actionError ? <Callout tone="danger" title="That did not work">{actionError}</Callout> : null}
      <Section title="Library">
        {err ? <ErrorState title="We couldn't load the library" body={`${err} Nothing has been lost.`} onRetry={load} /> : !templates ? (
          <Skeleton variant="form" rows={3} label="Loading templates" />
        ) : templates.length === 0 ? (
          <EmptyState
            art="searching"
            title="No templates yet"
            body="Create one here, or open a page in the block editor and choose “Save as library template” on a block."
            actions={<Button variant="primary" onClick={() => setCreating(true)}>New template</Button>}
          />
        ) : (
          <DataTable
            caption="Block templates"
            columns={columns}
            rows={templates}
            getRowLabel={(t) => t.name}
            rowMenu={(t) => [
              { label: "Edit", onSelect: () => setDialog({ def: blockDef(t.block_type), template: t, pageKind: t.page_kind }) },
              { label: "Add to existing pages", disabled: busyId === t.id, onSelect: () => addToPages(t) },
              { label: "Delete", danger: true, disabled: busyId === t.id, onSelect: () => remove(t) },
            ]}
          />
        )}
      </Section>

      {creating ? <NewTemplateDialog onClose={() => setCreating(false)} onPick={(pageKind, def, region) => { setCreating(false); setDialog({ def, pageKind, region }); }} /> : null}
      {dialog ? (
        <BlockEditDialog
          mode="template"
          def={dialog.def}
          template={dialog.template ?? null}
          region={dialog.region ?? null}
          isAdmin
          entryName={KIND_LABEL[dialog.pageKind]}
          onClose={() => setDialog(null)}
          onSave={save}
        />
      ) : null}
    </PageLayout>
  );
}

function NewTemplateDialog({ onClose, onPick }) {
  const [pageKind, setPageKind] = useState("entry");
  const [region, setRegion] = useState("main");
  const groups = groupedBlocks(pageKind, region).map((g) => ({ ...g, blocks: g.blocks.filter((b) => !b.dataBound || availableBlocks(pageKind, region).includes(b)) }));
  return (
    <Dialog title="New template" onClose={onClose} footer={<Button onClick={onClose}>Cancel</Button>}>
      <SegmentedControl label="For" value={pageKind} options={[{ value: "entry", label: "Entry pages" }, { value: "content_page", label: "Content pages" }]} onChange={setPageKind} />
      <Field label="Region"><Select value={region} options={REGIONS.map((r) => ({ value: r.id, label: r.label }))} onChange={(e) => setRegion(e.target.value)} /></Field>
      {groups.length === 0 ? <p className="field-hint">No blocks fit that region on that kind of page.</p> : groups.map((g) => (
        <Section key={g.id} title={g.label}>
          <ul className="block-picker">
            {g.blocks.map((b) => (
              <li key={b.id}><Button onClick={() => onPick(pageKind, b, region)}><strong>{b.name}</strong> <span className="field-hint">{b.purpose}</span></Button></li>
            ))}
          </ul>
        </Section>
      ))}
    </Dialog>
  );
}

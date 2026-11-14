import AIButton from "../ai/AIButton.jsx";
import AiProvenanceNote from "../ai/AiProvenanceNote.jsx";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button, Callout, Checkbox, Dialog, EmptyState, Field, FieldGrid, RadioCards, Section, Select, Skeleton, Textarea,
  TextInput, useConfirm,
} from "../ui/index.js";
import "../../styles/wave-a/batch-3.css";
import { useAiFeature } from "../../hooks/useAiFeature.js";
import AiUnavailableNotice from "../../components/ai/AiUnavailableNotice.jsx";
import {
  listContentPages,
  createContentPage,
  updateContentPage,
  deleteContentPage,
  generateContentPageDraft,
  generateContentPageSeo,
  reorderContentPages,
  applyPageDrop,
  slugify,
} from "../../lib/contentPages.js";
import RichTextEditor from "./entryEdit/RichTextEditor.jsx";

function buildForm(page) {
  return {
    title: page?.title || "",
    slug: page?.slug || "",
    parent_page_id: page?.parent_page_id || "",
    nav_label: page?.nav_label || "",
    show_in_navigation: page?.show_in_navigation !== false,
    is_active: page?.is_active !== false,
    body_html: page?.body_html || "",
    meta_title: page?.meta_title || "",
    meta_description: page?.meta_description || "",
    noindex: !!page?.noindex,
  };
}

function descendantIds(pages, pageId) {
  const ids = new Set();
  let frontier = [pageId];
  while (frontier.length) {
    const next = pages.filter((p) => frontier.includes(p.parent_page_id)).map((p) => p.id);
    next.forEach((id) => ids.add(id));
    frontier = next;
  }
  return ids;
}

function flattenTree(pages, parentId = null, depth = 0) {
  const siblings = pages
    .filter((p) => (p.parent_page_id || null) === parentId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.title.localeCompare(b.title));
  return siblings.flatMap((p) => [{ page: p, depth }, ...flattenTree(pages, p.id, depth + 1)]);
}

function pageHasChildren(pages, pageId) {
  return pages.some((p) => p.parent_page_id === pageId);
}

function dropPlacementFromEvent(e, draggedHasChildren, targetIsChild) {
  const rect = e.currentTarget.getBoundingClientRect();
  const y = e.clientY - rect.top;
  const ratio = rect.height ? y / rect.height : 0.5;
  if (ratio < 0.28) return "before";
  if (ratio > 0.72) return "after";
  if (!targetIsChild && !draggedHasChildren) return "child";
  return ratio < 0.5 ? "before" : "after";
}

/**
 * Pages tab — two-level hierarchy with drag-and-drop ordering. Parent
 * relationships and display order are the source of truth for the published
 * directory's header, mobile menu, breadcrumbs, nested URLs, and footer.
 */
export default function DirectoryContentPagesPanel({ directoryId, canManage, recordEvent }) {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(() => buildForm(null));
  const ai = useAiFeature("content_page_draft");
  const aiSeo = useAiFeature("seo_metadata");
  const [outline, setOutline] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [dragId, setDragId] = useState(null);
  const [dropHint, setDropHint] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteMode, setDeleteMode] = useState("promote");
  const [reparentTo, setReparentTo] = useState("");
  const [deleting, setDeleting] = useState(false);
  const confirm = useConfirm();
  const closeDelete = useCallback(() => setDeleteTarget(null), []);

  const refresh = useCallback(async () => {
    if (!directoryId) return;
    try {
      setLoading(true);
      setPages(await listContentPages(directoryId));
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [directoryId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const tree = useMemo(() => flattenTree(pages), [pages]);
  const selectedPage = pages.find((p) => p.id === selectedId) || null;
  const selectedChildren = pages.filter((p) => p.parent_page_id === selectedId);

  useEffect(() => {
    setForm(buildForm(selectedPage));
    setOutline("");
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  function fSet(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleCreate() {
    const cleanTitle = newTitle.trim();
    if (!cleanTitle) return;
    setErr("");
    try {
      setCreating(true);
      const id = await createContentPage({ directory_id: directoryId, title: cleanTitle, slug: slugify(cleanTitle) });
      recordEvent?.("directory_content_page_created", { directory_id: directoryId, page_id: id, title: cleanTitle });
      setNewTitle("");
      await refresh();
      setSelectedId(id);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleSave() {
    if (!selectedPage) return;
    setErr("");
    setMsg("");
    try {
      setSaving(true);
      const nextParent = form.parent_page_id || null;
      const parentChanged = (selectedPage.parent_page_id || null) !== nextParent;
      let position = selectedPage.position ?? 0;
      if (parentChanged) {
        const siblings = pages.filter((p) => (p.parent_page_id || null) === nextParent && p.id !== selectedPage.id);
        position = siblings.length ? Math.max(...siblings.map((p) => p.position ?? 0)) + 1 : 0;
      }
      await updateContentPage(selectedPage.id, {
        title: form.title,
        slug: form.slug,
        parent_page_id: nextParent,
        position,
        nav_label: form.nav_label || null,
        show_in_navigation: form.show_in_navigation,
        is_active: form.is_active,
        body_html: form.body_html,
        meta_title: form.meta_title || null,
        meta_description: form.meta_description || null,
        noindex: form.noindex,
      });
      recordEvent?.("directory_content_page_updated", { directory_id: directoryId, page_id: selectedPage.id });
      setMsg("Saved. Republish the directory for changes to appear on the live site.");
      await refresh();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  function openDelete(page) {
    setDeleteTarget(page);
    setDeleteMode("promote");
    const others = pages.filter((p) => !p.parent_page_id && p.id !== page.id);
    setReparentTo(others[0]?.id || "");
    setErr("");
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const children = pages.filter((p) => p.parent_page_id === deleteTarget.id);
    setErr("");
    try {
      setDeleting(true);
      if (children.length) {
        await deleteContentPage(deleteTarget.id, { childrenAction: deleteMode === "delete" ? "delete" : deleteMode, reparentToId: reparentTo });
        if (deleteMode === "delete") {
          for (const child of children) {
            recordEvent?.("directory_content_page_deleted", { directory_id: directoryId, page_id: child.id, title: child.title });
          }
        }
      } else {
        await deleteContentPage(deleteTarget.id);
      }
      recordEvent?.("directory_content_page_deleted", { directory_id: directoryId, page_id: deleteTarget.id, title: deleteTarget.title });
      if (selectedId === deleteTarget.id) setSelectedId(null);
      setDeleteTarget(null);
      await refresh();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setDeleting(false);
    }
  }

  async function persistOrder(nextPages, previousPages) {
    const rows = nextPages.map((p) => ({ id: p.id, parent_page_id: p.parent_page_id || null, position: p.position ?? 0 }));
    await reorderContentPages(directoryId, rows, previousPages);
    recordEvent?.("directory_content_pages_reordered", { directory_id: directoryId, page_ids: flattenTree(nextPages).map(({ page }) => page.id) });
  }

  function handleDragStart(e, pageId) {
    setDragId(pageId);
    e.dataTransfer.setData("text/plain", pageId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e, target) {
    e.preventDefault();
    if (!dragId || dragId === target.id) {
      setDropHint(null);
      return;
    }
    const draggedHasChildren = pageHasChildren(pages, dragId);
    const targetIsChild = !!target.parent_page_id;
    const placement = dropPlacementFromEvent(e, draggedHasChildren, targetIsChild);
    e.dataTransfer.dropEffect = "move";
    setDropHint({ id: target.id, placement });
  }

  async function handleDrop(e, target) {
    e.preventDefault();
    const fromId = e.dataTransfer.getData("text/plain") || dragId;
    const hint = dropHint;
    setDragId(null);
    setDropHint(null);
    if (!fromId || fromId === target.id) return;
    const placement = hint?.id === target.id ? hint.placement : "after";
    const next = applyPageDrop(pages, fromId, target.id, placement);
    if (next === pages) return;
    const prev = pages;
    setPages(next);
    try {
      await persistOrder(next, prev);
      setMsg("Page order saved. Republish the directory for changes to appear on the live site.");
    } catch (e2) {
      setPages(prev);
      setErr(e2?.message ?? String(e2));
    }
  }

  async function handleGenerate() {
    if (!selectedPage || !outline.trim()) return;
    if (form.body_html?.trim()) {
      const ok = await confirm({
        title: "Replace the page content?",
        body: "This page already has content. Generating with AI will overwrite it here in the editor. Nothing is saved until you click Save.",
        confirmLabel: "Replace content",
      });
      if (!ok) return false;
    }
    setErr("");
    try {
      recordEvent?.("directory_content_page_ai_draft_requested", { directory_id: directoryId, page_id: selectedPage.id });
      const html = await generateContentPageDraft(selectedPage.id, outline.trim());
      fSet("body_html", html);
      recordEvent?.("directory_content_page_ai_draft_generated", { directory_id: directoryId, page_id: selectedPage.id });
    } catch (e) {
      recordEvent?.("directory_content_page_ai_draft_failed", { directory_id: directoryId, page_id: selectedPage.id, error: e?.message ?? String(e) });
      setErr(e?.message ?? String(e));
      return false;
    }
  }

  async function handleGenerateSeo() {
    if (!selectedPage || !form.body_html?.trim()) return;
    if (form.meta_title?.trim() || form.meta_description?.trim()) {
      const ok = await confirm({
        title: "Replace the meta title and description?",
        body: "This replaces them here in the form. Nothing is saved until you click Save.",
        confirmLabel: "Replace meta fields",
      });
      if (!ok) return false;
    }
    setErr("");
    try {
      recordEvent?.("directory_content_page_ai_seo_requested", { directory_id: directoryId, page_id: selectedPage.id });
      const seo = await generateContentPageSeo(selectedPage.id, form.body_html);
      setForm((f) => ({ ...f, meta_title: seo.meta_title || f.meta_title, meta_description: seo.meta_description || f.meta_description }));
      recordEvent?.("directory_content_page_ai_seo_generated", { directory_id: directoryId, page_id: selectedPage.id });
    } catch (e) {
      recordEvent?.("directory_content_page_ai_seo_failed", { directory_id: directoryId, page_id: selectedPage.id, error: e?.message ?? String(e) });
      setErr(e?.message ?? String(e));
      return false;
    }
  }

  if (!canManage) {
    return <Callout tone="info">Only an Owner or Manager can manage content pages.</Callout>;
  }

  const eligibleParents = selectedPage
    ? pages.filter((p) => !p.parent_page_id && p.id !== selectedPage.id && !pageHasChildren(pages, selectedPage.id))
    : pages.filter((p) => !p.parent_page_id);
  const parentLocked = selectedPage && pageHasChildren(pages, selectedPage.id);
  const deleteChildren = deleteTarget ? pages.filter((p) => p.parent_page_id === deleteTarget.id) : [];
  const reparentOptions = deleteTarget ? pages.filter((p) => !p.parent_page_id && p.id !== deleteTarget.id) : [];

  return (
    <div className="b3-pages">
      <Section title="Pages" description="Drag to reorder. Drop onto a top-level page to nest (one level only).">
        {loading ? (
          <Skeleton variant="list" rows={4} label="Loading pages" />
        ) : tree.length === 0 ? (
          <EmptyState art="none" title="No pages yet" body="Add a page title below to create the first one." />
        ) : (
          <div className="b3-page-tree" onDragLeave={() => setDropHint(null)}>
            {tree.map(({ page, depth }) => {
              const hintHere = dropHint?.id === page.id;
              const rowClass = [
                "b3-page-row",
                page.id === selectedId && "is-selected",
                dragId === page.id && "is-dragging",
                !page.is_active && "is-inactive",
                hintHere && dropHint.placement === "before" && "is-drop-before",
                hintHere && dropHint.placement === "after" && "is-drop-after",
                hintHere && dropHint.placement === "child" && "is-drop-child",
              ].filter(Boolean).join(" ");
              return (
                <div
                  key={page.id}
                  draggable
                  className={rowClass}
                  style={{ "--b3-depth": depth }} // dynamic: indent level of this page in the tree
                  onDragStart={(e) => handleDragStart(e, page.id)}
                  onDragOver={(e) => handleDragOver(e, page)}
                  onDrop={(e) => handleDrop(e, page)}
                  onDragEnd={() => {
                    setDragId(null);
                    setDropHint(null);
                  }}
                >
                  <span aria-hidden="true" className="b3-page-handle" title="Drag to reorder">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 8h14M5 12h14M5 16h14" /></svg>
                  </span>
                  <button type="button" className="b3-page-btn" onClick={() => setSelectedId(page.id)} aria-current={page.id === selectedId ? "true" : undefined}>
                    {depth > 0 ? <span className="sr-only">Child page: </span> : null}
                    {page.nav_label || page.title}
                    {!page.show_in_navigation ? <span className="b3-page-state"> · hidden</span> : null}
                    {!page.is_active ? <span className="b3-page-state"> · unpublished</span> : null}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <div className="b3-stack b3-stack--tight">
          <Field label="New page title">
            <TextInput
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
          </Field>
          <div>
            <Button onClick={handleCreate} loading={creating} loadingLabel="Adding…" disabled={!newTitle.trim()}>
              Add page
            </Button>
          </div>
        </div>
      </Section>

      <div className="b3-stack">
        {err ? <Callout tone="danger">{err}</Callout> : null}
        {msg ? <Callout tone="ok">{msg}</Callout> : null}

        {!selectedPage ? (
          <Section title="Edit page">
            <EmptyState art="none" title="No page selected" body="Select a page on the left, or add a new one, to edit it." />
          </Section>
        ) : (
          <Section
            title="Edit page"
            actions={<Button variant="danger" size="sm" onClick={() => openDelete(selectedPage)}>Delete page</Button>}
            footer={<Button variant="primary" onClick={handleSave} loading={saving} loadingLabel="Saving…">Save</Button>}
          >
            <FieldGrid>
              <Field label="Title">
                <TextInput value={form.title} onChange={(e) => fSet("title", e.target.value)} />
              </Field>
              <Field label="URL slug">
                <TextInput value={form.slug} onChange={(e) => fSet("slug", e.target.value)} />
              </Field>
            </FieldGrid>

            <Field
              label="Parent page"
              hint={parentLocked
                ? "This page has child pages, so it has to stay top-level. Move or delete the children first to nest it."
                : "Changing the parent changes the published URL (old URLs redirect after the next publish)."}
            >
              <Select value={form.parent_page_id} onChange={(e) => fSet("parent_page_id", e.target.value)} disabled={parentLocked}>
                <option value="">None (top-level)</option>
                {eligibleParents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Navigation label" hint="Optional shorter wording for the header and footer. Leave blank to use the title.">
              <TextInput
                value={form.nav_label}
                onChange={(e) => fSet("nav_label", e.target.value)}
                placeholder={form.title || "Defaults to the page title"}
              />
            </Field>

            <Checkbox label="Show in site navigation" checked={form.show_in_navigation} onChange={(e) => fSet("show_in_navigation", e.target.checked)} />
            <Checkbox
              label="Published"
              hint="Unpublished pages are omitted from the live site (including navigation) until you publish them and republish the directory. A published page hidden from navigation stays reachable at its URL."
              checked={form.is_active}
              onChange={(e) => fSet("is_active", e.target.checked)}
            />

            <div className="b3-stack b3-stack--tight">
              <h3 className="b3-subhead">Content</h3>
              <RichTextEditor value={form.body_html} onChange={(v) => fSet("body_html", v)} editable />
            </div>

            <div className="b3-stack b3-stack--tight">
              <h3 className="b3-subhead">Generate page content with AI</h3>
              <p className="b3-muted">
                Give the AI an outline — headings, bullet points, or a short brief — and it writes a full draft into the editor above for you to review. This only writes the page content; the SEO fields below are generated separately.
              </p>
              <AiProvenanceNote entityName="page" compact>
                AI writes a draft from your outline, using a built-in drafting prompt. It lands in the editor above for review; nothing is saved until you click Save.
              </AiProvenanceNote>
              <Field label="Outline">
                <Textarea
                  value={outline}
                  onChange={(e) => setOutline(e.target.value)}
                  rows={3}
                  placeholder="e.g. Cover: what membership costs, the application process, and who to contact with questions."
                />
              </Field>
              {!ai.available && <AiUnavailableNotice message={ai.message} href={ai.integrationsHref} />}
              <div>
                <AIButton compact variant="secondary" label="Generate content with AI" onGenerate={handleGenerate} disabled={!outline.trim() || !ai.available} />
              </div>
            </div>

            <div className="b3-stack b3-stack--tight">
              <div className="b3-row b3-row--between">
                <div className="b3-stack b3-stack--tight b3-grow">
                  <h3 className="b3-subhead">Search engine (SEO)</h3>
                  <p className="b3-muted">
                    Drafts a meta title and description from the page title and the content in the editor. Your content is not changed.
                  </p>
                  {!aiSeo.available && <AiUnavailableNotice message={aiSeo.message} href={aiSeo.integrationsHref} />}
                </div>
                <AIButton compact variant="subtle" label="Generate SEO with AI" onGenerate={handleGenerateSeo} disabled={!form.body_html?.trim() || !aiSeo.available} />
              </div>

              <FieldGrid>
                <Field label="Meta title">
                  <TextInput value={form.meta_title} onChange={(e) => fSet("meta_title", e.target.value)} placeholder="Defaults to page title" />
                </Field>
                <Field label="Meta description">
                  <TextInput value={form.meta_description} onChange={(e) => fSet("meta_description", e.target.value)} />
                </Field>
              </FieldGrid>

              <Checkbox label="Hide from search engines (noindex)" checked={form.noindex} onChange={(e) => fSet("noindex", e.target.checked)} />
            </div>

            {selectedChildren.length > 0 && (
              <p className="b3-muted">
                {selectedChildren.length} child page{selectedChildren.length === 1 ? "" : "s"} nest under this page in the live navigation.
              </p>
            )}
          </Section>
        )}
      </div>

      {deleteTarget ? (
        <Dialog
          title={`Delete “${deleteTarget.title}”?`}
          onClose={closeDelete}
          footer={
            <>
              <Button onClick={closeDelete} disabled={deleting}>Cancel</Button>
              <Button variant="danger-solid" onClick={confirmDelete} loading={deleting} loadingLabel="Deleting…" disabled={deleteMode === "reparent" && !reparentTo}>
                Delete page
              </Button>
            </>
          }
        >
          <div className="b3-stack">
            {deleteChildren.length ? (
              <>
                <p className="b3-text">This page has {deleteChildren.length} child page{deleteChildren.length === 1 ? "" : "s"}. Choose what happens to them:</p>
                <RadioCards
                  legend="Child pages"
                  name="delete-mode"
                  value={deleteMode}
                  onChange={setDeleteMode}
                  options={[
                    { value: "promote", label: "Move them to the top level" },
                    ...(reparentOptions.length ? [{ value: "reparent", label: "Move them under another page" }] : []),
                    { value: "delete", label: "Delete the child pages too" },
                  ]}
                />
                {deleteMode === "reparent" && (
                  <Field label="Move child pages under">
                    <Select value={reparentTo} onChange={(e) => setReparentTo(e.target.value)}>
                      {reparentOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
              </>
            ) : (
              <p className="b3-text">This can’t be undone.</p>
            )}
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

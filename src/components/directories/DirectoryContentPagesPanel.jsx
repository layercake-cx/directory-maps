import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import {
  listContentPages,
  createContentPage,
  updateContentPage,
  deleteContentPage,
  generateContentPageDraft,
  reorderContentPages,
  applyPageDrop,
  slugify,
} from "../../lib/contentPages.js";
import RichTextEditor from "./entryEdit/RichTextEditor.jsx";

const inputStyle = { width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--lc-border)", fontSize: 13 };
const labelStyle = { fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 };

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
  const [outline, setOutline] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [dragId, setDragId] = useState(null);
  const [dropHint, setDropHint] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteMode, setDeleteMode] = useState("promote");
  const [reparentTo, setReparentTo] = useState("");
  const [deleting, setDeleting] = useState(false);

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
    if (form.body_html?.trim() && !window.confirm("This page already has content — generating with AI will overwrite it here in the editor (nothing is saved until you click Save). Continue?")) {
      return;
    }
    setErr("");
    try {
      setGenerating(true);
      recordEvent?.("directory_content_page_ai_draft_requested", { directory_id: directoryId, page_id: selectedPage.id });
      const html = await generateContentPageDraft(selectedPage.id, outline.trim());
      fSet("body_html", html);
      recordEvent?.("directory_content_page_ai_draft_generated", { directory_id: directoryId, page_id: selectedPage.id });
    } catch (e) {
      recordEvent?.("directory_content_page_ai_draft_failed", { directory_id: directoryId, page_id: selectedPage.id, error: e?.message ?? String(e) });
      setErr(e?.message ?? String(e));
    } finally {
      setGenerating(false);
    }
  }

  if (!canManage) {
    return <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>Only an Owner or Manager can manage content pages.</p>;
  }

  const eligibleParents = selectedPage
    ? pages.filter((p) => !p.parent_page_id && p.id !== selectedPage.id && !pageHasChildren(pages, selectedPage.id))
    : pages.filter((p) => !p.parent_page_id);
  const parentLocked = selectedPage && pageHasChildren(pages, selectedPage.id);
  const deleteChildren = deleteTarget ? pages.filter((p) => p.parent_page_id === deleteTarget.id) : [];
  const reparentOptions = deleteTarget ? pages.filter((p) => !p.parent_page_id && p.id !== deleteTarget.id) : [];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20, alignItems: "start" }}>
      <div className="admin-card" style={{ padding: 16 }}>
        <Text size="sm" fw={600} mb={4}>
          Pages
        </Text>
        <Text size="xs" c="dimmed" mb={8}>
          Drag to reorder. Drop onto a top-level page to nest (one level only).
        </Text>
        {loading ? (
          <Text size="xs" c="dimmed">
            Loading…
          </Text>
        ) : tree.length === 0 ? (
          <Text size="xs" c="dimmed">
            No pages yet.
          </Text>
        ) : (
          <div style={{ display: "grid", gap: 2, marginBottom: 12 }} onDragLeave={() => setDropHint(null)}>
            {tree.map(({ page, depth }) => {
              const hintHere = dropHint?.id === page.id;
              const border =
                hintHere && dropHint.placement === "before"
                  ? "2px solid var(--lc-accent, #2563eb)"
                  : hintHere && dropHint.placement === "after"
                    ? "2px solid var(--lc-accent, #2563eb)"
                    : hintHere && dropHint.placement === "child"
                      ? "2px dashed var(--lc-accent, #2563eb)"
                      : "2px solid transparent";
              return (
                <div
                  key={page.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, page.id)}
                  onDragOver={(e) => handleDragOver(e, page)}
                  onDrop={(e) => handleDrop(e, page)}
                  onDragEnd={() => {
                    setDragId(null);
                    setDropHint(null);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    borderTop: hintHere && dropHint.placement === "before" ? border : "2px solid transparent",
                    borderBottom: hintHere && dropHint.placement === "after" ? border : "2px solid transparent",
                    outline: hintHere && dropHint.placement === "child" ? border : undefined,
                    borderRadius: 6,
                    paddingLeft: 4 + depth * 16,
                    background: page.id === selectedId ? "var(--lc-border)" : dragId === page.id ? "var(--lc-border)" : "transparent",
                    opacity: page.is_active ? 1 : 0.55,
                  }}
                >
                  <span aria-hidden="true" style={{ cursor: "grab", color: "#9ca3af", fontSize: 14, padding: "0 2px", userSelect: "none" }} title="Drag to reorder">
                    ☰
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedId(page.id)}
                    style={{
                      flex: 1,
                      textAlign: "left",
                      border: "none",
                      background: "transparent",
                      borderRadius: 6,
                      padding: "6px 8px 6px 0",
                      fontSize: 13,
                      cursor: "pointer",
                      color: "inherit",
                    }}
                  >
                    {depth > 0 ? "↳ " : ""}
                    {page.nav_label || page.title}
                    {!page.show_in_navigation ? " · hidden" : ""}
                    {!page.is_active ? " · unpublished" : ""}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <Stack gap={6}>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="New page title"
            style={inputStyle}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
          />
          <Button size="xs" onClick={handleCreate} loading={creating} disabled={!newTitle.trim()}>
            + Add page
          </Button>
        </Stack>
      </div>

      <div className="admin-card" style={{ padding: 20 }}>
        {err && (
          <Alert color="red" variant="light" mb="sm">
            {err}
          </Alert>
        )}
        {msg && (
          <Alert color="green" variant="light" mb="sm">
            {msg}
          </Alert>
        )}

        {deleteTarget ? (
          <Stack gap="sm">
            <Text size="sm" fw={600}>
              Delete “{deleteTarget.title}”?
            </Text>
            {deleteChildren.length ? (
              <>
                <Text size="sm">This page has {deleteChildren.length} child page{deleteChildren.length === 1 ? "" : "s"}. Choose what happens to them:</Text>
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
                  <input type="radio" name="delete-mode" checked={deleteMode === "promote"} onChange={() => setDeleteMode("promote")} />
                  <span>Move them to the top level</span>
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
                  <input type="radio" name="delete-mode" checked={deleteMode === "reparent"} onChange={() => setDeleteMode("reparent")} disabled={!reparentOptions.length} />
                  <span>Move them under another page</span>
                </label>
                {deleteMode === "reparent" && (
                  <select value={reparentTo} onChange={(e) => setReparentTo(e.target.value)} style={inputStyle}>
                    {reparentOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                )}
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
                  <input type="radio" name="delete-mode" checked={deleteMode === "delete"} onChange={() => setDeleteMode("delete")} />
                  <span>Delete the child pages too</span>
                </label>
              </>
            ) : (
              <Text size="sm">This can’t be undone.</Text>
            )}
            <Group justify="flex-end">
              <Button size="xs" variant="default" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Cancel
              </Button>
              <Button size="xs" color="red" onClick={confirmDelete} loading={deleting} disabled={deleteMode === "reparent" && !reparentTo}>
                Delete page
              </Button>
            </Group>
          </Stack>
        ) : !selectedPage ? (
          <Text size="sm" c="dimmed">
            Select a page on the left, or add a new one, to edit it.
          </Text>
        ) : (
          <Stack gap="sm">
            <Group justify="space-between">
              <Text size="sm" fw={600}>
                Edit page
              </Text>
              <Button size="xs" variant="subtle" color="red" onClick={() => openDelete(selectedPage)}>
                Delete page
              </Button>
            </Group>

            <Group gap="sm" grow>
              <div>
                <label style={labelStyle}>Title</label>
                <input value={form.title} onChange={(e) => fSet("title", e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>URL slug</label>
                <input value={form.slug} onChange={(e) => fSet("slug", e.target.value)} style={inputStyle} />
              </div>
            </Group>

            <div>
              <label style={labelStyle}>Parent page</label>
              <select
                value={form.parent_page_id}
                onChange={(e) => fSet("parent_page_id", e.target.value)}
                style={inputStyle}
                disabled={parentLocked}
              >
                <option value="">None (top-level)</option>
                {eligibleParents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
              {parentLocked ? (
                <Text size="xs" c="dimmed" mt={4}>
                  This page has child pages, so it has to stay top-level. Move or delete the children first to nest it.
                </Text>
              ) : (
                <Text size="xs" c="dimmed" mt={4}>
                  Changing the parent changes the published URL (old URLs redirect after the next publish).
                </Text>
              )}
            </div>

            <div>
              <label style={labelStyle}>Navigation label</label>
              <input
                value={form.nav_label}
                onChange={(e) => fSet("nav_label", e.target.value)}
                placeholder={form.title || "Defaults to the page title"}
                style={inputStyle}
              />
              <Text size="xs" c="dimmed" mt={4}>
                Optional shorter wording for the header and footer. Leave blank to use the title.
              </Text>
            </div>

            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
              <input type="checkbox" checked={form.show_in_navigation} onChange={(e) => fSet("show_in_navigation", e.target.checked)} />
              Show in site navigation
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
              <input type="checkbox" checked={form.is_active} onChange={(e) => fSet("is_active", e.target.checked)} />
              Published
            </label>
            <Text size="xs" c="dimmed">
              Unpublished pages are omitted from the live site (including navigation) until you publish them and republish the directory. A published page hidden from navigation stays reachable at its URL.
            </Text>

            <div>
              <Group justify="space-between" mb={6}>
                <Text size="xs" fw={600}>
                  Content
                </Text>
              </Group>
              <RichTextEditor value={form.body_html} onChange={(v) => fSet("body_html", v)} editable />
            </div>

            <div className="admin-card" style={{ padding: 12, background: "#f9fafb" }}>
              <Text size="xs" fw={600} mb={6}>
                Generate with AI
              </Text>
              <Text size="xs" c="dimmed" mb={6}>
                Give Claude an outline — headings, bullet points, or a short brief — and it writes a full draft into the editor above for you to review.
              </Text>
              <textarea
                value={outline}
                onChange={(e) => setOutline(e.target.value)}
                rows={3}
                placeholder="e.g. Cover: what membership costs, the application process, and who to contact with questions."
                style={{ ...inputStyle, resize: "vertical", marginBottom: 6 }}
              />
              <Button size="xs" variant="light" onClick={handleGenerate} loading={generating} disabled={!outline.trim()}>
                Generate with AI
              </Button>
            </div>

            <Group gap="sm" grow>
              <div>
                <label style={labelStyle}>Meta title</label>
                <input value={form.meta_title} onChange={(e) => fSet("meta_title", e.target.value)} placeholder="Defaults to page title" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Meta description</label>
                <input value={form.meta_description} onChange={(e) => fSet("meta_description", e.target.value)} style={inputStyle} />
              </div>
            </Group>

            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
              <input type="checkbox" checked={form.noindex} onChange={(e) => fSet("noindex", e.target.checked)} />
              Hide from search engines (noindex)
            </label>

            {selectedChildren.length > 0 && (
              <Text size="xs" c="dimmed">
                {selectedChildren.length} child page{selectedChildren.length === 1 ? "" : "s"} nest under this page in the live navigation.
              </Text>
            )}

            <Group justify="flex-end">
              <Button size="sm" onClick={handleSave} loading={saving}>
                Save
              </Button>
            </Group>
          </Stack>
        )}
      </div>
    </div>
  );
}

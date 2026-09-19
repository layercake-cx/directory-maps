import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import {
  listContentPages,
  createContentPage,
  updateContentPage,
  deleteContentPage,
  generateContentPageDraft,
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
    position: page?.position ?? 0,
    body_html: page?.body_html || "",
    meta_title: page?.meta_title || "",
    meta_description: page?.meta_description || "",
    noindex: !!page?.noindex,
  };
}

/** Ids of `page` and everything beneath it in the nav tree — excluded from its own "Parent page" dropdown so a page can never become its own ancestor. */
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

/** Flat list of {page, depth} in nav order, children directly under their parent — for both the left-hand tree and the "Parent page" dropdown. */
function flattenTree(pages, parentId = null, depth = 0) {
  const siblings = pages.filter((p) => (p.parent_page_id || null) === parentId).sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.title.localeCompare(b.title));
  return siblings.flatMap((p) => [{ page: p, depth }, ...flattenTree(pages, p.id, depth + 1)]);
}

/**
 * Feature 6 of the Directory Searchability & AI Metadata plan — editor-built
 * content pages (About, How to join, a sector guide) alongside a
 * directory's entry listings. parent_page_id is nav-hierarchy only; a
 * page's own live URL is flat, same basePath as entries (see
 * generate_directory_site's builders.ts/index.ts). New pages are created
 * with just a title first, then edited here — same "can't edit sub-panels
 * until the record exists" pattern the entry editor already uses for its
 * own Content tab.
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

  useEffect(() => { void refresh(); }, [refresh]);

  const tree = useMemo(() => flattenTree(pages), [pages]);
  const selectedPage = pages.find((p) => p.id === selectedId) || null;

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
      await updateContentPage(selectedPage.id, {
        title: form.title,
        slug: form.slug,
        parent_page_id: form.parent_page_id || null,
        position: Number(form.position) || 0,
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

  async function handleDelete(page) {
    if (!window.confirm(`Delete "${page.title}"? Any sub-pages move up to become top-level pages. This can't be undone.`)) return;
    setErr("");
    try {
      await deleteContentPage(page.id);
      recordEvent?.("directory_content_page_deleted", { directory_id: directoryId, page_id: page.id, title: page.title });
      if (selectedId === page.id) setSelectedId(null);
      await refresh();
    } catch (e) {
      setErr(e?.message ?? String(e));
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

  const parentOptions = selectedPage ? pages.filter((p) => p.id !== selectedPage.id && !descendantIds(pages, selectedPage.id).has(p.id)) : pages;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 20, alignItems: "start" }}>
      <div className="admin-card" style={{ padding: 16 }}>
        <Text size="sm" fw={600} mb={8}>Pages</Text>
        {loading ? (
          <Text size="xs" c="dimmed">Loading…</Text>
        ) : tree.length === 0 ? (
          <Text size="xs" c="dimmed">No pages yet.</Text>
        ) : (
          <div style={{ display: "grid", gap: 2, marginBottom: 12 }}>
            {tree.map(({ page, depth }) => (
              <button
                key={page.id}
                type="button"
                onClick={() => setSelectedId(page.id)}
                style={{
                  textAlign: "left",
                  border: "none",
                  background: page.id === selectedId ? "var(--lc-border)" : "transparent",
                  borderRadius: 6,
                  padding: "6px 8px",
                  paddingLeft: 8 + depth * 16,
                  fontSize: 13,
                  cursor: "pointer",
                  color: page.is_active ? "inherit" : "#9ca3af",
                }}
              >
                {page.title}
              </button>
            ))}
          </div>
        )}
        <Stack gap={6}>
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="New page title" style={inputStyle} onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }} />
          <Button size="xs" onClick={handleCreate} loading={creating} disabled={!newTitle.trim()}>+ Add page</Button>
        </Stack>
      </div>

      <div className="admin-card" style={{ padding: 20 }}>
        {err && <Alert color="red" variant="light" mb="sm">{err}</Alert>}
        {msg && <Alert color="green" variant="light" mb="sm">{msg}</Alert>}

        {!selectedPage ? (
          <Text size="sm" c="dimmed">Select a page on the left, or add a new one, to edit it.</Text>
        ) : (
          <Stack gap="sm">
            <Group justify="space-between">
              <Text size="sm" fw={600}>Edit page</Text>
              <Button size="xs" variant="subtle" color="red" onClick={() => handleDelete(selectedPage)}>Delete page</Button>
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

            <Group gap="sm" grow>
              <div>
                <label style={labelStyle}>Parent page</label>
                <select value={form.parent_page_id} onChange={(e) => fSet("parent_page_id", e.target.value)} style={inputStyle}>
                  <option value="">None (top-level)</option>
                  {parentOptions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Position (lower = earlier)</label>
                <input type="number" value={form.position} onChange={(e) => fSet("position", e.target.value)} style={inputStyle} />
              </div>
            </Group>

            <div>
              <Group justify="space-between" mb={6}>
                <Text size="xs" fw={600}>Content</Text>
              </Group>
              <RichTextEditor value={form.body_html} onChange={(v) => fSet("body_html", v)} editable />
            </div>

            <div className="admin-card" style={{ padding: 12, background: "#f9fafb" }}>
              <Text size="xs" fw={600} mb={6}>Generate with AI</Text>
              <Text size="xs" c="dimmed" mb={6}>Give Claude an outline — headings, bullet points, or a short brief — and it writes a full draft into the editor above for you to review.</Text>
              <textarea
                value={outline}
                onChange={(e) => setOutline(e.target.value)}
                rows={3}
                placeholder="e.g. Cover: what membership costs, the application process, and who to contact with questions."
                style={{ ...inputStyle, resize: "vertical", marginBottom: 6 }}
              />
              <Button size="xs" variant="light" onClick={handleGenerate} loading={generating} disabled={!outline.trim()}>Generate with AI</Button>
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

            <Group justify="flex-end">
              <Button size="sm" onClick={handleSave} loading={saving}>Save</Button>
            </Group>
          </Stack>
        )}
      </div>
    </div>
  );
}

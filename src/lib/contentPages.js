/**
 * Directory content pages — editor-built pages alongside a directory's
 * entries, organised into at most two levels beneath the directory home.
 * Published URLs nest as /:parentSlug/:childSlug (see generate_directory_site).
 *
 * A page's slug must not collide with either another page's slug (DB
 * unique(directory_id, slug)) or an existing entry's slug (checked here).
 */

import { supabase, invokeFunction } from "./supabase";
import { slugify } from "./directories.js";
import { sanitizeNotesHtml } from "./sanitizeHtml.js";

export { slugify };

const PAGE_COLUMNS =
  "id, directory_id, parent_page_id, title, slug, position, nav_label, show_in_navigation, body_html, meta_title, meta_description, noindex, is_active, created_at, updated_at";

/** All pages for a directory, in nav order (siblings ordered by position). */
export async function listContentPages(directoryId) {
  if (!directoryId) return [];
  const { data, error } = await supabase
    .from("directory_content_pages")
    .select(PAGE_COLUMNS)
    .eq("directory_id", directoryId)
    .order("position", { ascending: true })
    .order("title", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getContentPage(pageId) {
  if (!pageId) return null;
  const { data, error } = await supabase.from("directory_content_pages").select(PAGE_COLUMNS).eq("id", pageId).maybeSingle();
  if (error) throw error;
  return data;
}

/** Throws if `slug` is already used by another page or by an entry in this directory. `excludePageId` lets an update check against everything except itself. */
async function assertSlugAvailable(directoryId, slug, excludePageId) {
  let pageQuery = supabase.from("directory_content_pages").select("id").eq("directory_id", directoryId).eq("slug", slug);
  if (excludePageId) pageQuery = pageQuery.neq("id", excludePageId);
  const { data: pageMatch, error: pageErr } = await pageQuery.maybeSingle();
  if (pageErr) throw pageErr;
  if (pageMatch) throw new Error(`Another page already uses the URL slug "${slug}".`);

  const { data: entryMatch, error: entryErr } = await supabase
    .from("directory_entries")
    .select("id")
    .eq("directory_id", directoryId)
    .eq("slug", slug)
    .maybeSingle();
  if (entryErr) throw entryErr;
  if (entryMatch) throw new Error(`An entry already uses the URL slug "${slug}" — choose a different one for this page.`);
}

function assertNestingAllowed(pages, pageId, parentPageId) {
  if (!parentPageId) return;
  if (parentPageId === pageId) throw new Error("A page cannot be its own parent.");
  const parent = pages.find((p) => p.id === parentPageId);
  if (!parent) throw new Error("That parent page no longer exists.");
  if (parent.parent_page_id) throw new Error("Pages can only nest one level beneath the directory home.");
  if (pageId && pages.some((p) => p.parent_page_id === pageId)) {
    throw new Error("A page with children cannot become a child page — move or delete its children first.");
  }
}

export async function createContentPage({
  directory_id,
  parent_page_id,
  title,
  slug,
  body_html,
  meta_title,
  meta_description,
  noindex,
  position,
  nav_label,
  show_in_navigation,
  is_active,
}) {
  const cleanTitle = String(title || "").trim();
  if (!cleanTitle) throw new Error("Title is required.");
  const cleanSlug = slugify(slug || title);
  if (!cleanSlug) throw new Error("Could not derive a URL slug from that title — set one explicitly.");
  if (!directory_id) throw new Error("Missing directory id.");

  const existing = await listContentPages(directory_id);
  assertNestingAllowed(existing, null, parent_page_id || null);
  await assertSlugAvailable(directory_id, cleanSlug);

  const siblings = existing.filter((p) => (p.parent_page_id || null) === (parent_page_id || null));
  const nextPosition = position ?? (siblings.length ? Math.max(...siblings.map((p) => p.position ?? 0)) + 1 : 0);

  const id = crypto.randomUUID();
  const { error } = await supabase.from("directory_content_pages").insert({
    id,
    directory_id,
    parent_page_id: parent_page_id || null,
    title: cleanTitle,
    slug: cleanSlug,
    position: nextPosition,
    nav_label: nav_label?.trim() || null,
    show_in_navigation: show_in_navigation !== false,
    body_html: sanitizeNotesHtml(body_html) || "",
    meta_title: meta_title?.trim() || null,
    meta_description: meta_description?.trim() || null,
    noindex: !!noindex,
    is_active: is_active !== false,
  });
  if (error) throw error;
  return id;
}

export async function updateContentPage(pageId, patch) {
  const clean = { ...patch, updated_at: new Date().toISOString() };
  if ("body_html" in clean) clean.body_html = sanitizeNotesHtml(clean.body_html) || "";
  if ("title" in clean) clean.title = String(clean.title || "").trim();
  if ("meta_title" in clean) clean.meta_title = clean.meta_title?.trim() || null;
  if ("meta_description" in clean) clean.meta_description = clean.meta_description?.trim() || null;
  if ("nav_label" in clean) clean.nav_label = clean.nav_label?.trim() || null;
  if ("parent_page_id" in clean) clean.parent_page_id = clean.parent_page_id || null;

  const { data: current, error: currentErr } = await supabase
    .from("directory_content_pages")
    .select("id, directory_id, parent_page_id")
    .eq("id", pageId)
    .single();
  if (currentErr) throw currentErr;

  if ("slug" in clean) {
    clean.slug = slugify(clean.slug);
    if (!clean.slug) throw new Error("URL slug cannot be blank.");
    await assertSlugAvailable(current.directory_id, clean.slug, pageId);
  }

  if ("parent_page_id" in clean) {
    const pages = await listContentPages(current.directory_id);
    assertNestingAllowed(pages, pageId, clean.parent_page_id);
  }

  const { error } = await supabase.from("directory_content_pages").update(clean).eq("id", pageId);
  if (error) throw error;
}

/**
 * Persist a full tree order after drag-and-drop. Each row is written once
 * with its final parent + position so the redirect trigger does not see a
 * fake promote-then-reparent. Rows going to the top level are written first
 * so a later nest never briefly sees a still-nested parent.
 */
export async function reorderContentPages(directoryId, rows, previous = []) {
  if (!directoryId || !rows?.length) return;
  const prevById = new Map((previous || []).map((p) => [p.id, p]));
  const changed = rows.filter((row) => {
    const prev = prevById.get(row.id);
    if (!prev) return true;
    return (prev.parent_page_id || null) !== (row.parent_page_id || null) || (prev.position ?? 0) !== (row.position ?? 0);
  });
  if (!changed.length) return;

  const now = new Date().toISOString();
  const toTop = changed.filter((r) => !r.parent_page_id);
  const nested = changed.filter((r) => r.parent_page_id);
  for (const row of [...toTop, ...nested]) {
    const prev = prevById.get(row.id);
    const parentChanged = !prev || (prev.parent_page_id || null) !== (row.parent_page_id || null);
    const patch = parentChanged
      ? { parent_page_id: row.parent_page_id || null, position: row.position, updated_at: now }
      : { position: row.position, updated_at: now };
    const { error } = await supabase.from("directory_content_pages").update(patch).eq("id", row.id).eq("directory_id", directoryId);
    if (error) throw error;
  }
}

/**
 * Delete a page. A parent with children cannot be deleted until those
 * children are promoted, moved to another top-level page, or deleted
 * (DB ON DELETE RESTRICT). `childrenAction` is required when children exist:
 *   - "promote" — set each child's parent_page_id to null
 *   - "reparent" — move children under `reparentToId` (must be a different top-level page)
 *   - "delete" — delete children first, then the parent
 */
export async function deleteContentPage(pageId, { childrenAction, reparentToId } = {}) {
  const { data: page, error: pageErr } = await supabase
    .from("directory_content_pages")
    .select("id, directory_id")
    .eq("id", pageId)
    .single();
  if (pageErr) throw pageErr;

  const pages = await listContentPages(page.directory_id);
  const children = pages.filter((p) => p.parent_page_id === pageId);

  if (children.length) {
    if (childrenAction === "promote") {
      for (const child of children) {
        const { error } = await supabase
          .from("directory_content_pages")
          .update({ parent_page_id: null, updated_at: new Date().toISOString() })
          .eq("id", child.id);
        if (error) throw error;
      }
    } else if (childrenAction === "reparent") {
      if (!reparentToId || reparentToId === pageId) throw new Error("Choose another top-level page to move the children under.");
      assertNestingAllowed(pages, children[0].id, reparentToId);
      for (const child of children) {
        const { error } = await supabase
          .from("directory_content_pages")
          .update({ parent_page_id: reparentToId, updated_at: new Date().toISOString() })
          .eq("id", child.id);
        if (error) throw error;
      }
    } else if (childrenAction === "delete") {
      for (const child of children) {
        const { error } = await supabase.from("directory_content_pages").delete().eq("id", child.id);
        if (error) throw error;
      }
    } else {
      throw new Error("This page has child pages. Promote them, move them, or delete them before deleting the parent.");
    }
  }

  const { error } = await supabase.from("directory_content_pages").delete().eq("id", pageId);
  if (error) throw error;
}

/**
 * Apply a tree drop in memory. `placement` is "before" | "after" | "child".
 * Returns a new pages array, or the original if the drop is invalid.
 */
export function applyPageDrop(pages, draggedId, targetId, placement) {
  const dragged = pages.find((p) => p.id === draggedId);
  const target = pages.find((p) => p.id === targetId);
  if (!dragged || !target || draggedId === targetId) return pages;
  if (!["before", "after", "child"].includes(placement)) return pages;

  const draggedHasChildren = pages.some((p) => p.parent_page_id === draggedId);
  let newParent = null;
  if (placement === "child") {
    if (target.parent_page_id) return pages;
    if (draggedHasChildren) return pages;
    if (target.id === draggedId) return pages;
    newParent = target.id;
  } else {
    newParent = target.parent_page_id || null;
    if (newParent && draggedHasChildren) return pages;
  }

  try {
    assertNestingAllowed(
      pages.map((p) => (p.id === draggedId ? { ...p, parent_page_id: newParent } : p)),
      draggedId,
      newParent,
    );
  } catch {
    return pages;
  }

  const others = pages.filter((p) => p.id !== draggedId);
  const siblings = others
    .filter((p) => (p.parent_page_id || null) === newParent)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.title.localeCompare(b.title));

  let insertAt;
  if (placement === "child") {
    insertAt = siblings.length;
  } else {
    const idx = siblings.findIndex((p) => p.id === targetId);
    insertAt = placement === "before" ? idx : idx + 1;
    if (idx < 0) insertAt = siblings.length;
  }

  const nextSiblings = [...siblings];
  nextSiblings.splice(insertAt, 0, { ...dragged, parent_page_id: newParent });

  const updated = new Map(pages.map((p) => [p.id, { ...p }]));
  updated.get(draggedId).parent_page_id = newParent;

  nextSiblings.forEach((p, i) => {
    updated.get(p.id).parent_page_id = newParent;
    updated.get(p.id).position = i;
  });

  const oldParent = dragged.parent_page_id || null;
  if (oldParent !== newParent) {
    others
      .filter((p) => (p.parent_page_id || null) === oldParent)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.title.localeCompare(b.title))
      .forEach((p, i) => {
        updated.get(p.id).position = i;
      });
  }

  return [...updated.values()];
}

/**
 * AI-drafted page body from an editor-supplied outline — headings, bullet
 * points, or a short brief. Never persisted by the Edge Function itself;
 * the draft lands in the (unsaved) rich text editor for review, same
 * generate-then-editor-decides contract as every other AI action in this
 * plan.
 */
export async function generateContentPageDraft(pageId, outline) {
  const { data, error } = await invokeFunction("generate_content_page_draft", { body: { page_id: pageId, outline } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.body_html;
}

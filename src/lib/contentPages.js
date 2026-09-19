/**
 * Directory content pages (Directory Searchability & AI Metadata plan,
 * Feature 6) — editor-built pages alongside a directory's entries, e.g.
 * "About", "How to join", a sector guide. See
 * 20260919150000_create_directory_content_pages.sql for the schema.
 *
 * parent_page_id is nav-hierarchy grouping only — published URLs are flat
 * (same basePath as entries), so a page's slug must not collide with either
 * another page's slug (enforced by a DB constraint scoped to this table) or
 * an existing entry's slug (checked here in application code, since that's
 * a different table with its own separate uniqueness constraint).
 */

import { supabase, invokeFunction } from "./supabase";
import { slugify } from "./directories.js";
import { sanitizeNotesHtml } from "./sanitizeHtml.js";

export { slugify };

const PAGE_COLUMNS = "id, directory_id, parent_page_id, title, slug, position, body_html, meta_title, meta_description, noindex, is_active, created_at, updated_at";

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

export async function createContentPage({ directory_id, parent_page_id, title, slug, body_html, meta_title, meta_description, noindex, position }) {
  const cleanTitle = String(title || "").trim();
  if (!cleanTitle) throw new Error("Title is required.");
  const cleanSlug = slugify(slug || title);
  if (!cleanSlug) throw new Error("Could not derive a URL slug from that title — set one explicitly.");
  if (!directory_id) throw new Error("Missing directory id.");

  await assertSlugAvailable(directory_id, cleanSlug);

  const id = crypto.randomUUID();
  const { error } = await supabase.from("directory_content_pages").insert({
    id,
    directory_id,
    parent_page_id: parent_page_id || null,
    title: cleanTitle,
    slug: cleanSlug,
    position: position ?? 0,
    body_html: sanitizeNotesHtml(body_html) || "",
    meta_title: meta_title?.trim() || null,
    meta_description: meta_description?.trim() || null,
    noindex: !!noindex,
    is_active: true,
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

  if ("slug" in clean) {
    clean.slug = slugify(clean.slug);
    if (!clean.slug) throw new Error("URL slug cannot be blank.");
    const { data: current, error: currentErr } = await supabase.from("directory_content_pages").select("directory_id").eq("id", pageId).single();
    if (currentErr) throw currentErr;
    await assertSlugAvailable(current.directory_id, clean.slug, pageId);
  }

  const { error } = await supabase.from("directory_content_pages").update(clean).eq("id", pageId);
  if (error) throw error;
}

export async function deleteContentPage(pageId) {
  const { error } = await supabase.from("directory_content_pages").delete().eq("id", pageId);
  if (error) throw error;
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

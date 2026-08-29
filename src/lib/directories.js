/**
 * Directories — shared data access.
 *
 * Directory is the peer of Map; directory_entries is the peer of listings
 * (docs/DIRECTORIES.md, epic DIR-E1). See 20260714120000_create_directories.sql
 * for the schema. SEO/branding/categorisation columns land with later epics
 * (DIR-E2/E3/E5) — this module only covers core CRUD.
 */

import { supabase } from "./supabase";
import { sanitizeNotesHtml } from "./sanitizeHtml.js";

export const ENTRIES_PAGE_SIZE = 100;

/** URL-safe slug from a human name (matches ClientMapNew.jsx's convention). */
export function slugify(input) {
  return (input || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** List directories for a client, most recently updated first. */
export async function listDirectories(clientId, { includeArchived = false } = {}) {
  if (!clientId) return [];
  let query = supabase
    .from("directories")
    .select("id, client_id, name, slug, description, is_active, published_at, created_at, updated_at, directory_entries(count)")
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false });
  if (!includeArchived) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getDirectory(directoryId) {
  if (!directoryId) return null;
  const { data, error } = await supabase
    .from("directories")
    .select("id, client_id, name, slug, description, is_active, seo_defaults_json, theme_json, current_publication_id, published_at, created_at, updated_at")
    .eq("id", directoryId)
    .single();
  if (error) throw error;
  return data;
}

export async function createDirectory({ clientId, name, slug, description }) {
  const cleanName = String(name || "").trim();
  const cleanSlug = String(slug || "").trim();
  if (!cleanName) throw new Error("Directory name is required.");
  if (!cleanSlug) throw new Error("Directory slug is required.");
  if (!clientId) throw new Error("Missing client id.");

  const id = crypto.randomUUID();
  const { error } = await supabase.from("directories").insert({
    id,
    client_id: clientId,
    name: cleanName,
    slug: cleanSlug,
    description: description ? String(description).trim() : null,
  });
  if (error) {
    if (error.code === "23505") {
      throw new Error("This slug is already used by another directory.");
    }
    throw error;
  }
  return id;
}

export async function updateDirectory(directoryId, patch) {
  const { error } = await supabase
    .from("directories")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", directoryId);
  if (error) throw error;
}

export async function archiveDirectory(directoryId) {
  await updateDirectory(directoryId, { is_active: false });
}

export async function restoreDirectory(directoryId) {
  await updateDirectory(directoryId, { is_active: true });
}

export async function deleteDirectoryPermanently(directoryId) {
  const { error } = await supabase.from("directories").delete().eq("id", directoryId);
  if (error) throw error;
}

// ---- Directory groups (simple single-value grouping, peer of `groups`) ----

export async function listDirectoryGroups(directoryId) {
  if (!directoryId) return [];
  const { data, error } = await supabase
    .from("directory_groups")
    .select("id, directory_id, name, sort_order, color")
    .eq("directory_id", directoryId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createDirectoryGroup(directoryId, name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) throw new Error("Group name is required.");
  const { data, error } = await supabase
    .from("directory_groups")
    .insert({ directory_id: directoryId, name: cleanName })
    .select("id, directory_id, name, sort_order, color")
    .single();
  if (error) throw error;
  return data;
}

// ---- Directory entries (peer of listings) ----

/**
 * Server-side paginated + searched entry list.
 * @returns {{ rows: object[], count: number }}
 */
export async function listDirectoryEntries(directoryId, { search = "", page = 0, pageSize = ENTRIES_PAGE_SIZE } = {}) {
  if (!directoryId) return { rows: [], count: 0 };

  let query = supabase
    .from("directory_entries")
    .select(
      "id, directory_id, directory_group_id, name, address, postcode, country, city, lat, lng, website_url, email, phone, logo_url, notes_html, allow_html, is_active, source, show_phone, show_email, show_website, show_address, created_at, updated_at",
      { count: "exact" },
    )
    .eq("directory_id", directoryId)
    .order("name", { ascending: true });

  const term = search.trim();
  if (term) {
    const escaped = term.replace(/[%,]/g, "");
    query = query.or(`name.ilike.%${escaped}%,address.ilike.%${escaped}%`);
  }

  const from = page * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);
  if (error) throw error;
  return { rows: data ?? [], count: count ?? 0 };
}

export async function getDirectoryEntry(entryId) {
  if (!entryId) return null;
  const { data, error } = await supabase
    .from("directory_entries")
    .select(
      "id, directory_id, directory_group_id, name, address, postcode, country, city, lat, lng, website_url, email, phone, logo_url, notes_html, allow_html, is_active, source, show_phone, show_email, show_website, show_address, slug, meta_title, meta_description, noindex, structured_data_type, sitemap_priority, created_at, updated_at",
    )
    .eq("id", entryId)
    .single();
  if (error) throw error;
  return data;
}

export async function createDirectoryEntry(entry) {
  const cleanName = String(entry?.name || "").trim();
  if (!cleanName) throw new Error("Name is required.");

  const id = crypto.randomUUID();
  const { error } = await supabase.from("directory_entries").insert({
    id,
    directory_id: entry.directory_id,
    directory_group_id: entry.directory_group_id || null,
    name: cleanName,
    address: entry.address || null,
    postcode: entry.postcode || null,
    country: entry.country || null,
    city: entry.city || null,
    lat: entry.lat === "" || entry.lat == null ? null : Number(entry.lat),
    lng: entry.lng === "" || entry.lng == null ? null : Number(entry.lng),
    website_url: entry.website_url || null,
    email: entry.email || null,
    phone: entry.phone || null,
    logo_url: entry.logo_url || null,
    notes_html: sanitizeNotesHtml(entry.notes_html) || null,
    allow_html: !!entry.allow_html,
    is_active: entry.is_active !== false,
    source: entry.source || "manual",
    show_phone: entry.show_phone !== false,
    show_email: entry.show_email !== false,
    show_website: entry.show_website !== false,
    show_address: entry.show_address !== false,
  });
  if (error) throw error;
  return id;
}

export async function updateDirectoryEntry(entryId, patch) {
  const clean = { ...patch, updated_at: new Date().toISOString() };
  if ("lat" in clean) clean.lat = clean.lat === "" || clean.lat == null ? null : Number(clean.lat);
  if ("lng" in clean) clean.lng = clean.lng === "" || clean.lng == null ? null : Number(clean.lng);
  if ("notes_html" in clean) clean.notes_html = sanitizeNotesHtml(clean.notes_html) || null;
  const { error } = await supabase.from("directory_entries").update(clean).eq("id", entryId);
  if (error) throw error;
}

export async function deleteDirectoryEntry(entryId) {
  const { error } = await supabase.from("directory_entries").delete().eq("id", entryId);
  if (error) throw error;
}

/** Bulk archive/restore (is_active toggle) — DIR-E1-S4. */
export async function bulkSetDirectoryEntriesActive(entryIds, isActive) {
  const ids = [...new Set((entryIds || []).filter(Boolean))];
  if (ids.length === 0) return 0;
  const { error } = await supabase
    .from("directory_entries")
    .update({ is_active: !!isActive, updated_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw error;
  return ids.length;
}

/**
 * Bulk-insert/upsert entries from a CSV import (DIR-E1-S6). Callers are
 * responsible for resolving directory_group_id from group_name first — see
 * ClientMapData.jsx's doImport for the auto-create-on-import convention this
 * mirrors. notes_html is sanitised the same as the single-entry write path.
 */
export async function upsertDirectoryEntries(rows) {
  const clean = (rows || []).map((r) => ({
    ...r,
    notes_html: r.notes_html ? sanitizeNotesHtml(r.notes_html) : null,
  }));
  if (clean.length === 0) return [];
  const { data, error } = await supabase.from("directory_entries").upsert(clean, { onConflict: "id" }).select("id");
  if (error) throw error;
  return data ?? [];
}

/** Copies mapId's groups and listings into a brand-new directory. Does not publish it or attach it back to the map. */
export async function createDirectoryFromMap(mapId, { name, slug } = {}) {
  const { data, error } = await supabase.rpc("create_directory_from_map", {
    p_map_id: mapId,
    p_name: name ? String(name).trim() : null,
    p_slug: slug ? String(slug).trim() : null,
  });
  if (error) throw error;
  return data;
}

// ---- Map <-> directory datasource association (DIR-E4-S2) ----

/**
 * Maps that use this directory as their live pin datasource — [] if none.
 * Used to warn before archiving/deleting a directory (a linked map either
 * silently keeps serving stale data forever, if published and the
 * directory is archived, or reverts to its own manually-edited listings,
 * if the directory is deleted).
 */
export async function getMapsLinkedToDirectory(directoryId) {
  if (!directoryId) return [];
  const { data: assocs, error } = await supabase
    .from("directory_map_associations")
    .select("map_id")
    .eq("directory_id", directoryId);
  if (error) throw error;
  if (!assocs?.length) return [];
  const { data: maps, error: mapsErr } = await supabase
    .from("maps")
    .select("id, name, slug, current_publication_id")
    .in("id", assocs.map((a) => a.map_id));
  if (mapsErr) throw mapsErr;
  return maps ?? [];
}

/** The map's directory datasource association, or null if the map is self-authored. */
export async function getMapDirectoryAssociation(mapId) {
  if (!mapId) return null;
  const { data, error } = await supabase
    .from("directory_map_associations")
    .select("map_id, directory_id, created_at")
    .eq("map_id", mapId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Makes mapId read its pins live from directoryId instead of its own listings. */
export async function attachDirectoryToMap(mapId, directoryId) {
  const { data, error } = await supabase.rpc("attach_directory_to_map", {
    p_map_id: mapId,
    p_directory_id: directoryId,
  });
  if (error) throw error;
  return data;
}

/** Reverts mapId to self-authored mode (Manual entry / Upload CSV / Sync data). */
export async function detachDirectoryFromMap(mapId) {
  const { error } = await supabase.rpc("detach_directory_from_map", { p_map_id: mapId });
  if (error) throw error;
}

// ---- Member-level per-directory permissions (contact_directory_permissions) ----

/**
 * The current contact's explicit grant for this directory, or null if none
 * exists. Owner/Manager/is_primary contacts should be checked with
 * canManageOrg() first — this only covers the Member-level explicit-grant
 * path (peer of contact_map_permissions).
 */
export async function getContactDirectoryPermission(contactId, directoryId) {
  if (!contactId || !directoryId) return null;
  const { data, error } = await supabase
    .from("contact_directory_permissions")
    .select("contact_id, directory_id, can_edit_entries")
    .eq("contact_id", contactId)
    .eq("directory_id", directoryId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

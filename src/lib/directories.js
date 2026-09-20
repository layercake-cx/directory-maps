/**
 * Directories — shared data access.
 *
 * Directory is the peer of Map; directory_entries is the peer of listings
 * (docs/DIRECTORIES.md, epic DIR-E1). See 20260714120000_create_directories.sql
 * for the schema. SEO/branding/categorisation columns land with later epics
 * (DIR-E2/E3/E5) — this module only covers core CRUD.
 */

import { supabase, invokeFunction } from "./supabase";
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

const DIRECTORY_COLUMNS =
  "id, client_id, name, slug, description, is_active, seo_defaults_json, seo_og_image_url, theme_json, current_publication_id, published_at, created_at, updated_at, ai_content_prompt, ai_content_generation_status, ai_content_generation_started_at, ai_content_generated_at, ai_content_generation_error, ai_content_generation_total, ai_content_generation_processed, ai_search_prompt, ai_search_web_enabled, home_nav_label, analytics_json";

/**
 * Schema-drift fallback: a DB migration and a frontend deploy are two
 * independent, non-atomic releases (frontend deploys automatically on merge
 * to main; migrations need a separate explicit apply per environment — see
 * AGENTS.md), so newer frontend code can briefly run against an older
 * schema in some environment. Drops whichever newer column set the error
 * names and retries, rather than breaking the whole directory page.
 */
export async function getDirectory(directoryId) {
  if (!directoryId) return null;
  let columns = DIRECTORY_COLUMNS;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase.from("directories").select(columns).eq("id", directoryId).single();
    if (!error) return data;
    const msg = String(error.message || "");
    if (msg.includes("seo_og_image_url") && columns.includes("seo_og_image_url")) {
      columns = columns.replace(", seo_og_image_url", "");
      continue;
    }
    if (msg.includes("ai_content_") && columns.includes("ai_content_prompt")) {
      columns = columns.replace(
        ", ai_content_prompt, ai_content_generation_status, ai_content_generation_started_at, ai_content_generated_at, ai_content_generation_error, ai_content_generation_total, ai_content_generation_processed",
        "",
      );
      continue;
    }
    if (msg.includes("ai_search_") && columns.includes("ai_search_prompt")) {
      columns = columns.replace(", ai_search_prompt, ai_search_web_enabled", "");
      continue;
    }
    if (msg.includes("home_nav_label") && columns.includes("home_nav_label")) {
      columns = columns.replace(", home_nav_label", "");
      continue;
    }
    if (msg.includes("analytics_json") && columns.includes("analytics_json")) {
      columns = columns.replace(", analytics_json", "");
      continue;
    }
    throw error;
  }
  throw new Error("getDirectory: exhausted schema-drift fallback attempts");
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

/**
 * Full column set needed by the CSV export (DIR-E1-S7) and by CSV import's
 * slug-preservation lookup — kept separate from listDirectoryEntries's
 * (narrower) admin-table column set rather than widening that query's
 * payload for a view that doesn't need these fields.
 */
const ENTRY_EXPORT_COLUMNS =
  "id, directory_id, directory_group_id, name, address, postcode, country, city, lat, lng, website_url, email, phone, logo_url, notes_html, allow_html, is_active, show_phone, show_email, show_website, show_address, slug, meta_title, meta_description, noindex, structured_data_type, sitemap_priority, og_title, og_description, og_image_url, canonical_url, keywords, twitter_card_type, panel_image_url, panel_background_color";

/** Fetches every entry in a directory (not paginated) — for CSV export and for the import's slug-preservation lookup. */
export async function listAllDirectoryEntries(directoryId) {
  if (!directoryId) return [];
  const pageSize = 500;
  const all = [];
  for (let page = 0; ; page++) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await supabase
      .from("directory_entries")
      .select(ENTRY_EXPORT_COLUMNS, { count: "exact" })
      .eq("directory_id", directoryId)
      .order("name", { ascending: true })
      .range(from, to);
    if (error) throw error;
    all.push(...(data ?? []));
    if (all.length >= (count ?? 0) || (data ?? []).length < pageSize) break;
  }
  return all;
}

export async function getDirectoryEntry(entryId) {
  if (!entryId) return null;
  const { data, error } = await supabase
    .from("directory_entries")
    .select(
      "id, directory_id, directory_group_id, name, address, postcode, country, city, lat, lng, website_url, email, phone, logo_url, notes_html, allow_html, is_active, source, show_phone, show_email, show_website, show_address, slug, meta_title, meta_description, noindex, structured_data_type, sitemap_priority, og_title, og_description, og_image_url, twitter_card_type, canonical_url, keywords, ai_summary, panel_image_url, panel_background_color, ai_content_generated_at, seo_metadata_ai_generated_at, created_at, updated_at",
    )
    .eq("id", entryId)
    .single();
  // Schema-drift fallback — see getDirectory() above.
  if (error && (String(error.message || "").includes("ai_content_generated_at") || String(error.message || "").includes("seo_metadata_ai_generated_at"))) {
    const { data: fallback, error: fallbackErr } = await supabase
      .from("directory_entries")
      .select(
        "id, directory_id, directory_group_id, name, address, postcode, country, city, lat, lng, website_url, email, phone, logo_url, notes_html, allow_html, is_active, source, show_phone, show_email, show_website, show_address, slug, meta_title, meta_description, noindex, structured_data_type, sitemap_priority, og_title, og_description, og_image_url, twitter_card_type, canonical_url, keywords, ai_summary, panel_image_url, panel_background_color, created_at, updated_at",
      )
      .eq("id", entryId)
      .single();
    if (fallbackErr) throw fallbackErr;
    return fallback;
  }
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
    geocode_status: entry.geocode_status ?? null,
    geocoded_at: entry.geocoded_at ?? null,
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
  // A manual save overwrites whatever AI generated, so it's no longer "still AI, never hand-edited".
  if ("notes_html" in clean && !("ai_content_generated_at" in clean)) clean.ai_content_generated_at = null;
  const { error } = await supabase.from("directory_entries").update(clean).eq("id", entryId);
  if (error) throw error;
  if ("notes_html" in clean) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("directory_entry_versions").insert({
      entry_id: entryId,
      notes_html: clean.notes_html,
      source: "manual",
      actor_user_id: user?.id ?? null,
    });
  }
}

// ---- AI content generation (DIR-E-AI) ----

/** Whether this directory has a non-blank ai_content_prompt — gates the entry editor's "Generate with AI" button. */
export async function isDirectoryAiContentEnabled(directoryId) {
  if (!directoryId) return false;
  const { data, error } = await supabase
    .from("directories")
    .select("ai_content_prompt")
    .eq("id", directoryId)
    .maybeSingle();
  if (error) throw error;
  return !!data?.ai_content_prompt?.trim();
}

/** Synchronous single-entry generation — invoked by the "Generate with AI" button. */
export async function generateEntryContent(entryId) {
  const { data, error } = await invokeFunction("generate_entry_content", { body: { entry_id: entryId } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

/**
 * Drafts SEO/social metadata (meta_title, meta_description, keywords,
 * og_title, og_description, ai_summary) for one entry. Never persisted by
 * the Edge Function — the caller lands the result in its own (unsaved) form
 * state, same review-before-publish rule as generateEntryContent's output
 * gets on the Content tab.
 */
export async function generateEntrySeoMetadata(entryId) {
  const { data, error } = await invokeFunction("generate_entry_seo_metadata", { body: { entry_id: entryId } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

/** Drafts a directory's homepage meta_title_template/meta_description from its own entry count/categorisations. Not persisted by the Edge Function. */
export async function generateDirectorySeoMetadata(directoryId) {
  const { data, error } = await invokeFunction("generate_directory_seo_metadata", { body: { directory_id: directoryId } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

/** Queues a content-generation job for every active entry in the directory. Backs the type-to-confirm "Generate all entry content" action. */
export async function triggerDirectoryAiContentBulkRun(directoryId) {
  const { data, error } = await supabase.rpc("enqueue_directory_entry_content_jobs", { p_directory_id: directoryId });
  if (error) throw error;
  return data?.[0]?.queued_count ?? 0;
}

/** Persistent bulk-run status, for the poll loop while a "Generate all" run is in progress. */
export async function getDirectoryAiContentStatus(directoryId) {
  const { data, error } = await supabase
    .from("directories")
    .select("ai_content_generation_status, ai_content_generation_started_at, ai_content_generated_at, ai_content_generation_error, ai_content_generation_total, ai_content_generation_processed")
    .eq("id", directoryId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ---- SEO metadata backfill queue (Directory Searchability & AI Metadata plan, Phase 3b) ----

/** Count of active entries missing at least one of the six drafted SEO/social fields — backs the AI tab's "N entries missing metadata" readout. */
export async function countEntriesMissingSeoMetadata(directoryId) {
  if (!directoryId) return 0;
  const { data, error } = await supabase.rpc("count_entries_missing_seo_metadata", { p_directory_id: directoryId });
  if (error) throw error;
  return data ?? 0;
}

/** Queues a 'bulk' SEO metadata job for every active entry still missing a field — never entries that already have everything, so this can't overwrite existing data. Backs the AI tab's "Backfill missing metadata" action. */
export async function triggerDirectorySeoMetadataBackfill(directoryId) {
  const { data, error } = await supabase.rpc("enqueue_directory_entry_seo_metadata_jobs", { p_directory_id: directoryId });
  if (error) throw error;
  return data?.[0]?.queued_count ?? 0;
}

/** Persistent bulk-run status, for the poll loop while a "Backfill missing metadata" run is in progress. */
export async function getDirectorySeoMetadataBackfillStatus(directoryId) {
  const { data, error } = await supabase
    .from("directories")
    .select("seo_metadata_backfill_status, seo_metadata_backfill_started_at, seo_metadata_backfill_completed_at, seo_metadata_backfill_error, seo_metadata_backfill_total, seo_metadata_backfill_processed")
    .eq("id", directoryId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Version history for one entry's body content, most recent first. */
export async function listEntryContentVersions(entryId) {
  if (!entryId) return [];
  const { data, error } = await supabase
    .from("directory_entry_versions")
    .select("id, entry_id, notes_html, source, actor_user_id, created_at")
    .eq("entry_id", entryId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function deleteDirectoryEntry(entryId) {
  const { error } = await supabase.from("directory_entries").delete().eq("id", entryId);
  if (error) throw error;
}

/** Deletes every entry in a directory — used by the CSV import "replace all" mode. */
export async function deleteAllDirectoryEntries(directoryId) {
  const { error } = await supabase.from("directory_entries").delete().eq("directory_id", directoryId);
  if (error) throw error;
}

/**
 * Queues geocoding (in the background) for every active entry in this directory
 * missing lat/lng. Peer of listings' geocode_listings flow — see the
 * geocode_directory_entries Edge Function. Returns the number of rows queued.
 */
export async function geocodeDirectoryEntries(directoryId) {
  const { data, error } = await invokeFunction("geocode_directory_entries", { body: { directoryId } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.queued ?? 0;
}

/**
 * Single-address lookup via the shared geocode_address Edge Function (no
 * directory/map scoping — any authenticated user may resolve an address).
 * Used to auto-geocode an entry synchronously as it's saved, so the entry
 * editor's "coordinates are auto-geocoded" promise (EntryBasicInfoTab) is
 * actually true instead of silently leaving lat/lng null.
 */
export async function geocodeAddress(address) {
  const trimmed = String(address || "").trim();
  if (!trimmed) return { ok: false, status: "NO_ADDRESS", lat: null, lng: null };
  const { data, error } = await invokeFunction("geocode_address", { body: { address: trimmed } });
  if (error) return { ok: false, status: "ERROR", lat: null, lng: null };
  return {
    ok: !!data?.ok,
    status: data?.status || "ERROR",
    lat: data?.lat ?? null,
    lng: data?.lng ?? null,
  };
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

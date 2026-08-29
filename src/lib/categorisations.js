/**
 * Categorisations — shared data access.
 *
 * Reusable, client-wide taxonomies that can be applied to directories
 * and/or directory entries (docs/DIRECTORIES.md, epic DIR-E5). Additive
 * alongside directory_groups (the simple, per-directory, single-value
 * grouping) — never a replacement for it.
 *
 * Tables (see 20260714130000_create_categorisations.sql):
 *   - categorisations           taxonomy definitions per client
 *   - category_terms            term list per categorisation
 *   - directory_category_terms  tags on a whole directory
 *   - entry_category_terms      tags on a directory entry
 */

import { supabase } from "./supabase";

export const APPLIES_TO_OPTIONS = [
  { id: "entry", label: "Directory entries" },
  { id: "directory", label: "Whole directories" },
  { id: "both", label: "Both" },
];

export function appliesToLabel(id) {
  return APPLIES_TO_OPTIONS.find((o) => o.id === id)?.label ?? id;
}

/** Does a categorisation with this applies_to show up when tagging an entry? */
export function appliesToEntries(appliesTo) {
  return appliesTo === "entry" || appliesTo === "both";
}

/** Does a categorisation with this applies_to show up when tagging a directory? */
export function appliesToDirectories(appliesTo) {
  return appliesTo === "directory" || appliesTo === "both";
}

/**
 * Does this categorisation show up when tagging a map listing? Independent
 * of applies_to (which only covers directory/entry) — see
 * categorisations.applies_to_listings (20260829020000_create_listing_category_terms.sql).
 */
export function appliesToListings(categorisation) {
  return !!categorisation?.applies_to_listings;
}

/** URL/import-safe slug from a human label (matches filterFields.js's slugifyKey). */
export function slugify(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function sortTerms(a, b) {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.label || "").localeCompare(String(b.label || ""));
}

/** Load all categorisations (with their terms) for a client, ordered by label. */
export async function listCategorisations(clientId, { includeArchived = false } = {}) {
  if (!clientId) return [];

  let query = supabase
    .from("categorisations")
    .select("id, client_id, key, label, applies_to, applies_to_listings, is_active, created_at, updated_at")
    .eq("client_id", clientId)
    .order("label", { ascending: true });
  if (!includeArchived) query = query.eq("is_active", true);

  const { data: cats, error: catsErr } = await query;
  if (catsErr) throw catsErr;
  const catRows = cats ?? [];
  if (catRows.length === 0) return [];

  const ids = catRows.map((c) => c.id);
  const { data: terms, error: termsErr } = await supabase
    .from("category_terms")
    .select("id, categorisation_id, label, slug, sort_order, color")
    .in("categorisation_id", ids)
    .order("sort_order", { ascending: true });
  if (termsErr) throw termsErr;

  const termsByCat = new Map();
  for (const t of terms ?? []) {
    if (!termsByCat.has(t.categorisation_id)) termsByCat.set(t.categorisation_id, []);
    termsByCat.get(t.categorisation_id).push(t);
  }
  return catRows.map((c) => ({
    ...c,
    terms: (termsByCat.get(c.id) ?? []).slice().sort(sortTerms),
  }));
}

/** Create a categorisation plus its initial terms. terms: [{ label, color? }] */
export async function createCategorisation({ clientId, label, key, appliesTo, appliesToListings = false, terms = [] }) {
  const cleanLabel = String(label || "").trim();
  if (!cleanLabel) throw new Error("Label is required.");
  if (!["directory", "entry", "both"].includes(appliesTo)) throw new Error("Invalid applies_to.");

  const { data: cat, error } = await supabase
    .from("categorisations")
    .insert({
      client_id: clientId,
      key: key || slugify(cleanLabel),
      label: cleanLabel,
      applies_to: appliesTo,
      applies_to_listings: !!appliesToListings,
      is_active: true,
    })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("Another categorisation already uses this key.");
    throw error;
  }

  if (terms.length > 0) {
    await replaceCategorisationTerms(cat.id, terms);
  }
  return cat;
}

export async function updateCategorisation(id, patch) {
  const { data, error } = await supabase
    .from("categorisations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function setCategorisationActive(id, isActive) {
  return updateCategorisation(id, { is_active: isActive });
}

/** Permanently delete a categorisation (cascades to terms + all directory/entry tags). */
export async function deleteCategorisationPermanently(id) {
  const { error } = await supabase.from("categorisations").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Replace the full term list for a categorisation, preserving existing term
 * ids (so directory_category_terms/entry_category_terms stay valid) where an
 * id is given. Each term: { id?, label, color?, sort_order? }
 */
export async function replaceCategorisationTerms(categorisationId, terms) {
  const existing = await supabase
    .from("category_terms")
    .select("id, slug")
    .eq("categorisation_id", categorisationId);
  if (existing.error) throw existing.error;
  const existingIds = new Set((existing.data ?? []).map((t) => t.id));
  const keptIds = new Set();

  for (let i = 0; i < terms.length; i += 1) {
    const term = terms[i];
    const label = String(term.label ?? "").trim();
    if (!label) continue;
    if (term.id && existingIds.has(term.id)) {
      keptIds.add(term.id);
      const { error } = await supabase
        .from("category_terms")
        .update({ label, color: term.color || null, sort_order: i })
        .eq("id", term.id);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await supabase
        .from("category_terms")
        .insert({
          categorisation_id: categorisationId,
          label,
          slug: slugify(label),
          color: term.color || null,
          sort_order: i,
        })
        .select("id")
        .single();
      if (error) throw error;
      keptIds.add(inserted.id);
    }
  }

  const toRemove = [...existingIds].filter((id) => !keptIds.has(id));
  if (toRemove.length > 0) {
    const { error } = await supabase.from("category_terms").delete().in("id", toRemove);
    if (error) throw error;
  }
}

/** How many directories + entries currently carry this term (for delete-confirmation usage counts). */
export async function countUsageForTerm(termId) {
  const [{ count: directoryCount, error: dErr }, { count: entryCount, error: eErr }] = await Promise.all([
    supabase.from("directory_category_terms").select("*", { count: "exact", head: true }).eq("term_id", termId),
    supabase.from("entry_category_terms").select("*", { count: "exact", head: true }).eq("term_id", termId),
  ]);
  if (dErr) throw dErr;
  if (eErr) throw eErr;
  return (directoryCount ?? 0) + (entryCount ?? 0);
}

// ---- Tagging: directory entries ----

export async function loadEntryTermIds(entryId) {
  if (!entryId) return [];
  const { data, error } = await supabase
    .from("entry_category_terms")
    .select("term_id")
    .eq("entry_id", entryId);
  if (error) throw error;
  return (data ?? []).map((r) => r.term_id);
}

/**
 * Bulk-apply term(s) from one categorisation to many entries at once — DIR-E1-S4.
 * mode "add" leaves each entry's existing tags (for this categorisation and others)
 * untouched and adds the given terms; mode "replace" clears only this categorisation's
 * existing terms on the selected entries first (other categorisations' tags on the
 * same entries are unaffected), mirroring applyBulkFilterValue's add-vs-replace shape.
 */
export async function applyBulkEntryTerms({ entryIds, categorisationId, termIds, mode = "add" }) {
  const ids = [...new Set((entryIds || []).filter(Boolean))];
  if (ids.length === 0) return 0;
  const terms = [...new Set((termIds || []).filter(Boolean))];

  if (mode === "replace") {
    const { data: catTerms, error: ctErr } = await supabase
      .from("category_terms")
      .select("id")
      .eq("categorisation_id", categorisationId);
    if (ctErr) throw ctErr;
    const catTermIds = (catTerms ?? []).map((t) => t.id);
    if (catTermIds.length) {
      const { error: delErr } = await supabase
        .from("entry_category_terms")
        .delete()
        .in("entry_id", ids)
        .in("term_id", catTermIds);
      if (delErr) throw delErr;
    }
  }

  const rows = [];
  for (const entryId of ids) {
    for (const termId of terms) rows.push({ entry_id: entryId, term_id: termId });
  }
  if (rows.length === 0) return ids.length;
  const { error } = await supabase
    .from("entry_category_terms")
    .upsert(rows, { onConflict: "entry_id,term_id", ignoreDuplicates: true });
  if (error) throw error;
  return ids.length;
}

/** Replace all term tags for an entry with exactly termIds. */
export async function setEntryTerms(entryId, termIds) {
  const { error: delErr } = await supabase.from("entry_category_terms").delete().eq("entry_id", entryId);
  if (delErr) throw delErr;
  if (termIds.length === 0) return;
  const { error: insErr } = await supabase
    .from("entry_category_terms")
    .insert(termIds.map((term_id) => ({ entry_id: entryId, term_id })));
  if (insErr) throw insErr;
}

// ---- Tagging: whole directories ----

export async function loadDirectoryTermIds(directoryId) {
  if (!directoryId) return [];
  const { data, error } = await supabase
    .from("directory_category_terms")
    .select("term_id")
    .eq("directory_id", directoryId);
  if (error) throw error;
  return (data ?? []).map((r) => r.term_id);
}

/** Replace all term tags for a directory with exactly termIds. */
export async function setDirectoryTerms(directoryId, termIds) {
  const { error: delErr } = await supabase.from("directory_category_terms").delete().eq("directory_id", directoryId);
  if (delErr) throw delErr;
  if (termIds.length === 0) return;
  const { error: insErr } = await supabase
    .from("directory_category_terms")
    .insert(termIds.map((term_id) => ({ directory_id: directoryId, term_id })));
  if (insErr) throw insErr;
}

// ---- Tagging: map listings (20260829020000_create_listing_category_terms.sql) ----
// Direct peer of the entry-tagging functions above, keyed off listing_category_terms.

export async function loadListingTermIds(listingId) {
  if (!listingId) return [];
  const { data, error } = await supabase
    .from("listing_category_terms")
    .select("term_id")
    .eq("listing_id", listingId);
  if (error) throw error;
  return (data ?? []).map((r) => r.term_id);
}

/** Replace all term tags for a listing with exactly termIds. */
export async function setListingTerms(listingId, termIds) {
  const { error: delErr } = await supabase.from("listing_category_terms").delete().eq("listing_id", listingId);
  if (delErr) throw delErr;
  if (termIds.length === 0) return;
  const { error: insErr } = await supabase
    .from("listing_category_terms")
    .insert(termIds.map((term_id) => ({ listing_id: listingId, term_id })));
  if (insErr) throw insErr;
}

/**
 * Bulk-apply term(s) from one categorisation to many listings at once —
 * mirrors applyBulkEntryTerms's add-vs-replace shape exactly.
 */
export async function applyBulkListingTerms({ listingIds, categorisationId, termIds, mode = "add" }) {
  const ids = [...new Set((listingIds || []).filter(Boolean))];
  if (ids.length === 0) return 0;
  const terms = [...new Set((termIds || []).filter(Boolean))];

  if (mode === "replace") {
    const { data: catTerms, error: ctErr } = await supabase
      .from("category_terms")
      .select("id")
      .eq("categorisation_id", categorisationId);
    if (ctErr) throw ctErr;
    const catTermIds = (catTerms ?? []).map((t) => t.id);
    if (catTermIds.length) {
      const { error: delErr } = await supabase
        .from("listing_category_terms")
        .delete()
        .in("listing_id", ids)
        .in("term_id", catTermIds);
      if (delErr) throw delErr;
    }
  }

  const rows = [];
  for (const listingId of ids) {
    for (const termId of terms) rows.push({ listing_id: listingId, term_id: termId });
  }
  if (rows.length === 0) return ids.length;
  const { error } = await supabase
    .from("listing_category_terms")
    .upsert(rows, { onConflict: "listing_id,term_id", ignoreDuplicates: true });
  if (error) throw error;
  return ids.length;
}

// ---- CSV import: attach map listings to categories ----
// Mirrors DirectoryEntriesPanel.jsx's doImport category_<key> resolution
// exactly, retargeted at listings/listing_category_terms. Unknown tokens are
// reported as warnings, not auto-created — a new taxonomy term is a category
// management change, not a side effect of a data import.

/** The CSV/Sheet column name for a categorisation (matches DirectoryEntriesPanel.jsx). */
export function categoryColumnName(key) {
  return `category_${key}`;
}

/**
 * Resolve category_<key> cells from imported rows into termIds per listing,
 * for listing-applicable (applies_to_listings) categorisations only.
 * @param {object[]} rows        row objects keyed by lowercased header
 * @param {string[]} listingIds  parallel array of resolved listing ids (same order as rows)
 * @param {object[]} categorisations  categorisations with their terms loaded (listCategorisations())
 * @returns {{ termsByListing: Map<string, string[]>, warnings: string[] }}
 */
export function resolveImportedListingTerms({ rows, listingIds, categorisations }) {
  const listable = (categorisations || []).filter((c) => appliesToListings(c));
  const termsByListing = new Map();
  const warnings = [];
  if (listable.length === 0) return { termsByListing, warnings };

  const lookupByCat = new Map();
  for (const cat of listable) {
    const m = new Map();
    for (const t of cat.terms || []) {
      if (t.slug) m.set(String(t.slug).toLowerCase(), t.id);
      if (t.label) m.set(String(t.label).toLowerCase(), t.id);
    }
    lookupByCat.set(cat.id, m);
  }

  (rows || []).forEach((r, idx) => {
    const listingId = listingIds[idx];
    if (!listingId) return;
    const rowNum = idx + 2;
    const termIds = [];
    for (const cat of listable) {
      const raw = String(r[categoryColumnName(cat.key)] ?? "").trim();
      if (!raw) continue;
      const lookup = lookupByCat.get(cat.id);
      raw.split("|").map((s) => s.trim()).filter(Boolean).forEach((token) => {
        const termId = lookup?.get(token.toLowerCase());
        if (termId) termIds.push(termId);
        else warnings.push(`Row ${rowNum}: unknown ${cat.label} term "${token}"`);
      });
    }
    if (termIds.length) termsByListing.set(listingId, termIds);
  });

  return { termsByListing, warnings };
}

/** Apply resolved import terms — replace-mode per listing (matches setListingTerms). */
export async function applyImportedListingTerms(termsByListing) {
  for (const [listingId, termIds] of termsByListing) {
    await setListingTerms(listingId, termIds);
  }
}

// ---- Unified filter-bar adapter (maps <-> categorisations) ----
//
// Normalizes categorisations/category_terms into the same shape
// filterFieldsForPublication() (src/lib/filterFields.js) produces for
// map_filter_fields, so PublishedMapView.jsx's existing filter-bar
// rendering and effectiveListings filtering logic can drive off either
// source unmodified. A categorisation's id stands in for a map_filter_fields
// row's id (`field_id` in the values-by-record map); a category_terms id
// stands in for a map_filter_field_options id (`option_id`). Categorisations
// have no free-text field_type equivalent — this adapter only ever produces
// multi_select fields.

/** Shape active categorisations (with their terms) into filterFields entries. */
export function categorisationsAsFilterFields(categorisations) {
  return (categorisations || [])
    .filter((c) => c.is_active)
    .map((c) => ({
      id: c.id,
      key: c.key,
      label: c.label,
      field_type: "multi_select",
      display_control: "multi_select",
      show_in_filter_bar: true,
      sort_order: 0,
      options: (c.terms || []).map((t) => ({
        id: t.id,
        value: t.slug,
        label: t.label,
        color: t.color ?? null,
        sort_order: t.sort_order ?? 0,
      })),
    }));
}

/**
 * Load a client's entry-applicable categorisations, shaped as
 * PublishedMapView-compatible filterFields, plus per-entry tag values for
 * the given entry ids (pass ids you already have — e.g. from a
 * public_directory_entries fetch — to avoid a redundant query).
 * @returns {Promise<{ filterFields: object[], valuesByRecord: Record<string, object[]> }>}
 */
export async function loadCategorisationFiltersForEntries(clientId, entryIds) {
  const cats = (await listCategorisations(clientId)).filter((c) => appliesToEntries(c.applies_to));
  const filterFields = categorisationsAsFilterFields(cats);
  const ids = [...new Set((entryIds || []).filter(Boolean))];
  if (filterFields.length === 0 || ids.length === 0) return { filterFields, valuesByRecord: {} };

  const termToField = new Map();
  for (const c of cats) for (const t of c.terms || []) termToField.set(t.id, c.id);

  const { data, error } = await supabase
    .from("entry_category_terms")
    .select("entry_id, term_id")
    .in("entry_id", ids);
  if (error) throw error;

  const valuesByRecord = {};
  for (const row of data ?? []) {
    const fieldId = termToField.get(row.term_id);
    if (!fieldId) continue;
    if (!valuesByRecord[row.entry_id]) valuesByRecord[row.entry_id] = [];
    valuesByRecord[row.entry_id].push({ field_id: fieldId, option_id: row.term_id, value_text: null });
  }
  return { filterFields, valuesByRecord };
}

/** Same shape as loadCategorisationFiltersForEntries, for map listings (applies_to_listings categorisations). */
export async function loadCategorisationFiltersForListings(clientId, listingIds) {
  const cats = (await listCategorisations(clientId)).filter((c) => appliesToListings(c));
  const filterFields = categorisationsAsFilterFields(cats);
  const ids = [...new Set((listingIds || []).filter(Boolean))];
  if (filterFields.length === 0 || ids.length === 0) return { filterFields, valuesByRecord: {} };

  const termToField = new Map();
  for (const c of cats) for (const t of c.terms || []) termToField.set(t.id, c.id);

  const { data, error } = await supabase
    .from("listing_category_terms")
    .select("listing_id, term_id")
    .in("listing_id", ids);
  if (error) throw error;

  const valuesByRecord = {};
  for (const row of data ?? []) {
    const fieldId = termToField.get(row.term_id);
    if (!fieldId) continue;
    if (!valuesByRecord[row.listing_id]) valuesByRecord[row.listing_id] = [];
    valuesByRecord[row.listing_id].push({ field_id: fieldId, option_id: row.term_id, value_text: null });
  }
  return { filterFields, valuesByRecord };
}

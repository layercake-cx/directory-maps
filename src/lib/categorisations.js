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
    .select("id, client_id, key, label, applies_to, is_active, created_at, updated_at")
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
export async function createCategorisation({ clientId, label, key, appliesTo, terms = [] }) {
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

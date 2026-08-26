/**
 * Accreditations (build-scope §5.7) — a directory defines schemes
 * (directory_accreditation_schemes); entries hold them (entry_accreditations).
 * See 20260826120000_create_directory_entry_extras.sql for the schema.
 */

import { supabase } from "./supabase";

// ---- Scheme definitions (directory-scoped) ----

export async function listAccreditationSchemes(directoryId, { includeArchived = false } = {}) {
  if (!directoryId) return [];
  let query = supabase
    .from("directory_accreditation_schemes")
    .select("id, directory_id, name, issuing_body, badge_image_url, description, verification_note, is_active, sort_order")
    .eq("directory_id", directoryId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (!includeArchived) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createAccreditationScheme(directoryId, scheme) {
  const name = String(scheme?.name || "").trim();
  if (!name) throw new Error("Scheme name is required.");
  const { data, error } = await supabase
    .from("directory_accreditation_schemes")
    .insert({
      directory_id: directoryId,
      name,
      issuing_body: scheme.issuing_body?.trim() || null,
      badge_image_url: scheme.badge_image_url?.trim() || null,
      description: scheme.description?.trim() || null,
      verification_note: scheme.verification_note?.trim() || null,
    })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("A scheme with this name already exists for this directory.");
    throw error;
  }
  return data;
}

export async function updateAccreditationScheme(id, patch) {
  const { data, error } = await supabase
    .from("directory_accreditation_schemes")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function setAccreditationSchemeActive(id, isActive) {
  return updateAccreditationScheme(id, { is_active: !!isActive });
}

export async function deleteAccreditationSchemePermanently(id) {
  const { error } = await supabase.from("directory_accreditation_schemes").delete().eq("id", id);
  if (error) throw error;
}

// ---- Tagging: which schemes an entry holds ----

export async function loadEntryAccreditationSchemeIds(entryId) {
  if (!entryId) return [];
  const { data, error } = await supabase.from("entry_accreditations").select("scheme_id").eq("entry_id", entryId);
  if (error) throw error;
  return (data ?? []).map((r) => r.scheme_id);
}

export async function grantEntryAccreditation(entryId, schemeId) {
  const { error } = await supabase.from("entry_accreditations").insert({ entry_id: entryId, scheme_id: schemeId });
  if (error) throw error;
}

export async function revokeEntryAccreditation(entryId, schemeId) {
  const { error } = await supabase.from("entry_accreditations").delete().eq("entry_id", entryId).eq("scheme_id", schemeId);
  if (error) throw error;
}

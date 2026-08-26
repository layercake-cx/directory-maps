/**
 * Media assets — gallery/hero images for a directory entry (build-scope §5.6).
 * See 20260826120000_create_directory_entry_extras.sql for the schema and
 * 20260826121000_create_directory_media_storage_bucket.sql for the
 * "directory-media" Storage bucket these upload into.
 */

import { supabase } from "./supabase";

const ALLOWED_EXT = /\.(png|jpe?g|webp)$/i;
const MAX_BYTES = 5 * 1024 * 1024;

export async function listMediaAssets(entryId) {
  if (!entryId) return [];
  const { data, error } = await supabase
    .from("entry_media_assets")
    .select("id, entry_id, url, alt_text, credit, caption, is_hero, sort_order, created_at")
    .eq("entry_id", entryId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Validates and uploads a File to the directory-media bucket, then inserts
 * the entry_media_assets row. Mirrors AdminMapData.jsx's handleListingLogoFile
 * validation shape (extension allowlist, size cap).
 */
export async function uploadMediaAsset(entryId, file, { altText, caption, credit, isHero } = {}) {
  const cleanAlt = String(altText || "").trim();
  if (!cleanAlt) throw new Error("Alt text is required.");
  const name = (file?.name || "").toLowerCase();
  const extMatch = name.match(ALLOWED_EXT);
  if (!extMatch) throw new Error("Use PNG, JPG or WebP for media images.");
  if (file.size > MAX_BYTES) throw new Error("Image too large (max 5 MB).");

  const ext = extMatch[1] === "jpeg" ? "jpg" : extMatch[1];
  const path = `${entryId}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from("directory-media").upload(path, file);
  if (uploadError) throw uploadError;
  const { data: urlData } = supabase.storage.from("directory-media").getPublicUrl(path);

  if (isHero) await clearHero(entryId);

  const { data, error } = await supabase
    .from("entry_media_assets")
    .insert({
      entry_id: entryId,
      url: `${urlData.publicUrl}?v=${Date.now()}`,
      alt_text: cleanAlt,
      caption: caption?.trim() || null,
      credit: credit?.trim() || null,
      is_hero: !!isHero,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function clearHero(entryId) {
  const { error } = await supabase.from("entry_media_assets").update({ is_hero: false }).eq("entry_id", entryId).eq("is_hero", true);
  if (error) throw error;
}

export async function setHeroMediaAsset(entryId, assetId) {
  await clearHero(entryId);
  const { error } = await supabase.from("entry_media_assets").update({ is_hero: true }).eq("id", assetId);
  if (error) throw error;
}

export async function reorderMediaAssets(orderedIds) {
  await Promise.all(orderedIds.map((id, i) => supabase.from("entry_media_assets").update({ sort_order: i }).eq("id", id)));
}

export async function deleteMediaAsset(id) {
  const { error } = await supabase.from("entry_media_assets").delete().eq("id", id);
  if (error) throw error;
}

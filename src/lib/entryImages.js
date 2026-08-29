/**
 * Directory entry image uploads — logo and panel image, both single,
 * replaceable images per entry, stored in the existing "directory-media"
 * Storage bucket (see 20260826121000_create_directory_media_storage_bucket.sql)
 * at fixed paths so re-uploading overwrites rather than accumulating files.
 * Mirrors AdminMapData.jsx's handleListingLogoFile convention (fixed path +
 * upsert), minus SVG — directory-media's bucket policy only allows
 * PNG/JPEG/WebP (SVG is deliberately map-pins-only).
 */

import { supabase } from "./supabase";

const ALLOWED_EXT = /\.(png|jpe?g|webp)$/i;
const MAX_BYTES = 2 * 1024 * 1024;

async function uploadEntryImage(entryId, file, fixedName) {
  const name = (file?.name || "").toLowerCase();
  const extMatch = name.match(ALLOWED_EXT);
  if (!extMatch) throw new Error("Use PNG, JPG or WebP.");
  if (file.size > MAX_BYTES) throw new Error("Image too large (max 2 MB).");

  const ext = extMatch[1] === "jpeg" ? "jpg" : extMatch[1];
  const path = `${entryId}/${fixedName}.${ext}`;
  const { error: uploadError } = await supabase.storage.from("directory-media").upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;
  const { data: urlData } = supabase.storage.from("directory-media").getPublicUrl(path);
  return `${urlData.publicUrl}?v=${Date.now()}`;
}

/** Uploads a logo file for entryId and returns its cache-busted public URL. Does not write directory_entries.logo_url itself — callers persist that. */
export async function uploadEntryLogo(entryId, file) {
  return uploadEntryImage(entryId, file, "logo");
}

/** Uploads a homepage-card panel image for entryId. Does not write directory_entries.panel_image_url itself — callers persist that. */
export async function uploadEntryPanelImage(entryId, file) {
  return uploadEntryImage(entryId, file, "panel");
}

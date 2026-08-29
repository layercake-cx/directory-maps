/**
 * Directory entry logo upload — a single, replaceable image per entry,
 * stored in the existing "directory-media" Storage bucket (see
 * 20260826121000_create_directory_media_storage_bucket.sql) at a fixed
 * path so re-uploading overwrites rather than accumulating files. Mirrors
 * AdminMapData.jsx's handleListingLogoFile convention (fixed path + upsert),
 * minus SVG — directory-media's bucket policy only allows PNG/JPEG/WebP
 * (SVG is deliberately map-pins-only).
 */

import { supabase } from "./supabase";

const ALLOWED_EXT = /\.(png|jpe?g|webp)$/i;
const MAX_BYTES = 2 * 1024 * 1024;

/** Uploads a logo file for entryId and returns its cache-busted public URL. Does not write directory_entries.logo_url itself — callers persist that. */
export async function uploadEntryLogo(entryId, file) {
  const name = (file?.name || "").toLowerCase();
  const extMatch = name.match(ALLOWED_EXT);
  if (!extMatch) throw new Error("Use PNG, JPG or WebP for the logo.");
  if (file.size > MAX_BYTES) throw new Error("Logo too large (max 2 MB).");

  const ext = extMatch[1] === "jpeg" ? "jpg" : extMatch[1];
  const path = `${entryId}/logo.${ext}`;
  const { error: uploadError } = await supabase.storage.from("directory-media").upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;
  const { data: urlData } = supabase.storage.from("directory-media").getPublicUrl(path);
  return `${urlData.publicUrl}?v=${Date.now()}`;
}

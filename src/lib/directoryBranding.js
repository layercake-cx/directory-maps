/**
 * Directory branding logo upload — a single, replaceable image per
 * directory, stored in the existing "directory-media" Storage bucket (see
 * 20260826121000_create_directory_media_storage_bucket.sql). Mirrors
 * entryImages.js's uploadEntryImage() convention (fixed path + upsert,
 * PNG/JPEG/WebP only). SVG is deliberately not supported — the
 * directory-media bucket's policy only allows PNG/JPEG/WebP (SVG is
 * map-pins-only, per entryImages.js's own comment), and this doesn't
 * change that: widening a bucket's allowed types is a deliberate
 * decision for someone to make explicitly, not a side effect of adding
 * a logo upload button.
 */

import { supabase } from "./supabase";

const ALLOWED_EXT = /\.(png|jpe?g|webp)$/i;
const MAX_BYTES = 2 * 1024 * 1024;

/** Uploads a logo file for directoryId and returns its cache-busted public URL. Does not write theme_json itself — callers persist that. */
export async function uploadDirectoryLogo(directoryId, file) {
  const name = (file?.name || "").toLowerCase();
  const extMatch = name.match(ALLOWED_EXT);
  if (!extMatch) throw new Error("Use PNG, JPG or WebP.");
  if (file.size > MAX_BYTES) throw new Error("Image too large (max 2 MB).");

  const ext = extMatch[1] === "jpeg" ? "jpg" : extMatch[1];
  const path = `${directoryId}/logo.${ext}`;
  const { error: uploadError } = await supabase.storage.from("directory-media").upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;
  const { data: urlData } = supabase.storage.from("directory-media").getPublicUrl(path);
  return `${urlData.publicUrl}?v=${Date.now()}`;
}

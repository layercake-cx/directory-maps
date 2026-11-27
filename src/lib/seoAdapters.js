import { updateDirectoryEntry } from "./directories.js";
import { updateContentPage } from "./contentPages.js";
import { updateClaimedListingSeo } from "./claimManager.js";

/**
 * Which SEO fields a surface may edit and how they are saved. The focused editor treats SEO as part of the draft:
 * values live in the editor until Save draft, which writes only the fields that changed.
 */
export const ENTRY_SEO_FIELDS = new Set(["meta_title", "meta_description", "slug", "og_title", "og_description", "og_image_url", "canonical_url", "noindex", "structured_data_type"]);
export const PAGE_SEO_FIELDS = new Set(["meta_title", "meta_description", "slug", "noindex"]);
/** A listing owner edits only the title and description (update_claimed_listing_seo). */
export const CLAIM_SEO_FIELDS = new Set(["meta_title", "meta_description"]);

export function seoValues(record, fields) {
  const v = {};
  for (const f of fields) v[f] = f === "noindex" ? !!record?.[f] : record?.[f] ?? "";
  return v;
}

/** Only what changed, empty strings as null (slug is never emptied). */
export function seoPatch(values, base, fields) {
  const patch = {};
  for (const f of fields) {
    if (values[f] === base[f]) continue;
    patch[f] = f === "noindex" ? !!values[f] : f === "slug" ? values[f] : (values[f] ?? "").trim() || null;
  }
  return patch;
}

export const saveEntrySeo = (id) => (patch) => updateDirectoryEntry(id, patch);
export const savePageSeo = (id) => (patch) => updateContentPage(id, patch);
export const saveClaimSeo = (claimId, current) => (patch) =>
  updateClaimedListingSeo(claimId, {
    metaTitle: "meta_title" in patch ? patch.meta_title : current?.meta_title,
    metaDescription: "meta_description" in patch ? patch.meta_description : current?.meta_description,
  });

import { supabase, invokeFunction } from "./supabase";

/**
 * Focused block editor: Save draft, per-page publish state, the server-rendered preview and the single-page publish.
 * Rules live on the server (save_page_blocks, page_publish_preflight, generate_directory_site scopes
 * preview_item and publish_page); this file only calls them.
 */

async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data;
}

/** SQLSTATE 40001: the page changed since the working copy was loaded. */
export const isStaleSave = (e) => e?.code === "40001" || /changed since you opened it/i.test(e?.message ?? "");

/** Save draft: applies the whole working copy atomically. Returns { page_updated_at }. */
export const savePageBlocks = ({ kind, id, expectedUpdatedAt, blocks, claimId = null }) =>
  rpc("save_page_blocks", { p_page_kind: kind, p_page_id: id, p_expected_updated_at: expectedUpdatedAt, p_blocks: blocks, p_claim_id: claimId });

/** { directory_published, directory_published_at, page_updated_at, has_unpublished_changes } */
export const getPagePublishState = (kind, id, claimId = null) =>
  rpc("get_page_publish_state", { p_page_kind: kind, p_page_id: id, p_claim_id: claimId });

/** [{ block_id, block_type, errors: [{path, message}] }] for every block with a problem (effective content). */
export const validatePageBlocks = (kind, id, claimId = null) =>
  rpc("validate_page_blocks", { p_page_kind: kind, p_page_id: id, p_claim_id: claimId });

/**
 * The page rendered by the real generator from the real data and current theme, with the editor's unsaved blocks.
 * `mode`: "edit" (markers, zones, placeholders) or "preview" (as visitors see it). Nothing is written.
 */
export async function renderPagePreview({ kind, id, blocks, mode = "edit" }) {
  const { data, error } = await invokeFunction("generate_directory_site", { body: { scope: "preview_item", kind, id, blocks, mode } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.html ?? "";
}

/**
 * Publishes exactly this one page. The server checks who is asking, that the directory and page have been published
 * before, that the saved version is the one being published (expectedUpdatedAt) and that every block is valid, then
 * rebuilds only this page. Throws an Error whose message lists the reasons when it refuses.
 */
export async function publishPage({ kind, id, expectedUpdatedAt }) {
  const { data, error } = await invokeFunction("generate_directory_site", {
    body: { scope: "publish_page", kind, id, expected_updated_at: expectedUpdatedAt },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

/**
 * Product tiles (build-scope §5.9) — Viator-style external booking cards on
 * an entry's page. Entered manually here; provider-API import is a later,
 * separate decision (docs/DIRECTORIES.md §11). Never affects ranking.
 * See 20260826120000_create_directory_entry_extras.sql for the schema.
 */

import { supabase } from "./supabase";

const HTTP_URL = /^https?:\/\//i;

export async function listProductTiles(entryId) {
  if (!entryId) return [];
  const { data, error } = await supabase
    .from("product_tiles")
    .select("id, entry_id, title, image_url, price, currency, rating, review_count, provider, destination_url, sort_order")
    .eq("entry_id", entryId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createProductTile(entryId, tile) {
  const title = String(tile?.title || "").trim();
  const destinationUrl = String(tile?.destination_url || "").trim();
  if (!title) throw new Error("Title is required.");
  if (!HTTP_URL.test(destinationUrl)) throw new Error("Destination URL must start with http:// or https://.");
  const { data, error } = await supabase
    .from("product_tiles")
    .insert({
      entry_id: entryId,
      title,
      destination_url: destinationUrl,
      image_url: tile.image_url?.trim() || null,
      price: tile.price === "" || tile.price == null ? null : Number(tile.price),
      currency: tile.currency?.trim() || null,
      rating: tile.rating === "" || tile.rating == null ? null : Number(tile.rating),
      review_count: tile.review_count === "" || tile.review_count == null ? null : Number(tile.review_count),
      provider: tile.provider?.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function reorderProductTiles(orderedIds) {
  await Promise.all(orderedIds.map((id, i) => supabase.from("product_tiles").update({ sort_order: i }).eq("id", id)));
}

export async function deleteProductTile(id) {
  const { error } = await supabase.from("product_tiles").delete().eq("id", id);
  if (error) throw error;
}

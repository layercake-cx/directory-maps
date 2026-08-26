/**
 * Prominent links (build-scope §5.8) — available at directory level
 * (homepage link tiles) and entry level (listing page link tiles). One
 * polymorphic table; callers pass exactly one of { directoryId, entryId }.
 * See 20260826120000_create_directory_entry_extras.sql for the schema.
 */

import { supabase } from "./supabase";

const HTTP_URL = /^https?:\/\//i;

function ownerColumn({ directoryId, entryId }) {
  if (directoryId && entryId) throw new Error("Pass only one of directoryId or entryId.");
  if (directoryId) return { directory_id: directoryId };
  if (entryId) return { entry_id: entryId };
  throw new Error("Pass one of directoryId or entryId.");
}

export async function listProminentLinks(owner) {
  const col = ownerColumn(owner);
  const key = Object.keys(col)[0];
  if (!col[key]) return [];
  const { data, error } = await supabase
    .from("prominent_links")
    .select("id, directory_id, entry_id, label, url, icon, style, open_in_new, tracking, sort_order")
    .eq(key, col[key])
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createProminentLink(owner, link) {
  const label = String(link?.label || "").trim();
  const url = String(link?.url || "").trim();
  if (!label) throw new Error("Label is required.");
  if (!HTTP_URL.test(url)) throw new Error("URL must start with http:// or https://.");
  const { data, error } = await supabase
    .from("prominent_links")
    .insert({
      ...ownerColumn(owner),
      label,
      url,
      icon: link.icon?.trim() || null,
      style: link.style === "primary" ? "primary" : "secondary",
      open_in_new: link.open_in_new !== false,
      tracking: !!link.tracking,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function reorderProminentLinks(orderedIds) {
  await Promise.all(orderedIds.map((id, i) => supabase.from("prominent_links").update({ sort_order: i }).eq("id", id)));
}

export async function deleteProminentLink(id) {
  const { error } = await supabase.from("prominent_links").delete().eq("id", id);
  if (error) throw error;
}

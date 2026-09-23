/**
 * Team members shown publicly on a directory entry (Claimed Directory
 * Listings epic §10/§11). See 20260923130000_create_claims_schema.sql for
 * the schema. RLS (`detm_admin_all`/`detm_own_client`) already covers
 * admin/client-portal access directly -- no RPC needed here, only claim
 * users (a later phase's parallel write path) go through security-definer
 * RPCs, since they have no profiles/contacts row for RLS to key off.
 */

import { supabase } from "./supabase";

export async function listTeamMembers(entryId) {
  if (!entryId) return [];
  const { data, error } = await supabase
    .from("directory_entry_team_members")
    .select("id, directory_item_id, name, role_title, photo_url, bio, sort_order, is_visible, created_at")
    .eq("directory_item_id", entryId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createTeamMember(entryId, member) {
  const name = String(member?.name || "").trim();
  if (!name) throw new Error("Name is required.");
  const { data, error } = await supabase
    .from("directory_entry_team_members")
    .insert({
      directory_item_id: entryId,
      name,
      role_title: member.role_title?.trim() || null,
      photo_url: member.photo_url?.trim() || null,
      bio: member.bio?.trim() || null,
      is_visible: member.is_visible !== false,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTeamMember(id, patch) {
  const { error } = await supabase
    .from("directory_entry_team_members")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteTeamMember(id) {
  const { error } = await supabase.from("directory_entry_team_members").delete().eq("id", id);
  if (error) throw error;
}

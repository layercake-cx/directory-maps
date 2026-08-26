/**
 * Evidence items — per-claim sourcing for a directory entry (build-scope §5.5).
 * See 20260826120000_create_directory_entry_extras.sql for the schema.
 */

import { supabase } from "./supabase";

export const CONFIDENCE_OPTIONS = [
  { value: "verified", label: "Verified" },
  { value: "unverified", label: "Unverified" },
  { value: "disputed", label: "Disputed" },
];

export async function listEvidenceItems(entryId) {
  if (!entryId) return [];
  const { data, error } = await supabase
    .from("entry_evidence_items")
    .select("id, entry_id, claim, value, source_url, checked_at, confidence, note, sort_order, created_at")
    .eq("entry_id", entryId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createEvidenceItem(entryId, item) {
  const claim = String(item?.claim || "").trim();
  if (!claim) throw new Error("Claim is required.");
  const { data, error } = await supabase
    .from("entry_evidence_items")
    .insert({
      entry_id: entryId,
      claim,
      value: item.value?.trim() || null,
      source_url: item.source_url?.trim() || null,
      checked_at: item.checked_at || null,
      confidence: item.confidence || null,
      note: item.note?.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteEvidenceItem(id) {
  const { error } = await supabase.from("entry_evidence_items").delete().eq("id", id);
  if (error) throw error;
}

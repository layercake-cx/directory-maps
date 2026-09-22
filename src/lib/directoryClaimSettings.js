import { supabase } from "./supabase";
import { sanitizeNotesHtml } from "./sanitizeHtml.js";

/**
 * Claimed Directory Listings epic — per-directory claim configuration
 * (supabase/migrations/20260923130000_create_claims_schema.sql). One row
 * per directory, created on first save (no row = claiming has never been
 * configured, treated the same as "disabled" everywhere this is read).
 */

const DEFAULT_SETTINGS = {
  directory_id: null,
  enabled: false,
  price_cents: null,
  currency: "GBP",
  payment_type: null,
  payment_provider: "stripe",
  intro_html: "",
};

/** @returns {Promise<typeof DEFAULT_SETTINGS>} defaults (not null) when no row exists yet. */
export async function getDirectoryClaimSettings(directoryId) {
  if (!directoryId) return { ...DEFAULT_SETTINGS };
  const { data, error } = await supabase
    .from("directory_claim_settings")
    .select("directory_id, enabled, price_cents, currency, payment_type, payment_provider, intro_html")
    .eq("directory_id", directoryId)
    .maybeSingle();
  if (error) throw error;
  return data ?? { ...DEFAULT_SETTINGS, directory_id: directoryId };
}

/**
 * Upserts the settings row. `patch` need only contain the fields being
 * changed — existing values for everything else are preserved via the
 * caller passing the full current state (the panel always does).
 */
export async function saveDirectoryClaimSettings(directoryId, patch) {
  const clean = { ...patch, directory_id: directoryId, updated_at: new Date().toISOString() };
  if ("intro_html" in clean) clean.intro_html = sanitizeNotesHtml(clean.intro_html) || null;
  const { error } = await supabase.from("directory_claim_settings").upsert(clean, { onConflict: "directory_id" });
  if (error) throw error;
}

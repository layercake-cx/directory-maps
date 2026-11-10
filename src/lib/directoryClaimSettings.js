import { supabase } from "./supabase";
import { sanitizeNotesHtml } from "./sanitizeHtml.js";
import { CLAIM_BANNER_COLUMNS } from "./claimBanner.js";

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
  claim_mode: "auto",
  claim_notify_email: "",
  // banner_* columns are absent here on purpose: bannerFromSettings() fills defaults.
};

const BANNER_SELECT = Object.values(CLAIM_BANNER_COLUMNS).join(", ");

/** @returns {Promise<typeof DEFAULT_SETTINGS>} defaults (not null) when no row exists yet. */
export async function getDirectoryClaimSettings(directoryId) {
  if (!directoryId) return { ...DEFAULT_SETTINGS };
  const { data, error } = await supabase
    .from("directory_claim_settings")
    .select(`directory_id, enabled, price_cents, currency, payment_type, payment_provider, intro_html, claim_mode, claim_notify_email, ${BANNER_SELECT}`)
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
  if ("claim_notify_email" in clean) clean.claim_notify_email = String(clean.claim_notify_email || "").trim() || null;
  if ("intro_html" in clean) clean.intro_html = sanitizeNotesHtml(clean.intro_html) || null;
  const { error } = await supabase.from("directory_claim_settings").upsert(clean, { onConflict: "directory_id" });
  if (error) throw error;
}

/** Simple shape check for the manual-claims mailbox (the database enforces the same pattern). */
export function isValidClaimNotifyEmail(email) {
  const v = String(email || "").trim();
  return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

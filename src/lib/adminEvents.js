/** @typedef {'map_design'|'map_publish'|'data'|'team'|'email'|'billing'|'ops'|'leads'} AdminEventCategory */

/** Labels for filter UI (type = category). */
export const ADMIN_EVENT_CATEGORY_LABELS = {
  map_design: "Map design",
  map_publish: "Publication",
  data: "Data",
  team: "Team",
  email: "Email",
  billing: "Billing",
  ops: "Operations",
  leads: "Leads",
};

/** Known subtypes per category (subtype filter options). */
export const ADMIN_EVENT_SUBTYPES_BY_CATEGORY = {
  map_design: [
    "created",
    "updated",
    "theme_updated",
    "group_created",
    "group_updated",
    "group_reordered",
    "group_deleted",
    "filter_field_created",
    "filter_field_updated",
    "filter_field_archived",
    "filter_field_deleted",
    "filter_field_reordered",
  ],
  map_publish: ["requested", "published", "failed", "rolled_back"],
  data: [
    "csv_uploaded",
    "import_completed",
    "import_failed",
    "google_drive_connected",
    "google_drive_file_selected",
    "google_drive_validation_failed",
    "sync_requested",
    "sync_completed",
    "sync_failed",
    "geocode_started",
    "geocode_completed",
    "geocode_failed",
    "filter_values_bulk_tagged",
  ],
  team: [
    "invite_created",
    "invite_email_sent",
    "invite_cancelled",
    "member_created",
    "member_delete_blocked",
    "password_reset_completed",
    "member_role_changed",
    "member_removed",
    "map_permission_changed",
  ],
  email: [
    "contact_message_sent",
    "contact_message_failed",
    "domain_setup_started",
    "domain_verified",
    "domain_verify_failed",
    "messaging_toggled",
  ],
  billing: ["checkout_session_created", "checkout_failed"],
  ops: ["deploy_hook_triggered", "deploy_hook_failed"],
  leads: ["status_changed"],
};

const TWO_PART_PREFIXES = ["map_design", "map_publish"];

/**
 * Split event_type into category (type) and subtype for filters and storage.
 * @param {string} eventType e.g. map_design_created, data_sync_completed
 */
export function parseAdminEventType(eventType) {
  const t = typeof eventType === "string" ? eventType.trim() : "";
  if (!t) return { category: "unknown", subtype: "" };

  for (const prefix of TWO_PART_PREFIXES) {
    const head = `${prefix}_`;
    if (t.startsWith(head)) {
      return { category: prefix, subtype: t.slice(head.length) };
    }
  }

  const singlePrefixes = ["data_", "team_", "email_", "billing_", "ops_"];
  for (const p of singlePrefixes) {
    if (t.startsWith(p)) {
      return { category: p.slice(0, -1), subtype: t.slice(p.length) };
    }
  }

  const i = t.indexOf("_");
  if (i === -1) return { category: t, subtype: "" };
  return { category: t.slice(0, i), subtype: t.slice(i + 1) };
}

/**
 * Fire-and-forget admin audit event (see AGENTS.md).
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {object} opts
 * @param {string} opts.eventType
 * @param {Record<string, unknown>} [opts.meta]
 * @param {string} [opts.source] UI surface (also stored in meta.source when set)
 * @param {string|null} [opts.clientId]
 * @param {string|null} [opts.mapId]
 */
export function recordAdminEvent(supabase, { eventType, meta = {}, source, clientId, mapId }) {
  if (!supabase || !eventType) return;

  const { category, subtype } = parseAdminEventType(eventType);
  const resolvedClientId = clientId ?? (typeof meta.client_id === "string" ? meta.client_id : null);
  const resolvedMapId = mapId ?? (typeof meta.map_id === "string" ? meta.map_id : null);
  const payload = { ...meta };
  if (source && payload.source == null) payload.source = source;

  const row = {
    event_type: eventType,
    event_category: category,
    event_subtype: subtype,
    client_id: resolvedClientId,
    map_id: resolvedMapId,
    meta: payload,
  };

  void supabase.from("admin_events").insert(row).then(({ error }) => {
    if (error && typeof console !== "undefined" && console.warn) {
      console.warn("admin event:", error.message ?? error);
    }
  });
}

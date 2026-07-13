/**
 * Configurable filter fields — shared data access + helpers.
 *
 * Filter fields are an additive, per-map metadata layer that sits alongside
 * groups/continent filtering. Definitions and options are edited immediately
 * (like groups rows); what the public embed shows is gated by the publication
 * snapshot (draft -> publish), so field changes only go live on Publish.
 *
 * Tables (see 20260713120000_create_map_filter_fields.sql):
 *   - map_filter_fields          field definitions per map
 *   - map_filter_field_options   option lists for select-type fields
 *   - listing_filter_values      per-listing tagged values (EAV)
 */

import { supabase } from "./supabase";

export const FIELD_TYPES = [
  {
    id: "single_select",
    label: "Single choice",
    hint: "Viewers pick one value (e.g. Membership tier).",
  },
  {
    id: "multi_select",
    label: "Multiple choice",
    hint: "A listing can have several values; viewers can pick more than one (e.g. Services offered).",
  },
  {
    id: "text",
    label: "Free text",
    hint: "Free-text tag with type-to-filter search. No fixed option list.",
  },
];

export const DISPLAY_CONTROLS = [
  { id: "dropdown", label: "Dropdown" },
  { id: "multi_select", label: "Checkbox list" },
  { id: "typeahead", label: "Typeahead (search)" },
];

/** Which display controls are valid for a given field type. */
export function allowedControlsForType(fieldType) {
  if (fieldType === "text") return ["typeahead"];
  if (fieldType === "multi_select") return ["multi_select", "typeahead"];
  // single_select
  return ["dropdown", "multi_select", "typeahead"];
}

export function defaultControlForType(fieldType) {
  return allowedControlsForType(fieldType)[0];
}

export function isSelectType(fieldType) {
  return fieldType === "single_select" || fieldType === "multi_select";
}

/** URL/import-safe slug from a human label. */
export function slugifyKey(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function sortByOrder(a, b) {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.label || "").localeCompare(String(b.label || ""));
}

/**
 * Load all filter fields (with their options) for a map, ordered by sort_order.
 * @param {string} mapId
 * @param {{ includeArchived?: boolean }} [opts]
 */
export async function loadFilterFields(mapId, opts = {}) {
  const { includeArchived = false } = opts;
  if (!mapId) return [];

  let fieldsQuery = supabase
    .from("map_filter_fields")
    .select("id, map_id, key, label, field_type, sort_order, is_active, show_in_filter_bar, display_control, created_at, updated_at")
    .eq("map_id", mapId)
    .order("sort_order", { ascending: true });
  if (!includeArchived) fieldsQuery = fieldsQuery.eq("is_active", true);

  const { data: fields, error: fieldsErr } = await fieldsQuery;
  if (fieldsErr) throw fieldsErr;
  const fieldRows = fields ?? [];
  if (fieldRows.length === 0) return [];

  const ids = fieldRows.map((f) => f.id);
  const { data: options, error: optErr } = await supabase
    .from("map_filter_field_options")
    .select("id, field_id, value, label, sort_order, color")
    .in("field_id", ids)
    .order("sort_order", { ascending: true });
  if (optErr) throw optErr;

  const optionsByField = new Map();
  for (const o of options ?? []) {
    if (!optionsByField.has(o.field_id)) optionsByField.set(o.field_id, []);
    optionsByField.get(o.field_id).push(o);
  }
  return fieldRows.map((f) => ({
    ...f,
    options: (optionsByField.get(f.id) ?? []).slice().sort(sortByOrder),
  }));
}

/** Load per-listing filter values for a whole map, keyed by listing id. */
export async function loadFilterValuesForMap(mapId) {
  if (!mapId) return {};
  // Values are reachable via the field's map_id; join through listings to scope by map.
  const { data: fields, error: fErr } = await supabase
    .from("map_filter_fields")
    .select("id")
    .eq("map_id", mapId);
  if (fErr) throw fErr;
  const fieldIds = (fields ?? []).map((f) => f.id);
  if (fieldIds.length === 0) return {};

  const { data, error } = await supabase
    .from("listing_filter_values")
    .select("listing_id, field_id, option_id, value_text")
    .in("field_id", fieldIds);
  if (error) throw error;

  const byListing = {};
  for (const row of data ?? []) {
    if (!byListing[row.listing_id]) byListing[row.listing_id] = [];
    byListing[row.listing_id].push({
      field_id: row.field_id,
      option_id: row.option_id,
      value_text: row.value_text,
    });
  }
  return byListing;
}

/** Load the filter values for a single listing. */
export async function loadListingFilterValues(listingId) {
  if (!listingId) return [];
  const { data, error } = await supabase
    .from("listing_filter_values")
    .select("id, listing_id, field_id, option_id, value_text")
    .eq("listing_id", listingId);
  if (error) throw error;
  return data ?? [];
}

/** Next sort_order for a new field on this map. */
async function nextFieldSortOrder(mapId) {
  const { data } = await supabase
    .from("map_filter_fields")
    .select("sort_order")
    .eq("map_id", mapId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const top = data?.[0]?.sort_order;
  return Number.isFinite(top) ? top + 1 : 0;
}

/**
 * Create a field plus its options (for select types).
 * options: [{ value?, label, color? }]
 */
export async function createFilterField({ mapId, label, key, fieldType, displayControl, options = [] }) {
  const sortOrder = await nextFieldSortOrder(mapId);
  const control = displayControl && allowedControlsForType(fieldType).includes(displayControl)
    ? displayControl
    : defaultControlForType(fieldType);
  const { data: field, error } = await supabase
    .from("map_filter_fields")
    .insert({
      map_id: mapId,
      key: key || slugifyKey(label),
      label,
      field_type: fieldType,
      sort_order: sortOrder,
      is_active: true,
      show_in_filter_bar: false,
      display_control: control,
    })
    .select()
    .single();
  if (error) throw error;

  if (isSelectType(fieldType) && options.length > 0) {
    await replaceFieldOptions(field.id, options);
  }
  return field;
}

/** Patch top-level field columns (label, display_control, show_in_filter_bar, is_active, key...). */
export async function updateFilterField(id, patch) {
  const { data, error } = await supabase
    .from("map_filter_fields")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function setFieldActive(id, isActive) {
  return updateFilterField(id, { is_active: isActive });
}

/** Permanently delete a field (cascades to options + listing values). */
export async function deleteFilterFieldPermanently(id) {
  const { error } = await supabase.from("map_filter_fields").delete().eq("id", id);
  if (error) throw error;
}

/** Persist a new ordering. orderedIds is the full desired order. */
export async function reorderFilterFields(orderedIds) {
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from("map_filter_fields").update({ sort_order: index }).eq("id", id)
    )
  );
}

/**
 * Replace the full option list for a field with the provided rows, preserving
 * existing option ids (so listing_filter_values stay valid) where an id is given.
 * Each option: { id?, value?, label, color?, sort_order? }
 * Note: `value` (import key) is immutable once created — callers must not change
 * it for existing options; this only sets it on insert.
 */
export async function replaceFieldOptions(fieldId, options) {
  const existing = await supabase
    .from("map_filter_field_options")
    .select("id, value")
    .eq("field_id", fieldId);
  if (existing.error) throw existing.error;
  const existingIds = new Set((existing.data ?? []).map((o) => o.id));
  const keptIds = new Set();

  for (let i = 0; i < options.length; i += 1) {
    const opt = options[i];
    const label = String(opt.label ?? "").trim();
    if (!label) continue;
    if (opt.id && existingIds.has(opt.id)) {
      keptIds.add(opt.id);
      // value is immutable — only update label/color/order
      const { error } = await supabase
        .from("map_filter_field_options")
        .update({ label, color: opt.color ?? null, sort_order: i })
        .eq("id", opt.id);
      if (error) throw error;
    } else {
      const value = slugifyKey(opt.value || label) || `opt_${i}`;
      const { data, error } = await supabase
        .from("map_filter_field_options")
        .insert({ field_id: fieldId, value, label, color: opt.color ?? null, sort_order: i })
        .select("id")
        .single();
      if (error) throw error;
      if (data?.id) keptIds.add(data.id);
    }
  }

  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
  if (toDelete.length > 0) {
    const { error } = await supabase.from("map_filter_field_options").delete().in("id", toDelete);
    if (error) throw error;
  }
}

/** How many listings currently carry a given option (for delete confirmation). */
export async function countListingsUsingOption(optionId) {
  const { count, error } = await supabase
    .from("listing_filter_values")
    .select("id", { count: "exact", head: true })
    .eq("option_id", optionId);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Replace a single listing's values for ONE field (delete-then-insert).
 * @param {string} listingId
 * @param {object} field   the field row (needs id + field_type)
 * @param {object} selection { optionIds?: string[], text?: string }
 */
export async function saveListingFieldValue(listingId, field, selection) {
  const del = await supabase
    .from("listing_filter_values")
    .delete()
    .eq("listing_id", listingId)
    .eq("field_id", field.id);
  if (del.error) throw del.error;

  const rows = [];
  if (field.field_type === "text") {
    const text = String(selection?.text ?? "").trim();
    if (text) rows.push({ listing_id: listingId, field_id: field.id, value_text: text });
  } else {
    const optionIds = Array.isArray(selection?.optionIds) ? selection.optionIds : [];
    const unique = [...new Set(optionIds.filter(Boolean))];
    for (const optionId of unique) {
      rows.push({ listing_id: listingId, field_id: field.id, option_id: optionId });
    }
  }
  if (rows.length > 0) {
    const { error } = await supabase.from("listing_filter_values").insert(rows);
    if (error) throw error;
  }
}

/**
 * Bulk-apply one field's value(s) to many listings.
 * mode: "replace" (delete-then-insert per listing) or "add" (insert missing only).
 */
export async function applyBulkFilterValue({ listingIds, field, optionIds = [], mode = "add" }) {
  const ids = [...new Set((listingIds || []).filter(Boolean))];
  if (ids.length === 0) return 0;
  const options = [...new Set(optionIds.filter(Boolean))];

  if (mode === "replace") {
    const del = await supabase
      .from("listing_filter_values")
      .delete()
      .in("listing_id", ids)
      .eq("field_id", field.id);
    if (del.error) throw del.error;
  }

  const rows = [];
  for (const listingId of ids) {
    for (const optionId of options) {
      rows.push({ listing_id: listingId, field_id: field.id, option_id: optionId });
    }
  }
  if (rows.length === 0) return ids.length;
  // upsert to respect the partial unique index (skip existing tags in "add" mode)
  const { error } = await supabase
    .from("listing_filter_values")
    .upsert(rows, { onConflict: "listing_id,field_id,option_id", ignoreDuplicates: true });
  if (error) throw error;
  return ids.length;
}

/** Shape a loaded field list into the compact form stored in the publication config. */
export function filterFieldsForPublication(fields) {
  return (fields || [])
    .filter((f) => f.is_active)
    .map((f) => ({
      id: f.id,
      key: f.key,
      label: f.label,
      field_type: f.field_type,
      display_control: f.display_control,
      show_in_filter_bar: !!f.show_in_filter_bar,
      sort_order: f.sort_order ?? 0,
      options: isSelectType(f.field_type)
        ? (f.options || []).map((o) => ({
            id: o.id,
            value: o.value,
            label: o.label,
            color: o.color ?? null,
            sort_order: o.sort_order ?? 0,
          }))
        : [],
    }));
}

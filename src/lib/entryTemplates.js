import { supabase } from "./supabase";

const COLUMNS = "id, directory_id, name, is_default, applies_to_group_id, applies_to_term_id, layout_json, created_at, updated_at";

/** DIR-E6 block palette (docs/DIRECTORIES.md §4.4), extended beyond the
 * original 6-block spec example to cover the entry-extras content Phase 2
 * added (evidence/media/accreditations/links/tiles) — otherwise the
 * designer would only control a subset of what an entry page actually
 * renders. `address_map` renders the address as text only, matching
 * today's generator output — an embedded per-entry interactive map is a
 * separate, larger feature (see docs/DEPLOYMENTS.md's DIR-E6 entry).
 *
 * `logo` renders directory_entries.logo_url — a real, existing field
 * (used by CSV import) that generate_directory_site has never actually
 * rendered anywhere until this feature gave it a block to live in. Kept
 * distinct from `hero`/`gallery` (entry_media_assets), which is a
 * different, pre-existing concept.
 */
export const BLOCK_TYPES = [
  { type: "logo", label: "Logo" },
  { type: "heading", label: "Name" },
  { type: "address_map", label: "Address" },
  { type: "contact_details", label: "Contact details" },
  { type: "hero", label: "Hero image" },
  { type: "gallery", label: "Photo gallery" },
  { type: "accreditations", label: "Accreditation badges" },
  { type: "notes_html", label: "Notes" },
  { type: "evidence", label: "Evidence" },
  { type: "product_tiles", label: "Product tiles" },
  { type: "links", label: "Links" },
];

export function blockLabel(type) {
  return BLOCK_TYPES.find((b) => b.type === type)?.label ?? type;
}

/** The order generate_directory_site falls back to when a directory has no
 * entry_templates rows at all — reproduces that function's pre-DIR-E6
 * hardcoded order exactly, so a directory that has never opened the
 * designer keeps byte-identical output (the `logo` block is deliberately
 * excluded here — logo_url was never rendered before, so including it by
 * default would be a real, unrequested behaviour change for every
 * existing directory the moment this ships).
 */
export const IMPLICIT_DEFAULT_LAYOUT = [
  { type: "hero" },
  { type: "heading" },
  { type: "address_map" },
  { type: "contact_details" },
  { type: "accreditations" },
  { type: "notes_html" },
  { type: "gallery" },
  { type: "evidence" },
  { type: "product_tiles" },
  { type: "links" },
];

/**
 * Which entry_templates row applies to a given entry — client-side mirror
 * of generate_directory_site/index.ts's resolveLayout (kept in sync by
 * hand, JS/TS runtimes can't share a module here): a template targeting one
 * of the entry's category terms > a template targeting the entry's group >
 * the directory's default > (no entry_templates rows at all) the implicit
 * pre-DIR-E6 order. Used by the entry editor's Preview & Publish tab; skips
 * the server-side version's term-vs-term tie-break sort (multiple templates
 * targeting different terms the entry holds is rare, and this is already a
 * client-side approximation, not a byte-for-byte match — see PreviewBlock).
 */
export function resolveEntryLayout(entry, templates, entryTermIds = []) {
  if (!templates || templates.length === 0) return IMPLICIT_DEFAULT_LAYOUT;

  const termIdSet = new Set(entryTermIds);
  const termMatch = templates.find((t) => t.applies_to_term_id && termIdSet.has(t.applies_to_term_id));
  if (termMatch) return termMatch.layout_json;

  const groupMatch = templates.find((t) => t.applies_to_group_id && t.applies_to_group_id === entry.directory_group_id);
  if (groupMatch) return groupMatch.layout_json;

  const defaultTemplate = templates.find((t) => t.is_default);
  return defaultTemplate ? defaultTemplate.layout_json : IMPLICIT_DEFAULT_LAYOUT;
}

export async function listEntryTemplates(directoryId) {
  const { data, error } = await supabase
    .from("entry_templates")
    .select(COLUMNS)
    .eq("directory_id", directoryId)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Upserts the single default template — the main designer screen always
 * edits this one (DIR-E6-S1: "layout_json is updated ... with is_default =
 * true"), creating it on first save if the directory has never had one.
 */
export async function saveDefaultLayout(directoryId, layoutJson) {
  const { data: existing, error: findErr } = await supabase
    .from("entry_templates")
    .select("id")
    .eq("directory_id", directoryId)
    .eq("is_default", true)
    .maybeSingle();
  if (findErr) throw findErr;

  if (existing) {
    const { error } = await supabase
      .from("entry_templates")
      .update({ layout_json: layoutJson, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw error;
    return existing.id;
  }

  const { data, error } = await supabase
    .from("entry_templates")
    .insert({ directory_id: directoryId, name: "Default", is_default: true, layout_json: layoutJson })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function createTargetedTemplate({ directoryId, name, layoutJson, appliesToGroupId, appliesToTermId }) {
  const cleanName = String(name || "").trim();
  if (!cleanName) throw new Error("Template name is required.");
  if (!appliesToGroupId && !appliesToTermId) throw new Error("Choose a group or a category term for this template to target.");
  if (appliesToGroupId && appliesToTermId) throw new Error("A template can target a group or a term, not both.");

  const { data, error } = await supabase
    .from("entry_templates")
    .insert({
      directory_id: directoryId,
      name: cleanName,
      is_default: false,
      applies_to_group_id: appliesToGroupId || null,
      applies_to_term_id: appliesToTermId || null,
      layout_json: layoutJson,
    })
    .select(COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error(appliesToTermId ? "Another template already targets this category term." : "Another template already targets this group.");
    }
    throw error;
  }
  return data;
}

export async function updateTemplateLayout(templateId, layoutJson) {
  const { error } = await supabase
    .from("entry_templates")
    .update({ layout_json: layoutJson, updated_at: new Date().toISOString() })
    .eq("id", templateId);
  if (error) throw error;
}

export async function deleteTargetedTemplate(templateId) {
  const { error } = await supabase.from("entry_templates").delete().eq("id", templateId).eq("is_default", false);
  if (error) throw error;
}

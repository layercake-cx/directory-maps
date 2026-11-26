import { supabase } from "./supabase";
import { BLOCK_REGISTRY } from "./blockRegistry.generated.js";

/**
 * Block pages (entry detail pages and content pages built from blocks).
 * Rules are enforced by the database RPCs (docs/DEPLOYMENTS.md, block pages phase 2); this file wraps them and holds
 * the registry helpers the editor needs. The registry is generated from scripts/block-registry.json.
 */

export const REGIONS = [
  { id: "hero", label: "Hero", hint: "Full width, at the top of the page." },
  { id: "main", label: "Main", hint: "The main column." },
  { id: "sidebar", label: "Sidebar", hint: "The column beside the main content." },
];

export const SPACING_OPTIONS = [
  { value: "", label: "Default" },
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: `--ds-space-${n}`, label: `Space ${n}` })),
];

export const ICON_NAMES = ["check", "arrow", "info", "star", "heart", "users", "calendar", "pin", "mail", "phone", "shield", "clock", "link"];

const GROUP_ORDER = ["text", "structured", "page-data"];
const GROUP_LABELS = { text: "Text and content", structured: "Page sections", "page-data": "Directory data" };

export const regionLabel = (id) => REGIONS.find((r) => r.id === id)?.label ?? id;

export function blockDef(type) {
  return BLOCK_REGISTRY.blocks.find((b) => b.id === type) ?? null;
}

export function blockName(type) {
  return blockDef(type)?.name ?? type;
}

/** Block types a page of this kind can hold, optionally limited to a region. Deferred blocks are never offered. */
export function availableBlocks(pageKind, region = null) {
  return BLOCK_REGISTRY.blocks.filter(
    (b) => b.status !== "deferred" && b.pageKinds.includes(pageKind) && (!region || b.allowedRegions.includes(region)),
  );
}

export function groupedBlocks(pageKind, region = null) {
  const list = availableBlocks(pageKind, region);
  return GROUP_ORDER.map((g) => ({ id: g, label: GROUP_LABELS[g], blocks: list.filter((b) => b.group === g) })).filter((g) => g.blocks.length > 0);
}

function emptyField(f) {
  if (f.default !== undefined) return structuredClone(f.default);
  switch (f.type) {
    case "boolean": return false;
    case "enum": return f.options?.[0] ?? "";
    case "multiEnum": return [];
    case "list": return Array.from({ length: f.min ?? 0 }, () => emptyData({ fields: f.itemFields }));
    case "textList": return Array.from({ length: f.min ?? 0 }, () => "");
    case "table": return [["", ""], ["", ""]];
    case "map": return {};
    case "link": case "image": return null;
    case "number": return f.min ?? 0;
    default: return "";
  }
}

/** A starting `data` object for a block definition (or item definition). Optional empty values are left out. */
export function emptyData(def) {
  const out = {};
  for (const f of def.fields ?? []) {
    const v = emptyField(f);
    const optionalEmpty = !f.required && (v === "" || v === null);
    if (!optionalEmpty) out[f.key] = v;
  }
  return out;
}

/** Evaluates the registry's tiny requiredWhen expressions: key=='value' or key!='value'. */
function whenHolds(expr, data) {
  const m = /^([A-Za-z]+)\s*(==|!=)\s*'([^']*)'$/.exec(expr ?? "");
  if (!m) return false;
  const actual = data?.[m[1]] ?? "";
  return m[2] === "==" ? actual === m[3] : actual !== m[3];
}

const blank = (v) => v == null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

/**
 * Inline validation that mirrors the obvious database rules (required, lengths, list bounds, alt text) so people
 * get feedback as they type. The database is still the authority and re-validates on save.
 * Returns { "data.title": "message", "data.items[0].heading": "message", ... }.
 */
export function validateFields(fields, data, path = "data") {
  const errors = {};
  for (const f of fields ?? []) {
    const p = `${path}.${f.key}`;
    const v = data?.[f.key];
    const required = f.required || whenHolds(f.requiredWhen, data);
    if (blank(v)) {
      if (required) errors[p] = `${f.label} is required`;
      else if ((f.type === "list" || f.type === "textList") && f.min) errors[p] = `${f.label} needs at least ${f.min} item${f.min === 1 ? "" : "s"}`;
      continue;
    }
    if ((f.type === "text" || f.type === "textarea") && f.maxLength && String(v).length > f.maxLength) errors[p] = `${f.label} must be at most ${f.maxLength} characters`;
    if (f.type === "number" && typeof v === "number") {
      if (f.min != null && v < f.min) errors[p] = `${f.label} must be at least ${f.min}`;
      if (f.max != null && v > f.max) errors[p] = `${f.label} must be at most ${f.max}`;
    }
    if (f.type === "link" && v?.target && v.kind === "url" && !/^(https?:\/\/|mailto:|tel:)\S+$/i.test(v.target)) errors[p] = `${f.label} must start with https://, mailto: or tel:`;
    if (f.type === "link" && v?.target && v.kind === "anchor" && !/^[a-z][a-z0-9-]{0,59}$/.test(v.target)) errors[p] = `${f.label} must be lowercase letters, numbers and hyphens`;
    if (f.type === "image") {
      if (!/^https?:\/\/\S+$/i.test(v.url ?? "")) errors[p] = `${f.label} needs a web address starting with https://`;
      else if (f.altTextRequired && blank(v.alt)) errors[p] = `${f.label} needs alt text`;
    }
    if (f.type === "list" && Array.isArray(v)) {
      if (f.min && v.length < f.min) errors[p] = `${f.label} needs at least ${f.min} items`;
      if (f.max && v.length > f.max) errors[p] = `${f.label} can have at most ${f.max} items`;
      v.forEach((item, i) => Object.assign(errors, validateFields(f.itemFields, item, `${p}[${i}]`)));
    }
    if (f.type === "textList" && Array.isArray(v)) {
      if (f.min && v.length < f.min) errors[p] = `${f.label} needs at least ${f.min} items`;
      if (f.max && v.length > f.max) errors[p] = `${f.label} can have at most ${f.max} items`;
      if (v.some((s) => blank(s))) errors[p] = `${f.label} items cannot be empty`;
      else if (f.itemMaxLength && v.some((s) => s.length > f.itemMaxLength)) errors[p] = `${f.label} items must be at most ${f.itemMaxLength} characters`;
    }
  }
  return errors;
}

/** Drops empty optional values so the database does not see "" where a field is simply unset. */
export function cleanData(fields, data) {
  const out = {};
  for (const f of fields ?? []) {
    let v = data?.[f.key];
    if (v === undefined) continue;
    if (f.type === "list" && Array.isArray(v)) v = v.map((item) => cleanData(f.itemFields, item));
    if (f.type === "link" && v && !v.target) v = null;
    if (f.type === "image" && v && !v.url) v = null;
    if (f.type === "map" && v) v = Object.fromEntries(Object.entries(v).filter(([, s]) => !blank(s)));
    if (v === null || v === "" || (!f.required && Array.isArray(v) && v.length === 0 && f.type !== "list" && f.type !== "textList" && f.type !== "table")) {
      if (!f.required) continue;
    }
    out[f.key] = v;
  }
  return out;
}

/** The server raises "Invalid block: [{path, message}, …]". Returns readable messages (and the field paths). */
export function parseBlockError(err) {
  const raw = err?.message ?? String(err);
  const m = /Invalid block:\s*(\[.*\])/s.exec(raw);
  if (m) {
    try {
      return JSON.parse(m[1]).map((e) => ({ path: e.path, message: `${e.path}: ${e.message}` }));
    } catch { /* fall through to the plain message */ }
  }
  return [{ path: null, message: raw }];
}

/** One line for a block row: its heading, else its first text field. */
export function blockSummary(block) {
  const d = block.data ?? {};
  const first = d.title || d.heading || d.question || d.who || d.body || d.intro || d.label;
  const text = typeof first === "string" ? first.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : "";
  if (text) return text.length > 90 ? `${text.slice(0, 87)}…` : text;
  if (Array.isArray(d.items) && d.items.length) return `${d.items.length} item${d.items.length === 1 ? "" : "s"}`;
  return blockDef(block.block_type)?.dataBound ? "Shows this entry's data" : "No content yet";
}

// ---------------------------------------------------------------- RPC wrappers

async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data;
}

const claimArg = (claimId) => ({ p_claim_id: claimId ?? null });

/** { converted, is_admin, blocks: [...] } for one page. `claimId` is set when a listing owner edits their own entry. */
export const getPageBlocks = (pageKind, pageId, claimId) =>
  rpc("get_page_blocks", { p_page_kind: pageKind, p_page_id: pageId, ...claimArg(claimId) });

export const convertPageToBlocks = (pageKind, pageId, claimId) =>
  rpc("convert_page_to_blocks", { p_page_kind: pageKind, p_page_id: pageId, ...claimArg(claimId) });

export const addPageBlock = ({ pageKind, pageId, region, blockType, data, common = {}, index = null, templateId = null, claimId = null }) =>
  rpc("add_page_block", {
    p_page_kind: pageKind, p_page_id: pageId, p_region: region ?? null, p_block_type: blockType ?? null,
    p_data: data ?? null, p_common: common, p_index: index, p_template_id: templateId, ...claimArg(claimId),
  });

export const updatePageBlock = ({ blockId, data = null, common = null, claimId = null }) =>
  rpc("update_page_block", { p_block_id: blockId, p_data: data, p_common: common, ...claimArg(claimId) });

export const resetPageBlockToTemplate = (blockId, claimId) =>
  rpc("reset_page_block_to_template", { p_block_id: blockId, ...claimArg(claimId) });

export const movePageBlock = ({ blockId, region, index, claimId = null }) =>
  rpc("move_page_block", { p_block_id: blockId, p_region: region, p_index: index, ...claimArg(claimId) });

export const removePageBlock = (blockId, claimId) => rpc("remove_page_block", { p_block_id: blockId, ...claimArg(claimId) });

/** Listing owners cannot read the library tables, so their templates and entry terms come from one RPC. */
export const getClaimBlockContext = (claimId) => rpc("get_claim_block_context", { p_claim_id: claimId });

// ---- Library (directory admins)

export async function listBlockTemplates(directoryId) {
  const { data, error } = await supabase
    .from("directory_block_templates")
    .select("id, directory_id, page_kind, name, block_type, region, data, common, lock_position, lock_content, placement, auto_add, content_version, created_at, updated_at")
    .eq("directory_id", directoryId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** { [templateId]: { linked, edited } } — how many pages use each template as-is and how many have changed it. */
export async function blockTemplateUsage(directoryId) {
  const usage = {};
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("directory_page_blocks")
      .select("id, template_id, data")
      .eq("directory_id", directoryId)
      .not("template_id", "is", null)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) {
      const u = (usage[r.template_id] ??= { linked: 0, edited: 0 });
      if (r.data == null) u.linked += 1;
      else u.edited += 1;
    }
    if ((data ?? []).length < 1000) break;
  }
  return usage;
}

export const saveBlockTemplate = (t) =>
  rpc("save_block_template", {
    p_directory_id: t.directoryId, p_page_kind: t.pageKind, p_name: t.name, p_block_type: t.blockType, p_region: t.region,
    p_data: t.data, p_common: t.common ?? {}, p_lock_position: !!t.lockPosition, p_lock_content: !!t.lockContent,
    p_placement: t.placement ?? "end", p_auto_add: !!t.autoAdd, p_template_id: t.id ?? null, p_relink_detached: !!t.relinkDetached,
  });

export const deleteBlockTemplate = (templateId) => rpc("delete_block_template", { p_template_id: templateId });

/** Adds the template to every page that lacks it, in batches, until none remain. Returns the total stamped. */
export async function stampBlockTemplate(templateId, onProgress) {
  let total = 0;
  for (;;) {
    const r = await rpc("stamp_block_template", { p_template_id: templateId, p_limit: 200 });
    total += r.stamped;
    onProgress?.({ stamped: total, remaining: r.remaining });
    if (r.remaining === 0 || r.stamped === 0) return total;
  }
}

export const promotePageBlockToTemplate = ({ blockId, name, lockPosition = false, lockContent = false, placement = "end", autoAdd = false }) =>
  rpc("promote_page_block_to_template", {
    p_block_id: blockId, p_name: name, p_lock_position: lockPosition, p_lock_content: lockContent, p_placement: placement, p_auto_add: autoAdd,
  });

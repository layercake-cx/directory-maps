import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { blockDef, getPageBlocks, regionLabel } from "../../lib/pageBlocks.js";
import { savePageBlocks } from "../../lib/pagePublish.js";

/**
 * The editor's working copy of one page's blocks. Edits change this copy only; Save draft sends the whole copy to the
 * server in one transaction (save_page_blocks), which enforces locks and refuses to overwrite a newer version.
 *
 * A block is "linked" while it follows its library template (its data is null on the server). The copy keeps the
 * effective data for display, and sends null for a linked block, so saving never detaches a block by accident.
 */

let tempCounter = 0;

function fromServer(b) {
  return {
    key: b.id, id: b.id, isNew: false,
    region: b.region, block_type: b.block_type,
    template_id: b.template_id ?? null, template_name: b.template_name ?? null,
    linked: !!b.linked, data: b.data ?? {}, common: b.common ?? {},
    lock_position: !!b.lock_position, lock_content: !!b.lock_content, placement: b.placement ?? null,
    can_edit: !!b.can_edit, can_edit_content: !!b.can_edit_content, can_move: !!b.can_move, can_remove: !!b.can_remove,
  };
}

/** What the server is sent for one block. */
function toRow(b) {
  return {
    id: b.isNew ? null : b.id,
    region: b.region,
    block_type: b.block_type,
    template_id: b.isNew ? b.template_id : undefined,
    data: b.linked ? null : b.data,
    common: b.common,
  };
}

/** The same rows, shaped for the preview request: every block needs an id (new ones use their temporary key). */
export function previewRows(draft) {
  const perRegion = { hero: 0, main: 0, sidebar: 0 };
  return draft.map((b) => ({
    id: b.key, region: b.region, position: perRegion[b.region]++, block_type: b.block_type,
    template_id: b.template_id, data: b.linked ? null : b.data, common: b.common,
  }));
}

/** Position-locked blocks stay at the start or end of their region, as the server enforces. */
function pinned(list) {
  const rank = (b) => (b.lock_position && b.placement === "start" ? 0 : b.lock_position && b.placement === "end" ? 2 : 1);
  const out = [];
  for (const region of ["hero", "main", "sidebar"]) {
    out.push(...list.filter((b) => b.region === region).map((b, i) => ({ b, i })).sort((x, y) => rank(x.b) - rank(y.b) || x.i - y.i).map((x) => x.b));
  }
  return out;
}

const signature = (list) => JSON.stringify(list.map(toRow));

export function useBlockWorkingCopy({ kind, id, claimId = null, templates = [] }) {
  const [server, setServer] = useState(null); // { converted, is_admin, page_updated_at, blocks }
  const [draft, setDraft] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const baseline = useRef("");
  const templateById = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);

  const load = useCallback(async () => {
    try {
      const s = await getPageBlocks(kind, id, claimId);
      const list = (s.blocks ?? []).map(fromServer);
      setServer(s);
      setDraft(list);
      baseline.current = signature(list);
      setError("");
      return s;
    } catch (e) {
      setError(e?.message ?? String(e));
      return null;
    }
  }, [kind, id, claimId]);

  useEffect(() => { setServer(null); void load(); }, [load]);

  const dirty = server != null && signature(draft) !== baseline.current;
  const isAdmin = !!server?.is_admin;
  const commit = (next) => setDraft(pinned(next));

  const byKey = (key) => draft.find((b) => b.key === key) ?? null;

  /** Where a block would be placed in a region: `index` is the position among that region's blocks (null = end). */
  const insertAt = (list, block, region, index) => {
    const others = list.filter((b) => b.key !== block.key);
    const inRegion = others.filter((b) => b.region === region);
    const at = index == null ? inRegion.length : Math.max(0, Math.min(index, inRegion.length));
    const before = at < inRegion.length ? inRegion[at] : null;
    const placed = { ...block, region };
    if (before) return others.flatMap((b) => (b.key === before.key ? [placed, b] : [b]));
    // End of the region: after its last block, or at the end of the list.
    const last = inRegion[inRegion.length - 1];
    if (last) return others.flatMap((b) => (b.key === last.key ? [b, placed] : [b]));
    return [...others, placed];
  };

  const addBlock = ({ region, block_type, data, common = {}, index = null }) => {
    const def = blockDef(block_type);
    const block = {
      key: `new-${++tempCounter}`, id: null, isNew: true, region, block_type, template_id: null, template_name: null,
      linked: false, data, common, lock_position: false, lock_content: false, placement: null,
      can_edit: true, can_edit_content: true, can_move: true, can_remove: true, _def: def?.id,
    };
    commit(insertAt(draft, block, region, index));
    return block.key;
  };

  const addFromTemplate = (template, index = null) => {
    const block = {
      key: `new-${++tempCounter}`, id: null, isNew: true, region: template.region, block_type: template.block_type,
      template_id: template.id, template_name: template.name, linked: true, data: template.data ?? {}, common: template.common ?? {},
      lock_position: !!template.lock_position, lock_content: !!template.lock_content, placement: template.placement ?? null,
      can_edit: isAdmin || !template.lock_content, can_edit_content: !template.lock_content, can_move: isAdmin || !template.lock_position, can_remove: isAdmin || !template.lock_position,
    };
    commit(insertAt(draft, block, template.region, index));
    return block.key;
  };

  /** A change to content makes the block the page's own; a change to settings alone does not. */
  const updateBlock = (key, { data, common }) =>
    commit(draft.map((b) => (b.key !== key ? b : {
      ...b,
      common: common ?? b.common,
      ...(data != null ? { data, linked: false } : {}),
    })));

  /** Follow the library template again. The canvas shows the template's content after the next preview. */
  const resetToTemplate = (key) => commit(draft.map((b) => {
    if (b.key !== key) return b;
    const t = b.template_id ? templateById.get(b.template_id) : null;
    return { ...b, linked: true, data: t?.data ?? b.data };
  }));

  const moveBlock = (key, region, index) => {
    const b = byKey(key);
    if (!b || !b.can_move) return false;
    const def = blockDef(b.block_type);
    if (!def?.allowedRegions.includes(region)) return false;
    commit(insertAt(draft, b, region, index));
    return true;
  };

  /** Move up or down within the region (delta -1 or +1). */
  const nudge = (key, delta) => {
    const b = byKey(key);
    if (!b || !b.can_move) return false;
    const inRegion = draft.filter((x) => x.region === b.region);
    const i = inRegion.findIndex((x) => x.key === key);
    const to = i + delta;
    if (to < 0 || to >= inRegion.length) return false;
    const neighbour = inRegion[to];
    if (!isAdmin && neighbour.lock_position) return false;
    commit(insertAt(draft, b, b.region, to));
    return true;
  };

  const removeBlock = (key) => {
    const b = byKey(key);
    if (!b || !b.can_remove) return false;
    commit(draft.filter((x) => x.key !== key));
    return true;
  };

  const discard = () => setDraft(server ? (server.blocks ?? []).map(fromServer) : []);

  /** Save draft. Throws on a stale version (see isStaleSave) or a refused change. */
  const save = async () => {
    setSaving(true);
    try {
      const res = await savePageBlocks({ kind, id, expectedUpdatedAt: server.page_updated_at, blocks: draft.map(toRow), claimId });
      await load();
      return res;
    } finally {
      setSaving(false);
    }
  };

  return {
    loaded: server != null, converted: !!server?.converted, isAdmin, pageUpdatedAt: server?.page_updated_at ?? null,
    draft, dirty, error, saving, load,
    byKey, addBlock, addFromTemplate, updateBlock, resetToTemplate, moveBlock, nudge, removeBlock, discard, save,
    regionBlocks: (region) => draft.filter((b) => b.region === region),
    regionLabel,
  };
}

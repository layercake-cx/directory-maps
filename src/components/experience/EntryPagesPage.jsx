import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useDirectory } from "../../hooks/useDirectory.js";
import { listDirectoryGroups } from "../../lib/directories.js";
import { listAttachedCategorisations } from "../../lib/categorisations.js";
import { listEvidenceItems } from "../../lib/evidenceItems.js";
import { listMediaAssets } from "../../lib/mediaAssets.js";
import { listProductTiles } from "../../lib/productTiles.js";
import { listProminentLinks } from "../../lib/prominentLinks.js";
import { listAccreditationSchemes, loadEntryAccreditationSchemeIds } from "../../lib/accreditations.js";
import {
  BLOCK_TYPES,
  IMPLICIT_DEFAULT_LAYOUT,
  blockLabel,
  listEntryTemplates,
  saveDefaultLayout,
  createTargetedTemplate,
  updateTemplateLayout,
  deleteTargetedTemplate,
} from "../../lib/entryTemplates.js";
import PreviewBlock from "../directories/EntryPreviewBlock.jsx";
import { ConfirmDialog, Dialog, SaveBar, useUnsavedGuard } from "./ui.jsx";
import "./experience.css";

const ENTRY_COLUMNS =
  "id, name, address, city, postcode, country, phone, email, website_url, logo_url, notes_html, allow_html, show_phone, show_email, show_website, show_address, directory_group_id";

function blockKey(block) {
  return block.type === "categorisation" ? `categorisation:${block.key}` : block.type;
}

function NewTemplateDialog({ groups, categorisations, busy, onSubmit, onCancel }) {
  const id = useId();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  return (
    <Dialog title="New template" labelledBy={id} onClose={onCancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(name.trim(), target);
        }}
        style={{ display: "grid", gap: 12 }}
      >
        <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600 }}>
          Template name
          <input className="xp-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Healthcare profile" required />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600 }}>
          Applies to
          <select className="xp-input" value={target} onChange={(e) => setTarget(e.target.value)} required>
            <option value="">Choose…</option>
            {groups.length > 0 && (
              <optgroup label="Group">
                {groups.map((g) => <option key={g.id} value={`group:${g.id}`}>{g.name}</option>)}
              </optgroup>
            )}
            {categorisations.map((c) => (
              <optgroup key={c.id} label={c.label}>
                {(c.terms ?? []).map((t) => <option key={t.id} value={`term:${t.id}`}>{t.label}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="xp-row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="xp-btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="xp-btn xp-btn-primary" disabled={busy || !name.trim() || !target}>{busy ? "Creating…" : "Create template"}</button>
        </div>
      </form>
    </Dialog>
  );
}

export default function EntryPagesPage() {
  const { directoryId, basePath, canManage, recordEvent } = useDirectory();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  const [templates, setTemplates] = useState([]);
  const [groups, setGroups] = useState([]);
  const [categorisations, setCategorisations] = useState([]);
  const [entries, setEntries] = useState([]);
  const [termIdsByEntry, setTermIdsByEntry] = useState({});
  const [previewId, setPreviewId] = useState("");
  const [previewExtras, setPreviewExtras] = useState({});

  const [selectedId, setSelectedId] = useState("default");
  const [draft, setDraft] = useState(IMPLICIT_DEFAULT_LAYOUT);
  const [dragIndex, setDragIndex] = useState(null);
  const [dialog, setDialog] = useState(null);

  const defaultTemplate = templates.find((t) => t.is_default) ?? null;
  const otherTemplates = templates.filter((t) => !t.is_default);
  const selectedTemplate = selectedId === "default" ? null : templates.find((t) => t.id === selectedId) ?? null;
  const savedLayout = selectedId === "default" ? (defaultTemplate ? defaultTemplate.layout_json : IMPLICIT_DEFAULT_LAYOUT) : selectedTemplate?.layout_json ?? IMPLICIT_DEFAULT_LAYOUT;

  const changed = useMemo(() => {
    const n = Math.max(draft.length, savedLayout.length);
    let c = 0;
    for (let i = 0; i < n; i += 1) if (JSON.stringify(draft[i]) !== JSON.stringify(savedLayout[i])) c += 1;
    return c;
  }, [draft, savedLayout]);
  useUnsavedGuard(changed > 0);

  const load = useCallback(async () => {
    if (!directoryId) return;
    setLoading(true);
    setErr("");
    try {
      const [tpl, grp, cats, entryRes] = await Promise.all([
        listEntryTemplates(directoryId),
        listDirectoryGroups(directoryId),
        listAttachedCategorisations("directory", directoryId),
        supabase.from("directory_entries").select(ENTRY_COLUMNS).eq("directory_id", directoryId).eq("is_active", true).order("name", { ascending: true }).limit(2000),
      ]);
      if (entryRes.error) throw entryRes.error;
      setTemplates(tpl);
      setGroups(grp);
      setCategorisations(cats);
      const list = entryRes.data ?? [];
      setEntries(list);
      setPreviewId((cur) => (cur && list.some((e) => e.id === cur) ? cur : list[0]?.id ?? ""));
      if (list.length) {
        const { data: termRows } = await supabase.from("entry_category_terms").select("entry_id, term_id").in("entry_id", list.map((e) => e.id).slice(0, 2000));
        const map = {};
        for (const r of termRows ?? []) (map[r.entry_id] ??= []).push(r.term_id);
        setTermIdsByEntry(map);
      }
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [directoryId]);
  useEffect(() => { load(); }, [load]);

  const previewEntry = entries.find((e) => e.id === previewId) ?? null;
  useEffect(() => {
    let cancelled = false;
    if (!previewEntry) {
      setPreviewExtras({});
      return undefined;
    }
    (async () => {
      try {
        const [evidence, media, tiles, links, heldSchemeIds, schemes, entryTerms] = await Promise.all([
          listEvidenceItems(previewEntry.id),
          listMediaAssets(previewEntry.id),
          listProductTiles(previewEntry.id),
          listProminentLinks({ entryId: previewEntry.id }),
          loadEntryAccreditationSchemeIds(previewEntry.id),
          listAccreditationSchemes(directoryId),
          supabase.from("entry_category_terms").select("category_terms(id, label, categorisation_id)").eq("entry_id", previewEntry.id),
        ]);
        const termsByKey = {};
        for (const row of entryTerms.data ?? []) {
          const term = Array.isArray(row.category_terms) ? row.category_terms[0] : row.category_terms;
          if (!term) continue;
          const cat = categorisations.find((c) => c.id === term.categorisation_id);
          if (cat) (termsByKey[cat.key] ??= []).push(term);
        }
        if (!cancelled) setPreviewExtras({ evidence, media, tiles, links, accreditations: schemes.filter((s) => heldSchemeIds.includes(s.id)), termsByKey });
      } catch (e) {
        if (!cancelled) setErr(e?.message ?? String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewEntry, directoryId, categorisations]);

  useEffect(() => {
    setDraft(savedLayout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, templates]);

  /** Mirrors entryTemplates.resolveEntryLayout's precedence, returning the template id. */
  const usageCounts = useMemo(() => {
    const counts = {};
    for (const entry of entries) {
      const termSet = new Set(termIdsByEntry[entry.id] ?? []);
      const match =
        templates.find((t) => t.applies_to_term_id && termSet.has(t.applies_to_term_id)) ??
        templates.find((t) => t.applies_to_group_id && t.applies_to_group_id === entry.directory_group_id) ??
        templates.find((t) => t.is_default);
      const key = match ? (match.is_default ? "default" : match.id) : "default";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [entries, templates, termIdsByEntry]);

  const availableToAdd = useMemo(() => {
    const present = new Set(draft.map(blockKey));
    return {
      standard: BLOCK_TYPES.filter((b) => !present.has(b.type)),
      cats: categorisations.filter((c) => !present.has(`categorisation:${c.key}`)),
    };
  }, [draft, categorisations]);

  const move = (from, to) =>
    setDraft((d) => {
      if (to < 0 || to >= d.length || from === to) return d;
      const next = [...d];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
  const setLabel = (i, label) =>
    setDraft((d) =>
      d.map((b, bi) => {
        if (bi !== i) return b;
        const next = { ...b };
        const t = label.trim();
        if (t) next.label = label;
        else delete next.label;
        return next;
      }),
    );

  /** Hidden blocks stay in the saved layout but render nothing; shown = no `hidden` key at all. */
  const setShown = (i, shown) =>
    setDraft((d) =>
      d.map((b, bi) => {
        if (bi !== i) return b;
        const next = { ...b };
        if (shown) delete next.hidden;
        else next.hidden = true;
        return next;
      }),
    );

  function chooseTemplate(id) {
    if (id === selectedId) return;
    if (changed > 0) setDialog({ kind: "switch", id });
    else setSelectedId(id);
  }

  async function save() {
    setErr("");
    try {
      setSaving(true);
      const cleaned = draft.map((b) => {
        if (!b.label) return b;
        const t = b.label.trim();
        const next = { ...b };
        if (t) next.label = t;
        else delete next.label;
        return next;
      });
      if (selectedId === "default") {
        await saveDefaultLayout(directoryId, cleaned);
        recordEvent?.("directory_entry_layout_updated", { directory_id: directoryId, template: "default", block_count: cleaned.length });
      } else {
        await updateTemplateLayout(selectedId, cleaned);
        recordEvent?.("directory_entry_layout_updated", { directory_id: directoryId, template_id: selectedId, block_count: cleaned.length });
      }
      setSavedAt(new Date());
      await load();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  async function createTemplate(name, target) {
    setErr("");
    try {
      setSaving(true);
      const [kind, id] = target.split(":");
      const created = await createTargetedTemplate({
        directoryId,
        name,
        layoutJson: defaultTemplate ? defaultTemplate.layout_json : IMPLICIT_DEFAULT_LAYOUT,
        appliesToGroupId: kind === "group" ? id : null,
        appliesToTermId: kind === "term" ? id : null,
      });
      recordEvent?.("directory_entry_template_created", { directory_id: directoryId, template_id: created.id, name: created.name });
      setDialog(null);
      await load();
      setSelectedId(created.id);
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(template) {
    try {
      await deleteTargetedTemplate(template.id);
      recordEvent?.("directory_entry_template_deleted", { directory_id: directoryId, template_id: template.id, name: template.name });
      setDialog(null);
      setSelectedId("default");
      await load();
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }

  if (!canManage) return <p className="xp-help">Only an Owner or Manager can change entry pages.</p>;
  if (loading && templates.length === 0 && entries.length === 0) return <p className="xp-help">Loading…</p>;

  const usedBy = (id) => usageCounts[id] ?? 0;
  const optLabel = (name, id) => `${name} · used by ${usedBy(id)} ${usedBy(id) === 1 ? "entry" : "entries"}`;

  return (
    <div className="xp-page">
      <div>
        <p className="xp-crumb">Experience / Entry pages</p>
        <h1 className="page-title" style={{ margin: "4px 0 0" }}>Entry pages</h1>
        <p className="xp-sub">Which sections appear on each organisation's page, and in what order.</p>
      </div>

      <div className="xp-row">
        <label htmlFor="xp-template" style={{ fontSize: 13, fontWeight: 600 }}>Template</label>
        <select id="xp-template" className="xp-input" style={{ minWidth: 240 }} value={selectedId} onChange={(e) => chooseTemplate(e.target.value)}>
          <option value="default">{optLabel("Default", "default")}</option>
          {otherTemplates.map((t) => <option key={t.id} value={t.id}>{optLabel(t.name, t.id)}</option>)}
        </select>
        <button type="button" className="xp-btn" onClick={() => setDialog({ kind: "new" })}>+ New template</button>
        {selectedTemplate && <button type="button" className="xp-btn xp-btn-danger" onClick={() => setDialog({ kind: "delete", template: selectedTemplate })}>Delete template</button>}
      </div>

      <div className="xp-body">
        <section className="xp-editor" aria-label="Sections">
          <div className="xp-blocks">
            <div className="xp-blockhead" aria-hidden="true">
              <span style={{ width: 28 }} />
              <span style={{ width: 160 }}>Section</span>
              <span style={{ flex: 1 }}>Heading on page</span>
              <span style={{ width: 56, textAlign: "center" }}>Show</span>
              <span style={{ width: 88 }} />
            </div>
            {draft.map((block, i) => {
              const name = block.type === "categorisation" ? `Tags: ${block.key}` : blockLabel(block.type);
              return (
                <div
                  key={`${blockKey(block)}-${i}`}
                  className="xp-block"
                  data-dragging={String(dragIndex === i)}
                  data-hidden={String(block.hidden === true)}
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIndex !== null) move(dragIndex, i);
                    setDragIndex(null);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                >
                  <button
                    type="button"
                    className="xp-grip"
                    aria-label={`Reorder ${name}. Use Alt plus Up or Down arrow to move.`}
                    onKeyDown={(e) => {
                      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
                        e.preventDefault();
                        const to = e.key === "ArrowUp" ? i - 1 : i + 1;
                        move(i, to);
                        requestAnimationFrame(() => document.querySelectorAll(".xp-grip")[Math.max(0, Math.min(draft.length - 1, to))]?.focus());
                      }
                    }}
                  >
                    ⋮⋮
                  </button>
                  <span className="xp-block-name">{name}</span>
                  <input className="xp-input xp-block-heading" aria-label={`Heading for ${name}`} value={block.label || ""} placeholder="No heading" onChange={(e) => setLabel(i, e.target.value)} />
                  <span className="xp-block-show">
                    <input type="checkbox" aria-label={`Show ${name}`} checked={block.hidden !== true} onChange={(e) => setShown(i, e.target.checked)} />
                  </span>
                  <span className="xp-moves">
                    <button type="button" className="xp-iconbtn" style={{ height: 22, width: 32, fontSize: 12 }} aria-label={`Move ${name} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>▲</button>
                    <button type="button" className="xp-iconbtn" style={{ height: 22, width: 32, fontSize: 12 }} aria-label={`Move ${name} down`} disabled={i === draft.length - 1} onClick={() => move(i, i + 1)}>▼</button>
                  </span>
                  <button type="button" className="xp-iconbtn" aria-label={`Remove ${name}`} onClick={() => setDraft((d) => d.filter((_, bi) => bi !== i))}>×</button>
                </div>
              );
            })}
            {draft.length === 0 && <p className="xp-help" style={{ padding: 16 }}>No sections — add one below.</p>}
            <div className="xp-row" style={{ padding: "12px 16px", justifyContent: "space-between" }}>
              {availableToAdd.standard.length > 0 || availableToAdd.cats.length > 0 ? (
                <select
                  className="xp-input"
                  aria-label="Add section"
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    setDraft((d) => [...d, v.startsWith("cat:") ? { type: "categorisation", key: v.slice(4) } : { type: v }]);
                  }}
                >
                  <option value="">+ Add section</option>
                  {availableToAdd.standard.map((b) => <option key={b.type} value={b.type}>{b.label}</option>)}
                  {availableToAdd.cats.map((c) => <option key={c.key} value={`cat:${c.key}`}>Tags: {c.label}</option>)}
                </select>
              ) : <span />}
              <span className="xp-help">Headings become jump links at the top of the page.</span>
            </div>
          </div>
        </section>

        <aside className="xp-previewcol" aria-label="Entry preview">
          <div className="xp-row" style={{ justifyContent: "space-between" }}>
            <span className="xp-tabgroup-label">Preview</span>
            {entries.length > 0 && (
              <label className="xp-help" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                Entry
                <select className="xp-input" style={{ height: 30, fontSize: 12, maxWidth: 220 }} aria-label="Preview entry" value={previewId} onChange={(e) => setPreviewId(e.target.value)}>
                  {entries.map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}
                </select>
              </label>
            )}
          </div>
          <div className="xp-card" style={{ maxHeight: 520, overflowY: "auto" }}>
            {entries.length === 0 && <p className="xp-help">Placeholder preview — this directory has no active entries yet.</p>}
            {draft.map((block, i) => (
              <PreviewBlock key={`${blockKey(block)}-${i}`} block={block} entry={previewEntry} extras={previewExtras} />
            ))}
          </div>
        </aside>
      </div>

      <SaveBar
        dirtyCount={changed}
        saving={saving}
        error={err}
        savedAt={savedAt}
        publishHref={`${basePath}/publishing`}
        PublishLink={Link}
        onDiscard={() => setDialog({ kind: "discard" })}
        onSave={save}
      />

      {dialog?.kind === "new" && <NewTemplateDialog groups={groups} categorisations={categorisations} busy={saving} onSubmit={createTemplate} onCancel={() => setDialog(null)} />}
      {dialog?.kind === "delete" && <ConfirmDialog title="Delete template?" message={`Delete "${dialog.template.name}"? Entries it applied to will fall back to the default layout.`} confirmLabel="Delete" danger onConfirm={() => deleteTemplate(dialog.template)} onCancel={() => setDialog(null)} />}
      {dialog?.kind === "discard" && <ConfirmDialog title="Discard changes?" message="Revert this template to its last saved layout?" confirmLabel="Discard" danger onConfirm={() => { setDraft(savedLayout); setDialog(null); }} onCancel={() => setDialog(null)} />}
      {dialog?.kind === "switch" && <ConfirmDialog title="Switch template?" message="You have unsaved changes to this template. Switching will discard them." confirmLabel="Switch" danger onConfirm={() => { setSelectedId(dialog.id); setDialog(null); }} onCancel={() => setDialog(null)} />}
    </div>
  );
}

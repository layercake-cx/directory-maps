import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { listDirectoryGroups } from "../../lib/directories.js";
import { listCategorisations, appliesToEntries } from "../../lib/categorisations.js";
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
import PreviewBlock from "./EntryPreviewBlock.jsx";

const cardStyle = { border: "1px solid var(--lc-border)", borderRadius: 8, padding: "8px 10px", background: "#fff" };
const inputStyle = { width: "100%", boxSizing: "border-box", padding: "6px 9px", borderRadius: 7, border: "1px solid var(--lc-border)", fontSize: 13 };

function blockKey(block) {
  return block.type === "categorisation" ? `categorisation:${block.key}` : block.type;
}

export default function EntryLayoutDesigner({ directoryId, canManage, recordEvent }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const [templates, setTemplates] = useState([]);
  const [groups, setGroups] = useState([]);
  const [categorisations, setCategorisations] = useState([]);
  const [previewEntry, setPreviewEntry] = useState(null);
  const [previewExtras, setPreviewExtras] = useState({});

  const [selectedId, setSelectedId] = useState("default"); // "default" | template.id
  const [draft, setDraft] = useState(IMPLICIT_DEFAULT_LAYOUT);
  const [dragIndex, setDragIndex] = useState(null);

  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTarget, setNewTarget] = useState(""); // "group:<id>" | "term:<id>"

  const defaultTemplate = templates.find((t) => t.is_default) ?? null;
  const otherTemplates = templates.filter((t) => !t.is_default);
  const selectedTemplate = selectedId === "default" ? null : templates.find((t) => t.id === selectedId) ?? null;

  const entryCategorisations = useMemo(() => categorisations.filter((c) => appliesToEntries(c.applies_to)), [categorisations]);

  const load = useCallback(async () => {
    if (!directoryId) return;
    setLoading(true);
    setErr("");
    try {
      const [tpl, grp] = await Promise.all([listEntryTemplates(directoryId), listDirectoryGroups(directoryId)]);
      setTemplates(tpl);
      setGroups(grp);

      const { data: dir } = await supabase.from("directories").select("client_id").eq("id", directoryId).single();
      if (dir?.client_id) setCategorisations(await listCategorisations(dir.client_id));

      const { data: entries } = await supabase
        .from("directory_entries")
        .select("id, name, address, city, postcode, country, phone, email, website_url, logo_url, notes_html, allow_html, show_phone, show_email, show_website, show_address, directory_group_id")
        .eq("directory_id", directoryId)
        .eq("is_active", true)
        .order("name", { ascending: true })
        .limit(1);
      const entry = entries?.[0] ?? null;
      setPreviewEntry(entry);

      if (entry) {
        const [evidence, media, tiles, links, heldSchemeIds, schemes, entryTerms] = await Promise.all([
          listEvidenceItems(entry.id),
          listMediaAssets(entry.id),
          listProductTiles(entry.id),
          listProminentLinks({ entryId: entry.id }),
          loadEntryAccreditationSchemeIds(entry.id),
          listAccreditationSchemes(directoryId),
          supabase.from("entry_category_terms").select("category_terms(id, label, categorisation_id)").eq("entry_id", entry.id),
        ]);
        const accreditations = schemes.filter((s) => heldSchemeIds.includes(s.id));
        const termsByKey = {};
        for (const row of entryTerms.data ?? []) {
          const term = Array.isArray(row.category_terms) ? row.category_terms[0] : row.category_terms;
          if (!term) continue;
          const cat = categorisations.find((c) => c.id === term.categorisation_id);
          if (!cat) continue;
          (termsByKey[cat.key] ??= []).push(term);
        }
        setPreviewExtras({ evidence, media, tiles, links, accreditations, termsByKey });
      } else {
        setPreviewExtras({});
      }
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directoryId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (selectedId === "default") {
      setDraft(defaultTemplate ? defaultTemplate.layout_json : IMPLICIT_DEFAULT_LAYOUT);
    } else {
      setDraft(selectedTemplate ? selectedTemplate.layout_json : IMPLICIT_DEFAULT_LAYOUT);
    }
    setMsg("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, templates]);

  const availableToAdd = useMemo(() => {
    const present = new Set(draft.map(blockKey));
    const standard = BLOCK_TYPES.filter((b) => !present.has(b.type));
    const cats = entryCategorisations.filter((c) => !present.has(`categorisation:${c.key}`));
    return { standard, cats };
  }, [draft, entryCategorisations]);

  function addBlock(block) {
    setDraft((d) => [...d, block]);
  }

  function removeBlock(index) {
    setDraft((d) => d.filter((_, i) => i !== index));
  }

  function onDragStart(index) {
    setDragIndex(index);
  }
  function onDragOver(e) {
    e.preventDefault();
  }
  function onDrop(index) {
    if (dragIndex === null || dragIndex === index) return;
    setDraft((d) => {
      const next = [...d];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setDragIndex(null);
  }

  async function handleSave() {
    setErr("");
    setMsg("");
    try {
      setSaving(true);
      if (selectedId === "default") {
        await saveDefaultLayout(directoryId, draft);
        recordEvent?.("directory_entry_layout_updated", { directory_id: directoryId, template: "default", block_count: draft.length });
      } else {
        await updateTemplateLayout(selectedId, draft);
        recordEvent?.("directory_entry_layout_updated", { directory_id: directoryId, template_id: selectedId, block_count: draft.length });
      }
      setMsg("Layout saved. Republish for it to appear on the live site.");
      await load();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateTemplate(e) {
    e.preventDefault();
    setErr("");
    try {
      setSaving(true);
      const [kind, id] = newTarget.split(":");
      const created = await createTargetedTemplate({
        directoryId,
        name: newName,
        layoutJson: defaultTemplate ? defaultTemplate.layout_json : IMPLICIT_DEFAULT_LAYOUT,
        appliesToGroupId: kind === "group" ? id : null,
        appliesToTermId: kind === "term" ? id : null,
      });
      recordEvent?.("directory_entry_template_created", { directory_id: directoryId, template_id: created.id, name: created.name });
      setNewOpen(false);
      setNewName("");
      setNewTarget("");
      await load();
      setSelectedId(created.id);
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTemplate(template) {
    if (!window.confirm(`Delete template "${template.name}"? Entries it applied to will fall back to the default layout.`)) return;
    try {
      await deleteTargetedTemplate(template.id);
      recordEvent?.("directory_entry_template_deleted", { directory_id: directoryId, template_id: template.id, name: template.name });
      setSelectedId("default");
      await load();
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }

  if (!canManage) {
    return <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>Only an Owner or Manager can change the entry layout.</p>;
  }
  if (loading) return <p style={{ fontSize: 13, opacity: 0.6 }}>Loading…</p>;

  return (
    <div>
      {err && <p style={{ color: "#b91c1c", fontSize: 12, margin: "0 0 8px" }}>{err}</p>}
      {msg && <p style={{ color: "#15803d", fontSize: 12, margin: "0 0 8px" }}>{msg}</p>}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        <button
          type="button"
          className="btn"
          style={{ fontSize: 12, padding: "4px 10px", fontWeight: selectedId === "default" ? 700 : 400 }}
          onClick={() => setSelectedId("default")}
        >
          Default
        </button>
        {otherTemplates.map((t) => (
          <button
            key={t.id}
            type="button"
            className="btn"
            style={{ fontSize: 12, padding: "4px 10px", fontWeight: selectedId === t.id ? 700 : 400 }}
            onClick={() => setSelectedId(t.id)}
          >
            {t.name}
          </button>
        ))}
        <button type="button" className="btn" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => setNewOpen((v) => !v)}>
          {newOpen ? "Cancel" : "+ New template"}
        </button>
      </div>

      {newOpen && (
        <form onSubmit={handleCreateTemplate} style={{ display: "grid", gap: 8, marginBottom: 12, padding: 12, background: "#f9fafb", border: "1px solid var(--lc-border)", borderRadius: 8 }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Template name, e.g. Healthcare profile" style={inputStyle} required />
          <select value={newTarget} onChange={(e) => setNewTarget(e.target.value)} style={inputStyle} required>
            <option value="">Applies to…</option>
            {groups.length > 0 && (
              <optgroup label="Group">
                {groups.map((g) => <option key={g.id} value={`group:${g.id}`}>{g.name}</option>)}
              </optgroup>
            )}
            {entryCategorisations.map((c) => (
              <optgroup key={c.id} label={c.label}>
                {(c.terms ?? []).map((t) => <option key={t.id} value={`term:${t.id}`}>{t.label}</option>)}
              </optgroup>
            ))}
          </select>
          <div>
            <button type="submit" className="btn btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} disabled={saving}>
              {saving ? "Creating…" : "Create template"}
            </button>
          </div>
        </form>
      )}

      {selectedTemplate && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <button type="button" className="btn" style={{ fontSize: 12, padding: "3px 8px", color: "#b91c1c" }} onClick={() => handleDeleteTemplate(selectedTemplate)}>
            Delete this template
          </button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 600, opacity: 0.7 }}>Blocks (drag to reorder)</p>
          <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
            {draft.map((block, i) => (
              <div
                key={`${blockKey(block)}-${i}`}
                draggable
                onDragStart={() => onDragStart(i)}
                onDragOver={onDragOver}
                onDrop={() => onDrop(i)}
                style={{ ...cardStyle, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "grab", opacity: dragIndex === i ? 0.4 : 1 }}
              >
                <span style={{ fontSize: 13 }}>
                  <span style={{ opacity: 0.4, marginRight: 8 }}>⠿</span>
                  {block.type === "categorisation" ? `Tags: ${block.key}` : blockLabel(block.type)}
                </span>
                <button type="button" className="btn" style={{ fontSize: 11, padding: "2px 6px" }} onClick={() => removeBlock(i)}>
                  Remove
                </button>
              </div>
            ))}
            {draft.length === 0 && <p style={{ fontSize: 12, opacity: 0.6 }}>No blocks — add one below.</p>}
          </div>

          {(availableToAdd.standard.length > 0 || availableToAdd.cats.length > 0) && (
            <select
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                if (v.startsWith("cat:")) addBlock({ type: "categorisation", key: v.slice(4) });
                else addBlock({ type: v });
              }}
              style={inputStyle}
            >
              <option value="">+ Add a block…</option>
              {availableToAdd.standard.map((b) => <option key={b.type} value={b.type}>{b.label}</option>)}
              {availableToAdd.cats.map((c) => <option key={c.key} value={`cat:${c.key}`}>Tags: {c.label}</option>)}
            </select>
          )}

          <div style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save layout"}
            </button>
          </div>
        </div>

        <div>
          <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 600, opacity: 0.7 }}>
            Live preview {previewEntry ? `— ${previewEntry.name}` : "(placeholder — no entries yet)"}
          </p>
          <div style={{ border: "1px solid var(--lc-border)", borderRadius: 8, padding: 12, background: "#fff", maxHeight: 420, overflowY: "auto" }}>
            {draft.map((block, i) => (
              <PreviewBlock key={`${blockKey(block)}-${i}`} block={block} entry={previewEntry} extras={previewExtras} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

import AIButton from "../../ai/AIButton.jsx";
import AiProvenanceNote from "../../ai/AiProvenanceNote.jsx";
import React, { useState } from "react";
import { Button, Callout, Checkbox, Field, FieldGrid, Section, Select, TextInput, Textarea, useConfirm } from "../../ui/index.js";
import "../../../styles/wave-a/batch-2.css";
import { useAiFeature } from "../../../hooks/useAiFeature.js";
import AiUnavailableNotice from "../../../components/ai/AiUnavailableNotice.jsx";
import { updateDirectoryEntry, generateEntrySeoMetadata } from "../../../lib/directories.js";

const STRUCTURED_DATA_TYPES = ["LocalBusiness", "Organization", "Person"];
const TWITTER_CARD_TYPES = [
  { value: "", label: "None" },
  { value: "summary", label: "Summary" },
  { value: "summary_large_image", label: "Summary with large image" },
];

function buildForm(entry) {
  return {
    meta_title: entry?.meta_title || "",
    meta_description: entry?.meta_description || "",
    noindex: !!entry?.noindex,
    structured_data_type: entry?.structured_data_type || "",
    sitemap_priority: entry?.sitemap_priority ?? "",
    og_title: entry?.og_title || "",
    og_description: entry?.og_description || "",
    og_image_url: entry?.og_image_url || "",
    twitter_card_type: entry?.twitter_card_type || "",
    canonical_url: entry?.canonical_url || "",
    keywords: entry?.keywords || "",
    ai_summary: entry?.ai_summary || "",
  };
}

const AI_DRAFT_FIELDS = ["meta_title", "meta_description", "keywords", "og_title", "og_description", "ai_summary"];

/**
 * Search & metadata tab. Covers the original search-engine SEO columns
 * (meta_title/meta_description/noindex/structured_data_type/sitemap_priority,
 * DIR-E2) plus the social/AI columns added in Phase 4 (og_title,
 * og_description, og_image_url, twitter_card_type, canonical_url, keywords,
 * ai_summary — see 20260829150000). "Generate with AI" drafts
 * AI_DRAFT_FIELDS from generate_entry_seo_metadata (Directory Searchability
 * & AI Metadata plan, Phase 2) — landed in this form's state only, never
 * auto-saved.
 */
export default function EntrySeoTab({ directoryId, entryId, entry, canEdit, recordEvent, onSaved }) {
  const ai = useAiFeature("seo_metadata");
  const confirm = useConfirm();
  const [form, setForm] = useState(() => buildForm(entry));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function fSet(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleGenerate() {
    const hasExisting = AI_DRAFT_FIELDS.some((key) => form[key]?.trim());
    if (hasExisting && !(await confirm({
      title: "Replace the current metadata?",
      body: "This entry already has metadata in one or more of these fields. Generating with AI will overwrite it here in the editor. Nothing is saved until you click Save metadata.",
      confirmLabel: "Generate and replace",
      tone: "danger",
    }))) {
      return false;
    }
    setErr("");
    try {
      recordEvent?.("directory_ai_content_requested", { directory_id: directoryId, entry_id: entryId, target: "entry_seo_metadata" });
      const draft = await generateEntrySeoMetadata(entryId);
      setForm((f) => ({ ...f, ...Object.fromEntries(AI_DRAFT_FIELDS.map((key) => [key, draft?.[key] ?? f[key]])) }));
      recordEvent?.("directory_ai_content_generated", { directory_id: directoryId, entry_id: entryId, target: "entry_seo_metadata" });
    } catch (e) {
      recordEvent?.("directory_ai_content_failed", { directory_id: directoryId, entry_id: entryId, target: "entry_seo_metadata", error: e?.message ?? String(e) });
      setErr(e?.message ?? String(e));
      return false;
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setErr("");
    try {
      setSaving(true);
      await updateDirectoryEntry(entryId, {
        meta_title: form.meta_title || null,
        meta_description: form.meta_description || null,
        noindex: form.noindex,
        structured_data_type: form.structured_data_type || null,
        sitemap_priority: form.sitemap_priority === "" ? null : Number(form.sitemap_priority),
        og_title: form.og_title || null,
        og_description: form.og_description || null,
        og_image_url: form.og_image_url || null,
        twitter_card_type: form.twitter_card_type || null,
        canonical_url: form.canonical_url || null,
        keywords: form.keywords || null,
        ai_summary: form.ai_summary || null,
      });
      recordEvent?.("directory_entry_updated", { directory_id: directoryId, entry_id: entryId });
      onSaved?.();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="editor-form">
      <Section
        title="Search engines"
        actions={canEdit ? <AIButton compact onGenerate={handleGenerate} disabled={!ai.available} /> : null}
      >
        {canEdit && !ai.available && <AiUnavailableNotice message={ai.message} href={ai.integrationsHref} />}
        <AiProvenanceNote entityName="entry" compact>Drafts every field below (including Social &amp; AI) from this entry's own data, using a built-in drafting prompt. It lands here for review; nothing is saved until you click Save metadata.</AiProvenanceNote>
        {entry?.seo_metadata_ai_generated_at && (
          <Callout tone="info">
            Some of these fields were auto-drafted by AI when this entry was published on {new Date(entry.seo_metadata_ai_generated_at).toLocaleDateString()} — worth checking over.
          </Callout>
        )}
        <Field label="Meta title">
          <TextInput value={form.meta_title} onChange={(e) => fSet("meta_title", e.target.value)} disabled={!canEdit} placeholder="Defaults to entry name if left blank" />
        </Field>
        <Field label="Meta description">
          <Textarea value={form.meta_description} onChange={(e) => fSet("meta_description", e.target.value)} disabled={!canEdit} rows={3} />
        </Field>
        <Field label="Keywords">
          <TextInput value={form.keywords} onChange={(e) => fSet("keywords", e.target.value)} disabled={!canEdit} placeholder="comma, separated, terms" />
        </Field>
        <Field label="Canonical URL">
          <TextInput value={form.canonical_url} onChange={(e) => fSet("canonical_url", e.target.value)} disabled={!canEdit} placeholder="Defaults to this entry's own page URL" type="url" />
        </Field>
        <FieldGrid>
          <Field label="Structured data type">
            <Select value={form.structured_data_type} onChange={(e) => fSet("structured_data_type", e.target.value)} disabled={!canEdit}>
              <option value="">Default</option>
              {STRUCTURED_DATA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Sitemap priority (0–1)">
            <TextInput value={form.sitemap_priority} onChange={(e) => fSet("sitemap_priority", e.target.value)} disabled={!canEdit} type="number" min="0" max="1" step="0.1" />
          </Field>
        </FieldGrid>
        <Checkbox label="Hide from search engines (noindex)" checked={form.noindex} onChange={(e) => fSet("noindex", e.target.checked)} disabled={!canEdit} />
      </Section>

      <Section title="Social & AI" description="Shown when this entry's page is shared on social media, and as a summary for AI assistants/search.">
        <Field label="Social title">
          <TextInput value={form.og_title} onChange={(e) => fSet("og_title", e.target.value)} disabled={!canEdit} placeholder="Defaults to meta title / entry name" />
        </Field>
        <Field label="Social description">
          <Textarea value={form.og_description} onChange={(e) => fSet("og_description", e.target.value)} disabled={!canEdit} rows={2} placeholder="Defaults to meta description" />
        </Field>
        <Field label="Social share image URL">
          <TextInput value={form.og_image_url} onChange={(e) => fSet("og_image_url", e.target.value)} disabled={!canEdit} placeholder="Defaults to logo" type="url" />
        </Field>
        <Field label="Twitter card type">
          <Select value={form.twitter_card_type} onChange={(e) => fSet("twitter_card_type", e.target.value)} disabled={!canEdit} options={TWITTER_CARD_TYPES} />
        </Field>
        <Field label="AI summary">
          <Textarea value={form.ai_summary} onChange={(e) => fSet("ai_summary", e.target.value)} disabled={!canEdit} rows={3} placeholder="A plain-language summary for AI assistants — separate from the human-facing meta description" />
        </Field>
      </Section>

      {err && <Callout tone="danger">{err}</Callout>}

      {canEdit && (
        <div className="editor-actions">
          <Button variant="primary" type="submit" loading={saving} loadingLabel="Saving…">Save metadata</Button>
        </div>
      )}
    </form>
  );
}

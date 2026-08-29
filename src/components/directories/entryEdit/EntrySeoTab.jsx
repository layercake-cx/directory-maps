import React, { useState } from "react";
import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { updateDirectoryEntry } from "../../../lib/directories.js";

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid var(--lc-border)",
  fontSize: 13,
};
const labelStyle = { fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 };

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

/**
 * Search & metadata tab. Covers the original search-engine SEO columns
 * (meta_title/meta_description/noindex/structured_data_type/sitemap_priority,
 * DIR-E2) plus the social/AI columns added in Phase 4 (og_title,
 * og_description, og_image_url, twitter_card_type, canonical_url, keywords,
 * ai_summary — see 20260829150000).
 */
export default function EntrySeoTab({ directoryId, entryId, entry, canEdit, recordEvent, onSaved }) {
  const [form, setForm] = useState(() => buildForm(entry));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function fSet(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
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
    <form onSubmit={handleSave} style={{ display: "grid", gap: 20 }}>
      <div className="admin-card" style={{ padding: 20, maxWidth: 560 }}>
        <Stack gap="sm">
          <Text size="sm" fw={600}>Search engines</Text>
          <div>
            <label style={labelStyle}>Meta title</label>
            <input value={form.meta_title} onChange={(e) => fSet("meta_title", e.target.value)} disabled={!canEdit} placeholder="Defaults to entry name if left blank" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Meta description</label>
            <textarea value={form.meta_description} onChange={(e) => fSet("meta_description", e.target.value)} disabled={!canEdit} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
          </div>
          <div>
            <label style={labelStyle}>Keywords</label>
            <input value={form.keywords} onChange={(e) => fSet("keywords", e.target.value)} disabled={!canEdit} placeholder="comma, separated, terms" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Canonical URL</label>
            <input value={form.canonical_url} onChange={(e) => fSet("canonical_url", e.target.value)} disabled={!canEdit} placeholder="Defaults to this entry's own page URL" type="url" style={inputStyle} />
          </div>
          <Group gap="sm" grow>
            <div>
              <label style={labelStyle}>Structured data type</label>
              <select value={form.structured_data_type} onChange={(e) => fSet("structured_data_type", e.target.value)} disabled={!canEdit} style={inputStyle}>
                <option value="">Default</option>
                {STRUCTURED_DATA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Sitemap priority (0–1)</label>
              <input value={form.sitemap_priority} onChange={(e) => fSet("sitemap_priority", e.target.value)} disabled={!canEdit} type="number" min="0" max="1" step="0.1" style={inputStyle} />
            </div>
          </Group>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: canEdit ? "pointer" : "default" }}>
            <input type="checkbox" checked={form.noindex} onChange={(e) => fSet("noindex", e.target.checked)} disabled={!canEdit} />
            Hide from search engines (noindex)
          </label>
        </Stack>
      </div>

      <div className="admin-card" style={{ padding: 20, maxWidth: 560 }}>
        <Stack gap="sm">
          <Text size="sm" fw={600}>Social & AI</Text>
          <Text size="xs" c="dimmed">Shown when this entry's page is shared on social media, and as a summary for AI assistants/search.</Text>
          <div>
            <label style={labelStyle}>Social title</label>
            <input value={form.og_title} onChange={(e) => fSet("og_title", e.target.value)} disabled={!canEdit} placeholder="Defaults to meta title / entry name" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Social description</label>
            <textarea value={form.og_description} onChange={(e) => fSet("og_description", e.target.value)} disabled={!canEdit} rows={2} placeholder="Defaults to meta description" style={{ ...inputStyle, resize: "vertical" }} />
          </div>
          <div>
            <label style={labelStyle}>Social share image URL</label>
            <input value={form.og_image_url} onChange={(e) => fSet("og_image_url", e.target.value)} disabled={!canEdit} placeholder="Defaults to logo" type="url" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Twitter card type</label>
            <select value={form.twitter_card_type} onChange={(e) => fSet("twitter_card_type", e.target.value)} disabled={!canEdit} style={inputStyle}>
              {TWITTER_CARD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>AI summary</label>
            <textarea value={form.ai_summary} onChange={(e) => fSet("ai_summary", e.target.value)} disabled={!canEdit} rows={3} placeholder="A plain-language summary for AI assistants — separate from the human-facing meta description" style={{ ...inputStyle, resize: "vertical" }} />
          </div>
        </Stack>
      </div>

      {err && <Alert color="red" variant="light" style={{ maxWidth: 560 }}>{err}</Alert>}

      {canEdit && (
        <Group justify="flex-end" style={{ maxWidth: 560 }}>
          <Button size="sm" type="submit" loading={saving}>Save metadata</Button>
        </Group>
      )}
    </form>
  );
}

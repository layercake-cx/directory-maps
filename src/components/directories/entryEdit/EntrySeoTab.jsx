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

function buildForm(entry) {
  return {
    meta_title: entry?.meta_title || "",
    meta_description: entry?.meta_description || "",
    noindex: !!entry?.noindex,
    structured_data_type: entry?.structured_data_type || "",
    sitemap_priority: entry?.sitemap_priority ?? "",
  };
}

/**
 * Search & metadata tab. Wires up the SEO columns already on directory_entries
 * (meta_title/meta_description/noindex/structured_data_type/sitemap_priority),
 * which existed in the schema but had no editing UI until now. Open Graph /
 * Twitter card / canonical URL / keywords / AI-summary fields need new
 * columns and land in a later phase.
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
    <form onSubmit={handleSave} className="admin-card" style={{ padding: 20, maxWidth: 560 }}>
      <Stack gap="sm">
        <Text size="sm" fw={600}>Search engine metadata</Text>
        <Text size="xs" c="dimmed">
          Social (Open Graph/Twitter) and AI-facing summary fields are coming in a later phase.
        </Text>
        <div>
          <label style={labelStyle}>Meta title</label>
          <input value={form.meta_title} onChange={(e) => fSet("meta_title", e.target.value)} disabled={!canEdit} placeholder="Defaults to entry name if left blank" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Meta description</label>
          <textarea value={form.meta_description} onChange={(e) => fSet("meta_description", e.target.value)} disabled={!canEdit} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
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

        {err && <Alert color="red" variant="light">{err}</Alert>}

        {canEdit && (
          <Group justify="flex-end" mt={4}>
            <Button size="sm" type="submit" loading={saving}>Save metadata</Button>
          </Group>
        )}
      </Stack>
    </form>
  );
}

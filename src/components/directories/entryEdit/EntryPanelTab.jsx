import React, { useEffect, useState } from "react";
import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { getDirectory, updateDirectoryEntry } from "../../../lib/directories.js";
import { uploadEntryPanelImage } from "../../../lib/entryImages.js";
import EntryCardPreview from "./EntryCardPreview.jsx";

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid var(--lc-border)",
  fontSize: 13,
};
const labelStyle = { fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 };

const BG_SWATCHES = [
  { label: "None", value: "" },
  { label: "Light", value: "#d4d4d4" },
  { label: "Mid", value: "#737373" },
  { label: "Dark", value: "#1a1a1a" },
];

const DEFAULT_THEME_SURFACE_ALT = "#F1ECDF"; // matches generate_directory_site's NATURAL_DEFAULTS.surfaceAltColor

/**
 * Panel Style tab — an optional override for the homepage card's image and
 * background (e.g. a white logo that needs a dark background instead of
 * the directory's default themed surface). Falls back to logo_url and the
 * directory's own theme when unset; live preview approximates the actual
 * .card-logo-box markup/CSS from generate_directory_site/index.ts.
 */
export default function EntryPanelTab({ directoryId, entryId, entry, canEdit, recordEvent, onSaved }) {
  const [form, setForm] = useState({
    panel_image_url: entry?.panel_image_url || "",
    panel_background_color: entry?.panel_background_color || "",
  });
  const [themeSurfaceAlt, setThemeSurfaceAlt] = useState(DEFAULT_THEME_SURFACE_ALT);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!directoryId) return;
    getDirectory(directoryId)
      .then((d) => setThemeSurfaceAlt(d?.theme_json?.surfaceAltColor || DEFAULT_THEME_SURFACE_ALT))
      .catch(() => {});
  }, [directoryId]);

  function fSet(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleImageFile(e) {
    const file = e?.target?.files?.[0];
    if (!file) return;
    setErr("");
    setUploading(true);
    try {
      const url = await uploadEntryPanelImage(entryId, file);
      fSet("panel_image_url", url);
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setErr("");
    try {
      setSaving(true);
      await updateDirectoryEntry(entryId, {
        panel_image_url: form.panel_image_url || null,
        panel_background_color: form.panel_background_color || null,
      });
      recordEvent?.("directory_entry_updated", { directory_id: directoryId, entry_id: entryId });
      onSaved?.();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  const previewImage = form.panel_image_url || entry?.logo_url || "";
  const previewBg = form.panel_background_color || themeSurfaceAlt;

  return (
    <form onSubmit={handleSave} style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
      <div className="admin-card" style={{ padding: 20, maxWidth: 400, flex: 1 }}>
        <Stack gap="sm">
          <Text size="sm" fw={600}>Panel style</Text>
          <Text size="xs" c="dimmed">
            Overrides the image and background of this entry's card on the directory homepage. Leave blank to use the logo and the directory's own theme.
          </Text>

          <div>
            <label style={labelStyle}>Panel image</label>
            <input value={form.panel_image_url} onChange={(e) => fSet("panel_image_url", e.target.value)} disabled={!canEdit} placeholder={entry?.logo_url ? "Defaults to the logo" : "https://…/image.png"} type="url" style={inputStyle} />
            {canEdit && (
              <label style={{ display: "inline-block", marginTop: 6, fontSize: 12 }}>
                <span style={{ color: "var(--lc-brand, #4a9baa)", textDecoration: "underline", cursor: "pointer" }}>
                  {uploading ? "Uploading…" : "Upload an image"}
                </span>
                <input type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={handleImageFile} disabled={uploading} style={{ display: "none" }} />
              </label>
            )}
            <Text size="xs" c="dimmed" mt={4}>PNG, JPG or WebP, max 2 MB.</Text>
          </div>

          <div>
            <label style={labelStyle}>Panel background colour</label>
            <Group gap={6} mb={6}>
              {BG_SWATCHES.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => fSet("panel_background_color", s.value)}
                  title={s.label}
                  style={{
                    width: 26, height: 26, borderRadius: 6, cursor: canEdit ? "pointer" : "default",
                    border: form.panel_background_color === s.value ? "2px solid var(--lc-brand, #4a9baa)" : "1px solid var(--lc-border)",
                    background: s.value || "repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 50% / 10px 10px",
                  }}
                />
              ))}
            </Group>
            <input value={form.panel_background_color} onChange={(e) => fSet("panel_background_color", e.target.value)} disabled={!canEdit} placeholder="Defaults to the directory theme, e.g. #1a1a1a" style={inputStyle} />
          </div>

          {err && <Alert color="red" variant="light">{err}</Alert>}

          {canEdit && (
            <Group justify="flex-end" mt={4}>
              <Button size="sm" type="submit" loading={saving}>Save panel style</Button>
            </Group>
          )}
        </Stack>
      </div>

      <div className="admin-card" style={{ padding: 20 }}>
        <Text size="sm" fw={600} mb={10}>Preview</Text>
        <EntryCardPreview name={entry?.name} imageUrl={previewImage} backgroundColor={previewBg} />
        <Text size="xs" c="dimmed" mt={8}>Approximates the homepage card — actual fonts/spacing come from the directory's theme.</Text>
      </div>
    </form>
  );
}

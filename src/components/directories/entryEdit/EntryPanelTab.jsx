import React, { useEffect, useState } from "react";
import { getDirectory, updateDirectoryEntry } from "../../../lib/directories.js";
import { uploadEntryPanelImage } from "../../../lib/entryImages.js";
import EntryCardPreview from "./EntryCardPreview.jsx";
import { Button, Callout, Field, Section, TextInput } from "../../ui/index.js";
import "../../../styles/wave-a/batch-2.css";

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
    <form onSubmit={handleSave} className="panel-tab-grid">
      <Section
        title="Panel style"
        description="Overrides the image and background of this entry's card on the directory homepage. Leave blank to use the logo and the directory's own theme."
        footer={canEdit ? <Button variant="primary" type="submit" loading={saving} loadingLabel="Saving…">Save panel style</Button> : null}
      >
        <div className="editor-stack">
          <Field label="Panel image" hint="PNG, JPG or WebP, max 2 MB.">
            <TextInput value={form.panel_image_url} onChange={(e) => fSet("panel_image_url", e.target.value)} disabled={!canEdit} placeholder={entry?.logo_url ? "Defaults to the logo" : "https://…/image.png"} type="url" />
          </Field>
          {canEdit && (
            <div className="upload-row">
              <label className="shell-btn shell-btn--sm file-btn" aria-disabled={uploading ? "true" : undefined}>
                {uploading ? "Uploading…" : "Upload an image"}
                <input type="file" className="sr-only" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={handleImageFile} disabled={uploading} />
              </label>
            </div>
          )}
        </div>

        <div className="editor-stack">
          <Field label="Panel background colour">
            <TextInput value={form.panel_background_color} onChange={(e) => fSet("panel_background_color", e.target.value)} disabled={!canEdit} placeholder="Defaults to the directory theme, e.g. #1a1a1a" />
          </Field>
          <div className="swatch-row" role="group" aria-label="Background colour presets">
            {BG_SWATCHES.map((s) => (
              <button
                key={s.label}
                type="button"
                disabled={!canEdit}
                onClick={() => fSet("panel_background_color", s.value)}
                title={s.label}
                aria-label={s.label}
                aria-pressed={form.panel_background_color === s.value}
                className={`swatch-choice ${s.value ? "" : "swatch-choice--none"}`.trim()}
                style={s.value ? { background: s.value } : undefined /* dynamic: each preset previews its own colour */}
              />
            ))}
          </div>
        </div>

        {err && <Callout tone="danger">{err}</Callout>}
      </Section>

      <Section title="Preview" description="Approximates the homepage card — actual fonts/spacing come from the directory's theme.">
        <EntryCardPreview name={entry?.name} imageUrl={previewImage} backgroundColor={previewBg} />
      </Section>
    </form>
  );
}

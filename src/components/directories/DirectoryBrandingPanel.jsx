import React, { useEffect, useState } from "react";
import { updateDirectory } from "../../lib/directories.js";
import { DIRECTORY_THEME_PRESETS, NATURAL, FONT_CATALOG, getThemePreset } from "../../lib/directoryThemePresets.js";

const inputStyle = { width: "100%", boxSizing: "border-box", padding: "6px 9px", borderRadius: 7, border: "1px solid var(--lc-border)", fontSize: 13 };
const colorRowStyle = { display: "flex", alignItems: "center", gap: 8 };

const FONT_OPTIONS = Object.keys(FONT_CATALOG);

const FIELD_KEYS = [
  "primaryColor",
  "primaryDarkColor",
  "accentColor",
  "backgroundColor",
  "surfaceColor",
  "surfaceAltColor",
  "inkColor",
  "mutedColor",
  "lineColor",
  "sageColor",
  "sageInkColor",
  "goldColor",
  "tealColor",
  "fontHeading",
  "fontBody",
];

function themeFromDirectory(directory) {
  const t = directory?.theme_json && typeof directory.theme_json === "object" ? directory.theme_json : {};
  const next = {};
  for (const key of FIELD_KEYS) next[key] = t[key] || NATURAL[key];
  next.logoUrl = t.logoUrl || "";
  return next;
}

function ColorField({ label, value, onChange }) {
  return (
    <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
      <span>{label}</span>
      <div style={colorRowStyle}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        <input value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
      </div>
    </label>
  );
}

/**
 * Directory branding (build-scope §5.1 "Theme: token overrides ... logo").
 * A named preset (DIRECTORY_THEME_PRESETS) bulk-fills every field below —
 * picking one is a convenience, not a persisted concept: theme_json always
 * stores the flat resolved field values generate_directory_site reads, so
 * every field stays independently editable after applying a preset.
 */
export default function DirectoryBrandingPanel({ directory, directoryId, canManage, recordEvent, onSaved }) {
  const [theme, setTheme] = useState(() => themeFromDirectory(directory));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setTheme(themeFromDirectory(directory));
  }, [directory]);

  function set(key, value) {
    setTheme((t) => ({ ...t, [key]: value }));
    setMsg("");
  }

  function applyPreset(key) {
    const values = getThemePreset(key);
    if (!values) return;
    setTheme((t) => ({ ...t, ...values }));
    setMsg("");
  }

  async function save(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    try {
      setSaving(true);
      const next = { ...theme, logoUrl: theme.logoUrl.trim() };
      await updateDirectory(directoryId, { theme_json: next });
      recordEvent?.("directory_branding_updated", { directory_id: directoryId, has_logo: !!next.logoUrl });
      setMsg("Branding saved. Republish for it to appear on the live site.");
      onSaved?.();
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) {
    return <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>Only an Owner or Manager can change branding.</p>;
  }

  return (
    <form onSubmit={save} style={{ display: "grid", gap: 12 }}>
      {err && <p style={{ color: "#b91c1c", fontSize: 12, margin: 0 }}>{err}</p>}
      {msg && <p style={{ color: "#15803d", fontSize: 12, margin: 0 }}>{msg}</p>}

      <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
        <span>Theme preset</span>
        <select defaultValue="" onChange={(e) => applyPreset(e.target.value)} style={inputStyle}>
          <option value="">Choose a preset to start from…</option>
          {DIRECTORY_THEME_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label} — {p.description}
            </option>
          ))}
        </select>
      </label>

      <ColorField label="Primary colour (links, buttons)" value={theme.primaryColor} onChange={(v) => set("primaryColor", v)} />
      <ColorField label="Accent colour (highlights, AI search icon)" value={theme.accentColor} onChange={(v) => set("accentColor", v)} />
      <ColorField label="Background colour" value={theme.backgroundColor} onChange={(v) => set("backgroundColor", v)} />

      <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
        <span>Logo URL (optional)</span>
        <input
          type="url"
          value={theme.logoUrl}
          onChange={(e) => set("logoUrl", e.target.value)}
          placeholder="https://yourcompany.com/logo.png"
          style={inputStyle}
        />
      </label>

      <button
        type="button"
        className="btn"
        style={{ fontSize: 12, padding: "3px 10px", justifySelf: "start" }}
        onClick={() => setAdvancedOpen((v) => !v)}
      >
        {advancedOpen ? "Hide advanced colours" : "Advanced colours…"}
      </button>

      {advancedOpen && (
        <div style={{ display: "grid", gap: 10, padding: 12, background: "#f9fafb", border: "1px solid var(--lc-border)", borderRadius: 8 }}>
          <ColorField label="Primary (dark variant)" value={theme.primaryDarkColor} onChange={(v) => set("primaryDarkColor", v)} />
          <ColorField label="Surface" value={theme.surfaceColor} onChange={(v) => set("surfaceColor", v)} />
          <ColorField label="Surface (alt)" value={theme.surfaceAltColor} onChange={(v) => set("surfaceAltColor", v)} />
          <ColorField label="Text (ink)" value={theme.inkColor} onChange={(v) => set("inkColor", v)} />
          <ColorField label="Muted text" value={theme.mutedColor} onChange={(v) => set("mutedColor", v)} />
          <ColorField label="Border / line" value={theme.lineColor} onChange={(v) => set("lineColor", v)} />
          <ColorField label="Sage (badge background)" value={theme.sageColor} onChange={(v) => set("sageColor", v)} />
          <ColorField label="Sage (badge text)" value={theme.sageInkColor} onChange={(v) => set("sageInkColor", v)} />
          <ColorField label="Gold (ratings, highlights)" value={theme.goldColor} onChange={(v) => set("goldColor", v)} />
          <ColorField label="Teal (footer accent)" value={theme.tealColor} onChange={(v) => set("tealColor", v)} />

          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            <span>Heading font</span>
            <select value={theme.fontHeading} onChange={(e) => set("fontHeading", e.target.value)} style={inputStyle}>
              {FONT_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            <span>Body font</span>
            <select value={theme.fontBody} onChange={(e) => set("fontBody", e.target.value)} style={inputStyle}>
              {FONT_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div>
        <button type="submit" className="btn btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} disabled={saving}>
          {saving ? "Saving…" : "Save branding"}
        </button>
      </div>
    </form>
  );
}

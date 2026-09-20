import React, { useEffect, useRef, useState } from "react";
import { updateDirectory } from "../../lib/directories.js";
import {
  DIRECTORY_THEME_PRESETS,
  NATURAL,
  FONT_CATALOG,
  getThemePreset,
  listOrgPresets,
  saveThemePreset,
  renameThemePreset,
  deleteThemePreset,
} from "../../lib/directoryThemePresets.js";
import { uploadDirectoryLogo } from "../../lib/directoryBranding.js";
import { checkContrast } from "../../lib/colorContrast.js";

const inputStyle = { width: "100%", boxSizing: "border-box", padding: "6px 9px", borderRadius: 7, border: "1px solid var(--lc-border)", fontSize: 13 };
const colorRowStyle = { display: "flex", alignItems: "center", gap: 8 };
const sectionStyle = { display: "grid", gap: 10, padding: 12, background: "#f9fafb", border: "1px solid var(--lc-border)", borderRadius: 8 };

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

// Mirrors generate_directory_site/builders.ts's HEADER_BG_DEFAULT/
// FOOTER_BG_DEFAULT/FOOTER_TEXT_DEFAULT/FOOTER_LINK_DEFAULT — hand-synced
// across the JS/Deno runtime boundary, same as FONT_CATALOG already is.
// An unset region must preview exactly what the public site renders.
const HEADER_BG_DEFAULT = { type: "solid", color: "rgba(255,255,255,.6)" };
const FOOTER_BG_DEFAULT = { type: "solid", color: "#0E3A34" };
const FOOTER_TEXT_DEFAULT = "#FFFFFF";
const FOOTER_LINK_DEFAULT = "#CFE3DE";
const FONT_SIZE_BASE_DEFAULT = "16px";
const FONT_SIZE_H1_DEFAULT = "2.5rem";
const FONT_SIZE_H2_DEFAULT = "2rem";
const FONT_SIZE_H3_DEFAULT = "1.5rem";

function themeFromDirectory(directory) {
  const t = directory?.theme_json && typeof directory.theme_json === "object" ? directory.theme_json : {};
  const next = {};
  for (const key of FIELD_KEYS) next[key] = t[key] || NATURAL[key];
  next.logoUrl = t.logoUrl || "";
  next.headerBackground = t.headerBackground || HEADER_BG_DEFAULT;
  next.headerText = t.headerText || next.inkColor;
  next.footerBackground = t.footerBackground || FOOTER_BG_DEFAULT;
  next.footerText = t.footerText || FOOTER_TEXT_DEFAULT;
  next.footerLink = t.footerLink || FOOTER_LINK_DEFAULT;
  next.footerLinkHover = t.footerLinkHover || next.footerLink;
  next.fontSizeBase = t.fontSizeBase || FONT_SIZE_BASE_DEFAULT;
  next.fontSizeH1 = t.fontSizeH1 || FONT_SIZE_H1_DEFAULT;
  next.fontSizeH2 = t.fontSizeH2 || FONT_SIZE_H2_DEFAULT;
  next.fontSizeH3 = t.fontSizeH3 || FONT_SIZE_H3_DEFAULT;
  next.headerMode = t.headerMode === "logo" || t.headerMode === "text" ? t.headerMode : "logoText";
  next.showHeaderTitle = typeof t.showHeaderTitle === "boolean" ? t.showHeaderTitle : next.headerMode !== "logo";
  next.siteTitle = t.siteTitle || "";
  next.logoMaxHeight = typeof t.logoMaxHeight === "number" && t.logoMaxHeight > 0 ? t.logoMaxHeight : 42;
  return next;
}

// A theme field only ever holds the unit its own field writes (px for
// base, rem for headings) — if a stored value somehow has a different
// unit (e.g. hand-edited via the API), fall back to the default amount
// rather than reinterpreting the number in the wrong unit.
function lengthAmount(cssLength, unit, fallbackAmount) {
  const m = /^(-?\d*\.?\d+)(px|rem|em|%)$/.exec(cssLength || "");
  return m && m[2] === unit ? Number(m[1]) : fallbackAmount;
}

function OnOffSwitch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={checked ? "On — click to hide" : "Off — click to show"}
      onClick={() => onChange(!checked)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        cursor: "pointer",
        width: 36,
        height: 20,
        borderRadius: 10,
        border: "none",
        padding: "0 2px",
        background: checked ? "#22c55e" : "#d1d5db",
        transition: "background 150ms ease",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: "block",
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          transform: checked ? "translateX(16px)" : "translateX(0)",
          transition: "transform 150ms ease",
        }}
      />
    </button>
  );
}

function FontSizeField({ label, value, onChange, unit, min, max, step, fallbackAmount }) {
  const amount = lengthAmount(value, unit, fallbackAmount);
  return (
    <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
      <span>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={amount}
          onChange={(e) => onChange(`${Math.min(max, Math.max(min, Number(e.target.value)))}${unit}`)}
          style={{ ...inputStyle, width: 90 }}
        />
        <span style={{ fontSize: 12, opacity: 0.6 }}>{unit}</span>
      </div>
    </label>
  );
}

// Resolves a region background to a CSS `background` value for the live
// preview only — not the source of truth for the public site (that's
// resolveRegionBackground() in generate_directory_site/builders.ts, which
// this deliberately mirrors so the preview matches what gets published).
function backgroundToCss(bg, fallbackColor) {
  if (!bg || bg.type !== "gradient") return bg?.color || fallbackColor;
  const stops = (bg.gradient?.stops || []).filter((s) => s && typeof s.position === "number");
  if (stops.length < 2) return bg.color || fallbackColor;
  const stopList = stops.map((s) => `${s.color || fallbackColor} ${Math.min(100, Math.max(0, s.position))}%`).join(", ");
  if (bg.gradient?.type === "radial") return `radial-gradient(circle, ${stopList})`;
  const angle = typeof bg.gradient?.angle === "number" ? bg.gradient.angle : 135;
  return `linear-gradient(${angle}deg, ${stopList})`;
}

/** Pass/warn indicator (dev spec §12) — warns, never blocks. `contrast` is
 * checkContrast()'s result, or null/undefined to render nothing (e.g. the
 * background isn't a plain hex, such as the header's translucent default). */
function ContrastBadge({ contrast }) {
  if (!contrast) return null;
  const { ratio, passesAA } = contrast;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: passesAA ? "#15803d" : "#b45309",
        whiteSpace: "nowrap",
      }}
      title={`Contrast ratio ${ratio.toFixed(2)}:1 against its background — WCAG AA needs 4.5:1 for normal text (3:1 for large text).`}
    >
      {passesAA ? "✓" : "⚠"} {ratio.toFixed(1)}:1{!passesAA && " low contrast"}
    </span>
  );
}

function ColorField({ label, value, onChange, contrast }) {
  return (
    <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {label}
        <ContrastBadge contrast={contrast} />
      </span>
      <div style={colorRowStyle}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        <input value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
      </div>
    </label>
  );
}

function GradientStopRow({ stop, onChange, onRemove, canRemove }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input type="color" value={stop.color || "#FFFFFF"} onChange={(e) => onChange({ ...stop, color: e.target.value })} />
      <input value={stop.color || ""} onChange={(e) => onChange({ ...stop, color: e.target.value })} style={{ ...inputStyle, width: 90 }} />
      <input
        type="number"
        min={0}
        max={100}
        value={stop.position ?? 0}
        onChange={(e) => onChange({ ...stop, position: Number(e.target.value) })}
        style={{ ...inputStyle, width: 58 }}
      />
      <span style={{ fontSize: 12, opacity: 0.6 }}>%</span>
      {canRemove && (
        <button type="button" className="btn" style={{ fontSize: 11, padding: "2px 7px" }} onClick={onRemove}>
          Remove
        </button>
      )}
    </div>
  );
}

/** Solid-or-gradient background editor for one region (dev spec §8.1's
 * stop editor). `value` is a RegionBackground object or undefined (unset
 * = fallbackColor, matching generate_directory_site's own default). */
function BackgroundEditor({ label, value, onChange, fallbackColor }) {
  const bg = value || { type: "solid", color: fallbackColor };
  const isGradient = bg.type === "gradient";
  const stops = bg.gradient?.stops || [];

  function switchType(type) {
    if (type === "gradient" && !bg.gradient) {
      onChange({
        ...bg,
        type,
        gradient: { type: "linear", angle: 135, stops: [{ color: bg.color || fallbackColor, position: 0 }, { color: "#FFFFFF", position: 100 }] },
      });
    } else {
      onChange({ ...bg, type });
    }
  }
  function updateGradient(patch) {
    onChange({ ...bg, gradient: { ...bg.gradient, ...patch } });
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
        <span>{label}</span>
        <select value={bg.type || "solid"} onChange={(e) => switchType(e.target.value)} style={inputStyle}>
          <option value="solid">Solid colour</option>
          <option value="gradient">Gradient</option>
        </select>
      </label>

      {!isGradient && <ColorField label="Colour" value={bg.color || fallbackColor} onChange={(color) => onChange({ ...bg, type: "solid", color })} />}

      {isGradient && (
        <div style={{ display: "grid", gap: 8, paddingLeft: 10, borderLeft: "2px solid var(--lc-border)" }}>
          <div style={{ height: 22, borderRadius: 6, border: "1px solid var(--lc-border)", background: backgroundToCss(bg, fallbackColor) }} />
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            <span>Gradient type</span>
            <select value={bg.gradient?.type || "linear"} onChange={(e) => updateGradient({ type: e.target.value })} style={inputStyle}>
              <option value="linear">Linear</option>
              <option value="radial">Radial</option>
            </select>
          </label>
          {(bg.gradient?.type || "linear") === "linear" && (
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              <span>Angle ({bg.gradient?.angle ?? 135}°)</span>
              <input
                type="range"
                min={0}
                max={360}
                value={bg.gradient?.angle ?? 135}
                onChange={(e) => updateGradient({ angle: Number(e.target.value) })}
              />
            </label>
          )}
          <div style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13 }}>Stops</span>
            {stops.map((stop, i) => (
              <GradientStopRow
                key={i}
                stop={stop}
                canRemove={stops.length > 2}
                onChange={(next) => updateGradient({ stops: stops.map((s, si) => (si === i ? next : s)) })}
                onRemove={() => updateGradient({ stops: stops.filter((_, si) => si !== i) })}
              />
            ))}
            {stops.length < 4 && (
              <button
                type="button"
                className="btn"
                style={{ fontSize: 11, padding: "2px 8px", justifySelf: "start" }}
                onClick={() => updateGradient({ stops: [...stops, { color: "#FFFFFF", position: 100 }] })}
              >
                + Add stop
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Miniature header/body/footer stack driven by the unsaved draft theme —
 * updates on every field change with no reload (dev spec §8 acceptance
 * criteria). Not the real page shell; a simplified stand-in mirroring the
 * same CSS values generate_directory_site would compute. */
function PreviewStrip({ theme, directoryName }) {
  const headerBg = backgroundToCss(theme.headerBackground, HEADER_BG_DEFAULT.color);
  const footerBg = backgroundToCss(theme.footerBackground, FOOTER_BG_DEFAULT.color);
  const name = theme.siteTitle?.trim() || directoryName || "Your Directory";
  const showLogo = theme.headerMode !== "text";
  const showHeaderText = theme.showHeaderTitle !== false && theme.headerMode !== "logo";
  return (
    <div style={{ border: "1px solid var(--lc-border)", borderRadius: 10, overflow: "hidden", fontSize: 13 }}>
      <style>{`.dtp-footer-link:hover { color: ${theme.footerLinkHover || theme.footerLink} !important; }`}</style>
      <div style={{ background: headerBg, color: theme.headerText, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        {showLogo &&
          (theme.logoUrl ? (
            <img src={theme.logoUrl} alt="" style={{ height: Math.min(24, theme.logoMaxHeight), width: "auto", borderRadius: 7, objectFit: "contain" }} />
          ) : (
            <div style={{ width: 24, height: 24, borderRadius: 7, background: theme.primaryColor, flex: "none" }} />
          ))}
        {showHeaderText && <strong style={{ fontFamily: `"${theme.fontHeading}", serif` }}>{name}</strong>}
      </div>
      <div style={{ background: theme.backgroundColor, color: theme.inkColor, padding: 16, fontFamily: `"${theme.fontBody}", sans-serif` }}>
        Sample entry text with a{" "}
        <a href="#" onClick={(e) => e.preventDefault()} style={{ color: theme.primaryColor }}>
          link
        </a>{" "}
        to preview body colours.
      </div>
      <div style={{ background: footerBg, color: theme.footerText, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontFamily: `"${theme.fontHeading}", serif` }}>{name}</span>
        <a href="#" className="dtp-footer-link" onClick={(e) => e.preventDefault()} style={{ color: theme.footerLink }}>
          Browse all entries
        </a>
      </div>
    </div>
  );
}

/** Small header/body/footer colour-swatch preview for a preset row (dev
 * spec §11: "list with small preview swatches"). */
function PresetSwatch({ theme }) {
  const headerBg = backgroundToCss(theme.headerBackground, HEADER_BG_DEFAULT.color);
  const footerBg = backgroundToCss(theme.footerBackground, FOOTER_BG_DEFAULT.color);
  return (
    <div style={{ display: "flex", flex: "none", borderRadius: 6, overflow: "hidden", border: "1px solid var(--lc-border)", width: 56, height: 24 }}>
      <div style={{ flex: 1, background: headerBg }} />
      <div style={{ flex: 1, background: theme.backgroundColor }} />
      <div style={{ flex: 1, background: footerBg }} />
    </div>
  );
}

/**
 * Directory branding (build-scope §5.1 "Theme: token overrides ... logo").
 * A named preset (DIRECTORY_THEME_PRESETS) bulk-fills every field below —
 * picking one is a convenience, not a persisted concept: theme_json always
 * stores the flat resolved field values generate_directory_site reads, so
 * every field stays independently editable after applying a preset.
 */
export default function DirectoryBrandingPanel({ directory, directoryId, clientId, canManage, recordEvent, onSaved }) {
  const [theme, setTheme] = useState(() => themeFromDirectory(directory));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const fileInputRef = useRef(null);

  const [orgPresets, setOrgPresets] = useState([]);
  const [newPresetName, setNewPresetName] = useState("");
  const [presetBusy, setPresetBusy] = useState(false);

  useEffect(() => {
    setTheme(themeFromDirectory(directory));
  }, [directory]);

  useEffect(() => {
    let cancelled = false;
    if (clientId) {
      listOrgPresets(clientId)
        .then((rows) => !cancelled && setOrgPresets(rows))
        .catch((e) => !cancelled && setErr(e?.message ?? String(e)));
    }
    return () => {
      cancelled = true;
    };
  }, [clientId]);

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

  async function handleSavePreset() {
    setErr("");
    try {
      setPresetBusy(true);
      const saved = await saveThemePreset(clientId, newPresetName, theme);
      setOrgPresets((rows) => [saved, ...rows]);
      setNewPresetName("");
      recordEvent?.("directory_theme_preset_saved", { client_id: clientId, preset_id: saved.id });
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setPresetBusy(false);
    }
  }

  async function handleApplyOrgPreset(preset) {
    setErr("");
    setMsg("");
    try {
      setPresetBusy(true);
      setTheme((t) => ({ ...t, ...preset.theme_json }));
      recordEvent?.("directory_theme_preset_applied", { client_id: clientId, preset_id: preset.id, directory_id: directoryId });
      setMsg(`Applied "${preset.name}" — click Save branding to persist it.`);
    } finally {
      setPresetBusy(false);
    }
  }

  async function handleRenamePreset(preset) {
    const name = window.prompt("Rename preset", preset.name);
    if (!name || name.trim() === preset.name) return;
    setErr("");
    try {
      setPresetBusy(true);
      await renameThemePreset(preset.id, name);
      setOrgPresets((rows) => rows.map((r) => (r.id === preset.id ? { ...r, name: name.trim() } : r)));
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setPresetBusy(false);
    }
  }

  async function handleDeletePreset(preset) {
    if (!window.confirm(`Delete preset "${preset.name}"? This can't be undone.`)) return;
    setErr("");
    try {
      setPresetBusy(true);
      await deleteThemePreset(preset.id);
      setOrgPresets((rows) => rows.filter((r) => r.id !== preset.id));
      recordEvent?.("directory_theme_preset_deleted", { client_id: clientId, preset_id: preset.id });
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setPresetBusy(false);
    }
  }

  async function handleLogoFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr("");
    try {
      setUploading(true);
      const url = await uploadDirectoryLogo(directoryId, file);
      set("logoUrl", url);
    } catch (e2) {
      setErr(e2?.message ?? String(e2));
    } finally {
      setUploading(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    try {
      setSaving(true);
      const next = {
        ...theme,
        siteTitle: theme.siteTitle.trim(),
        showHeaderTitle: theme.showHeaderTitle !== false,
        headerMode: theme.showHeaderTitle === false
          ? theme.headerMode === "text"
            ? "text"
            : "logo"
          : theme.headerMode === "logo"
            ? "logoText"
            : theme.headerMode,
      };
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

  // Contrast checks (dev spec §12) — text/link against their own region's
  // background. Gradients are checked against every stop, worst wins.
  // checkContrast() returns null (renders no badge) when a background
  // isn't a plain hex, e.g. the header's translucent rgba() default.
  // headerText/footerText render as bold ~19px/17px (siteHeader()/
  // siteFooter() in builders.ts) — comfortably at or past WCAG's "large
  // text" cutoff (14pt/~18.7px bold), so use the 3:1 threshold there;
  // body text and every link default to the stricter 4.5:1.
  const headerTextContrast = checkContrast(theme.headerText, theme.headerBackground, { large: true });
  const bodyTextContrast = checkContrast(theme.inkColor, theme.backgroundColor);
  const bodyLinkContrast = checkContrast(theme.primaryColor, theme.backgroundColor);
  const footerTextContrast = checkContrast(theme.footerText, theme.footerBackground, { large: true });
  const footerLinkContrast = checkContrast(theme.footerLink, theme.footerBackground);

  return (
    <form onSubmit={save} style={{ display: "grid", gap: 14 }}>
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

      <div>
        <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.7, display: "block", marginBottom: 6 }}>Live preview</span>
        <PreviewStrip theme={theme} directoryName={directory?.name} />
      </div>

      <details open>
        <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Header</summary>
        <div style={sectionStyle}>
          <BackgroundEditor label="Background" value={theme.headerBackground} onChange={(v) => set("headerBackground", v)} fallbackColor={HEADER_BG_DEFAULT.color} />
          <ColorField label="Text colour" value={theme.headerText} onChange={(v) => set("headerText", v)} contrast={headerTextContrast} />

          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            <span>Header shows</span>
            <select
              value={theme.headerMode}
              onChange={(e) => {
                const headerMode = e.target.value;
                setTheme((t) => ({ ...t, headerMode, showHeaderTitle: headerMode !== "logo" }));
                setMsg("");
              }}
              style={inputStyle}
            >
              <option value="logo">Logo only</option>
              <option value="logoText">Logo + text</option>
              <option value="text">Text only</option>
            </select>
          </label>

          {theme.headerMode !== "text" && (
            <div style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 13 }}>Logo</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {theme.logoUrl ? (
                  <img src={theme.logoUrl} alt="Current logo" style={{ height: 36, width: "auto", maxWidth: 120, borderRadius: 6, objectFit: "contain", background: "#fff", border: "1px solid var(--lc-border)" }} />
                ) : (
                  <div style={{ height: 36, width: 36, borderRadius: 6, background: theme.primaryColor, flex: "none" }} />
                )}
                <button type="button" className="btn" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? "Uploading…" : theme.logoUrl ? "Replace logo" : "Upload logo"}
                </button>
                {theme.logoUrl && (
                  <button type="button" className="btn" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => set("logoUrl", "")}>
                    Remove
                  </button>
                )}
                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoFile} style={{ display: "none" }} />
              </div>
              <span style={{ fontSize: 11.5, opacity: 0.6 }}>PNG, JPG or WebP, up to 2 MB.</span>
              <label style={{ display: "grid", gap: 4, fontSize: 13, marginTop: 4 }}>
                <span>Logo max height ({theme.logoMaxHeight}px)</span>
                <input
                  type="range"
                  min={24}
                  max={120}
                  value={theme.logoMaxHeight}
                  onChange={(e) => set("logoMaxHeight", Number(e.target.value))}
                />
              </label>
            </div>
          )}

          <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span>Site title</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 500 }}>
                <span style={{ fontSize: 12, opacity: 0.65 }}>{theme.showHeaderTitle !== false ? "On" : "Off"}</span>
                <OnOffSwitch
                  checked={theme.showHeaderTitle !== false}
                  label="Show site title in the header"
                  onChange={(on) => {
                    setTheme((t) => ({
                      ...t,
                      showHeaderTitle: on,
                      headerMode: on ? (t.headerMode === "logo" ? "logoText" : t.headerMode) : t.headerMode === "text" ? "text" : "logo",
                    }));
                    setMsg("");
                  }}
                />
              </span>
            </div>
            <input
              value={theme.siteTitle}
              onChange={(e) => set("siteTitle", e.target.value)}
              placeholder={directory?.name || ""}
              disabled={theme.showHeaderTitle === false}
              style={{ ...inputStyle, opacity: theme.showHeaderTitle === false ? 0.55 : 1 }}
            />
            <span style={{ fontSize: 11.5, opacity: 0.6, fontWeight: 400 }}>
              {theme.showHeaderTitle === false
                ? "Off — the published header omits the title (logo only, if you have one)."
                : "On — leave blank to use the directory name. Turn off to leave the title out of the header."}
            </span>
          </div>
        </div>
      </details>

      <details open>
        <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Body</summary>
        <div style={sectionStyle}>
          <ColorField label="Primary colour (links, buttons)" value={theme.primaryColor} onChange={(v) => set("primaryColor", v)} contrast={bodyLinkContrast} />
          <ColorField label="Accent colour (highlights, AI search icon)" value={theme.accentColor} onChange={(v) => set("accentColor", v)} />
          <ColorField label="Background colour" value={theme.backgroundColor} onChange={(v) => set("backgroundColor", v)} />

          <button
            type="button"
            className="btn"
            style={{ fontSize: 12, padding: "3px 10px", justifySelf: "start" }}
            onClick={() => setAdvancedOpen((v) => !v)}
          >
            {advancedOpen ? "Hide advanced colours" : "Advanced colours…"}
          </button>

          {advancedOpen && (
            <div style={{ display: "grid", gap: 10, padding: 12, background: "#fff", border: "1px solid var(--lc-border)", borderRadius: 8 }}>
              <ColorField label="Primary (dark variant)" value={theme.primaryDarkColor} onChange={(v) => set("primaryDarkColor", v)} />
              <ColorField label="Surface" value={theme.surfaceColor} onChange={(v) => set("surfaceColor", v)} />
              <ColorField label="Surface (alt)" value={theme.surfaceAltColor} onChange={(v) => set("surfaceAltColor", v)} />
              <ColorField label="Text (ink)" value={theme.inkColor} onChange={(v) => set("inkColor", v)} contrast={bodyTextContrast} />
              <ColorField label="Muted text" value={theme.mutedColor} onChange={(v) => set("mutedColor", v)} />
              <ColorField label="Border / line" value={theme.lineColor} onChange={(v) => set("lineColor", v)} />
              <ColorField label="Sage (badge background)" value={theme.sageColor} onChange={(v) => set("sageColor", v)} />
              <ColorField label="Sage (badge text)" value={theme.sageInkColor} onChange={(v) => set("sageInkColor", v)} />
              <ColorField label="Gold (ratings, highlights)" value={theme.goldColor} onChange={(v) => set("goldColor", v)} />
              <ColorField label="Teal" value={theme.tealColor} onChange={(v) => set("tealColor", v)} />
            </div>
          )}
        </div>
      </details>

      <details open>
        <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Typography</summary>
        <div style={sectionStyle}>
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
          <FontSizeField label="Base text size" value={theme.fontSizeBase} onChange={(v) => set("fontSizeBase", v)} unit="px" min={12} max={22} step={1} fallbackAmount={16} />
          <FontSizeField label="H1 size" value={theme.fontSizeH1} onChange={(v) => set("fontSizeH1", v)} unit="rem" min={1.5} max={4} step={0.1} fallbackAmount={2.5} />
          <FontSizeField label="H2 size" value={theme.fontSizeH2} onChange={(v) => set("fontSizeH2", v)} unit="rem" min={1.25} max={3} step={0.1} fallbackAmount={2} />
          <FontSizeField label="H3 size" value={theme.fontSizeH3} onChange={(v) => set("fontSizeH3", v)} unit="rem" min={1} max={2.5} step={0.1} fallbackAmount={1.5} />
        </div>
      </details>

      <details open>
        <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Footer</summary>
        <div style={sectionStyle}>
          <BackgroundEditor label="Background" value={theme.footerBackground} onChange={(v) => set("footerBackground", v)} fallbackColor={FOOTER_BG_DEFAULT.color} />
          <ColorField label="Text colour" value={theme.footerText} onChange={(v) => set("footerText", v)} contrast={footerTextContrast} />
          <ColorField label="Link colour" value={theme.footerLink} onChange={(v) => set("footerLink", v)} contrast={footerLinkContrast} />
          <ColorField label="Link hover colour" value={theme.footerLinkHover} onChange={(v) => set("footerLinkHover", v)} />
        </div>
      </details>

      {clientId && (
        <details open>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Presets</summary>
          <div style={sectionStyle}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="Name this look…"
                style={inputStyle}
              />
              <button
                type="button"
                className="btn"
                style={{ fontSize: 12, padding: "4px 10px", flex: "none" }}
                onClick={handleSavePreset}
                disabled={presetBusy || !newPresetName.trim()}
              >
                Save current as preset
              </button>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              {DIRECTORY_THEME_PRESETS.map((p) => (
                <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                  <PresetSwatch theme={p.values} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{p.label}</div>
                    <div style={{ fontSize: 11.5, opacity: 0.6 }}>Built-in</div>
                  </div>
                  <button type="button" className="btn" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => applyPreset(p.key)}>
                    Apply
                  </button>
                </div>
              ))}
              {orgPresets.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderTop: "1px solid var(--lc-border)" }}>
                  <PresetSwatch theme={p.theme_json} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                    <div style={{ fontSize: 11.5, opacity: 0.6 }}>Saved by your organisation</div>
                  </div>
                  <button type="button" className="btn" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => handleApplyOrgPreset(p)} disabled={presetBusy}>
                    Apply
                  </button>
                  <button type="button" className="btn" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => handleRenamePreset(p)} disabled={presetBusy}>
                    Rename
                  </button>
                  <button type="button" className="btn" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => handleDeletePreset(p)} disabled={presetBusy}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        </details>
      )}

      <div>
        <button type="submit" className="btn btn-primary" style={{ fontSize: 12, padding: "5px 12px" }} disabled={saving}>
          {saving ? "Saving…" : "Save branding"}
        </button>
      </div>
    </form>
  );
}

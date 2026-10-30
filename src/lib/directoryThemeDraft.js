import { NATURAL } from "./directoryThemePresets.js";

/**
 * Theme draft helpers shared by the Look & feel page (Experience). Extracted from the old
 * DirectoryBrandingPanel so every tab edits one flat theme object that serialises to the same
 * `theme_json` shape generate_directory_site reads.
 */

/** Unused leftover tokens — drop them from drafts, saved presets, and theme_json writes. */
export function withoutRetiredColours(obj) {
  if (!obj || typeof obj !== "object") return {};
  const next = { ...obj };
  delete next.goldColor;
  delete next.tealColor;
  return next;
}

export const FIELD_KEYS = [
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
  "fontHeading",
  "fontBody",
];

// Mirrors generate_directory_site/builders.ts's HEADER_BG_DEFAULT/
// FOOTER_BG_DEFAULT/FOOTER_TEXT_DEFAULT/FOOTER_LINK_DEFAULT — hand-synced
// across the JS/Deno runtime boundary, same as FONT_CATALOG already is.
// An unset region must preview exactly what the public site renders.
export const HEADER_BG_DEFAULT = { type: "solid", color: "rgba(255,255,255,.6)" };
export const FOOTER_BG_DEFAULT = { type: "solid", color: "#0E3A34" };
export const FOOTER_TEXT_DEFAULT = "#FFFFFF";
export const FOOTER_LINK_DEFAULT = "#CFE3DE";
export const FONT_SIZE_BASE_DEFAULT = "16px";
export const FONT_SIZE_H1_DEFAULT = "2.5rem";
export const FONT_SIZE_H2_DEFAULT = "2rem";
export const FONT_SIZE_H3_DEFAULT = "1.5rem";
export const HERO_BANNER_HEIGHT_DEFAULT = 480;
export const LOGO_HEIGHT_DEFAULT = 84;
export const LOGO_HEIGHT_MIN = 24;
export const LOGO_HEIGHT_MAX = 240;

export function themeFromDirectory(directory) {
  const t = directory?.theme_json && typeof directory.theme_json === "object" ? directory.theme_json : {};
  const next = {};
  for (const key of FIELD_KEYS) next[key] = t[key] || NATURAL[key];
  next.logoUrl = t.logoUrl || "";
  next.faviconUrl = t.faviconUrl || "";
  next.heroBannerUrl = t.heroBannerUrl || "";
  next.heroBannerHeight = typeof t.heroBannerHeight === "number" && t.heroBannerHeight > 0 ? t.heroBannerHeight : HERO_BANNER_HEIGHT_DEFAULT;
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
  next.logoMaxHeight = typeof t.logoMaxHeight === "number" && t.logoMaxHeight > 0 ? t.logoMaxHeight : LOGO_HEIGHT_DEFAULT;
  // UI-only link: while true the editor keeps footerBackground equal to headerBackground.
  // generate_directory_site ignores it (theme_json is jsonb, so no schema or function change).
  next.footerLinkedToHeader = t.footerLinkedToHeader === true;
  return next;
}

/** The single "Header shows" choice the UI exposes, derived from the two stored fields. */
export function headerShowsOf(theme) {
  if (theme.showHeaderTitle === false) return "logo";
  return theme.headerMode === "text" ? "text" : "logoText";
}

/** Patch that writes both stored fields consistently, so they can never contradict. */
export function headerShowsPatch(choice) {
  return { headerMode: choice, showHeaderTitle: choice !== "logo" };
}

/** Region keys a theme preset may leave unset; applying such a preset resets them to defaults. */
export function presetRegionDefaults(theme) {
  return {
    headerBackground: HEADER_BG_DEFAULT,
    headerText: theme.inkColor,
    footerBackground: FOOTER_BG_DEFAULT,
    footerText: FOOTER_TEXT_DEFAULT,
    footerLink: FOOTER_LINK_DEFAULT,
    footerLinkHover: FOOTER_LINK_DEFAULT,
  };
}

/** Merges a preset into the draft. A preset with no header/footer values (Natural) resets them. */
export function applyPresetValues(theme, values) {
  const clean = withoutRetiredColours(values);
  const merged = { ...theme, ...clean };
  if (!clean.headerBackground) {
    Object.assign(merged, presetRegionDefaults(merged));
    merged.headerText = clean.headerText || merged.inkColor;
  }
  merged.footerLinkedToHeader = false;
  return merged;
}

/** Normalises the draft into the object written to directories.theme_json. */
export function serializeTheme(theme) {
  const showTitle = theme.showHeaderTitle !== false;
  return {
    ...withoutRetiredColours(theme),
    siteTitle: (theme.siteTitle || "").trim(),
    showHeaderTitle: showTitle,
    headerMode: !showTitle ? (theme.headerMode === "text" ? "text" : "logo") : theme.headerMode === "logo" ? "logoText" : theme.headerMode,
    heroBannerUrl: (theme.heroBannerUrl || "").trim(),
    heroBannerHeight: Math.min(800, Math.max(160, Number(theme.heroBannerHeight) || HERO_BANNER_HEIGHT_DEFAULT)),
    logoMaxHeight: Math.min(LOGO_HEIGHT_MAX, Math.max(LOGO_HEIGHT_MIN, Number(theme.logoMaxHeight) || LOGO_HEIGHT_DEFAULT)),
  };
}

/** Number of top-level theme fields that differ between two drafts. */
export function countChangedFields(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  let n = 0;
  for (const k of keys) {
    if (JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])) n += 1;
  }
  return n;
}

// A theme field only ever holds the unit its own field writes (px for
// base, rem for headings) — if a stored value somehow has a different
// unit (e.g. hand-edited via the API), fall back to the default amount
// rather than reinterpreting the number in the wrong unit.
export function lengthAmount(cssLength, unit, fallbackAmount) {
  const m = /^(-?\d*\.?\d+)(px|rem|em|%)$/.exec(cssLength || "");
  return m && m[2] === unit ? Number(m[1]) : fallbackAmount;
}

/** Resolves a region background to a CSS `background` value for the live preview only. */
export function backgroundToCss(bg, fallbackColor) {
  if (!bg || bg.type !== "gradient") return bg?.color || fallbackColor;
  const stops = (bg.gradient?.stops || []).filter((s) => s && typeof s.position === "number");
  if (stops.length < 2) return bg.color || fallbackColor;
  const stopList = stops.map((s) => `${s.color || fallbackColor} ${Math.min(100, Math.max(0, s.position))}%`).join(", ");
  if (bg.gradient?.type === "radial") return `radial-gradient(circle, ${stopList})`;
  const angle = typeof bg.gradient?.angle === "number" ? bg.gradient.angle : 135;
  return `linear-gradient(${angle}deg, ${stopList})`;
}

export function applyAlphaToCssColors(css, alpha) {
  const a = Math.min(1, Math.max(0, alpha));
  return css
    .replace(/#[0-9a-fA-F]{3,8}\b/g, (hex) => {
      let h = hex.slice(1);
      if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      if ([r, g, b].some((n) => Number.isNaN(n))) return hex;
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    })
    .replace(/\brgba?\(\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)(?:\s*,\s*[\d.]+%?)?\s*\)/g, (_m, r, g, b) => `rgba(${r}, ${g}, ${b}, ${a})`)
    .replace(/\bhsla?\(\s*([\d.]+)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)(?:\s*,\s*[\d.]+%?)?\s*\)/g, (_m, h, s, l) => `hsla(${h}, ${s}, ${l}, ${a})`);
}

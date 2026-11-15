import { contrastRatio as rawContrast } from "./colorContrast.js";

const contrastRatio = (a, b) => rawContrast(a, b) ?? 21;

/**
 * Ask AI colour tokens for the published directory sidebar. Mirrors resolveAiTokens() in
 * supabase/functions/generate_directory_site/builders.ts (hand-synced across the Deno/JS boundary,
 * like FONT_CATALOG). Unset tokens follow the theme's primary colour, so switching preset
 * restyles Ask AI without touching these keys.
 */

export const AI_COLOUR_KEYS = [
  "aiAccent",
  "aiOnAccent",
  "aiTint",
  "aiTintText",
  "aiBorder",
  "aiPanelBg",
  "aiUserBubble",
  "aiUserBubbleText",
  "aiLauncherBg",
  "aiLauncherText",
];
export const AI_THEME_KEYS = [...AI_COLOUR_KEYS, "aiShowLauncher"];

/** Strict #rrggbb — the same bar the generator applies before interpolating into CSS. */
export const isAiHex = (v) => /^#[0-9a-fA-F]{6}$/.test(v || "");

function toRgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function mixHex(a, b, pct) {
  const ra = toRgb(a);
  const rb = toRgb(b);
  const k = pct / 100;
  return "#" + ra.map((v, i) => Math.round(v * k + rb[i] * (1 - k)).toString(16).padStart(2, "0")).join("");
}

/** Concrete colours the published site will use for this theme draft. */
export function resolveAiTokens(theme) {
  const t = theme || {};
  const pick = (v) => (isAiHex(v) ? v : null);
  const primary = isAiHex(t.primaryColor) ? t.primaryColor : "#2E5A39";
  const bg = isAiHex(t.backgroundColor) ? t.backgroundColor : "#FAF6EE";
  const ink = isAiHex(t.inkColor) ? t.inkColor : "#232820";
  let accent = pick(t.aiAccent) || primary;
  const darkText = luminance(ink) < 0.4 ? ink : "#111827";
  if (!pick(t.aiAccent)) {
    for (let i = 0; i < 10 && contrastRatio("#FFFFFF", accent) < 4.5 && contrastRatio(darkText, accent) < 4.5; i++) accent = mixHex(accent, "#000000", 92);
  }
  const white = contrastRatio("#FFFFFF", accent);
  const onAccent = pick(t.aiOnAccent) || (white >= 4.5 || white >= contrastRatio(darkText, accent) ? "#FFFFFF" : darkText);
  const tint = pick(t.aiTint) || mixHex(accent, "#FFFFFF", 8);
  let tintText = pick(t.aiTintText) || accent;
  if (!pick(t.aiTintText)) {
    for (let i = 0; i < 10 && contrastRatio(tintText, tint) < 4.5; i++) tintText = mixHex(tintText, "#000000", 85);
  }
  return {
    aiAccent: accent,
    aiOnAccent: onAccent,
    aiTint: tint,
    aiTintText: tintText,
    aiBorder: pick(t.aiBorder) || mixHex(accent, "#FFFFFF", 30),
    aiPanelBg: pick(t.aiPanelBg) || mixHex(bg, "#000000", 99),
    aiUserBubble: pick(t.aiUserBubble) || accent,
    aiUserBubbleText: pick(t.aiUserBubbleText) || onAccent,
    aiLauncherBg: pick(t.aiLauncherBg) || accent,
    aiLauncherText: pick(t.aiLauncherText) || onAccent,
  };
}

/** Removes every Ask AI key — used by "Reset Ask AI colours" and when saving a preset. */
export function withoutAiColours(obj) {
  const next = { ...(obj || {}) };
  for (const k of AI_COLOUR_KEYS) delete next[k];
  return next;
}

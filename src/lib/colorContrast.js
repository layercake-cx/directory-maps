/**
 * WCAG 2.x contrast-ratio calculation — Directory Theming plan, Phase 6
 * (docs/DEPLOYMENTS.md, 2026-09-19). Pure functions, no dependency: this
 * is a well-known ~20-line formula (relative luminance -> contrast
 * ratio), not worth pulling in a package for.
 *
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 * https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */

const AA_NORMAL = 4.5;
const AA_LARGE = 3;

function hexToRgb(hex) {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex || "");
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function channelLuminance(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance({ r, g, b }) {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** WCAG contrast ratio between two hex colours, or null if either isn't a valid hex (e.g. a translucent rgba() header default — skip the check rather than guess). */
export function contrastRatio(hexA, hexB) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return null;
  const lA = relativeLuminance(a);
  const lB = relativeLuminance(b);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** AA pass/fail for a given ratio ("large" = 18pt+/14pt+bold text, per WCAG's own threshold split). */
export function meetsAA(ratio, { large = false } = {}) {
  if (ratio == null) return null;
  return ratio >= (large ? AA_LARGE : AA_NORMAL);
}

/**
 * Checks a foreground colour against a background — which may be a solid
 * hex or a RegionBackground object (solid or gradient). For a gradient,
 * checks against every stop and reports the worst (lowest) ratio, since
 * text can sit over any part of the gradient (dev spec §12: "check text
 * against both the lightest and darkest stop").
 */
export function checkContrast(foregroundHex, background, opts) {
  const bgColors =
    background && typeof background === "object"
      ? background.type === "gradient" && (background.gradient?.stops?.length ?? 0) >= 2
        ? background.gradient.stops.map((s) => s.color).filter(Boolean)
        : [background.color]
      : [background];

  const ratios = bgColors.map((c) => contrastRatio(foregroundHex, c)).filter((r) => r != null);
  if (ratios.length === 0) return null;
  const worst = Math.min(...ratios);
  return { ratio: worst, passesAA: meetsAA(worst, opts) };
}

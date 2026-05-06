/**
 * Builds data URLs for map marker icons. Used by DirectoryMap and admin Design preview.
 * @param {'pin'|'teardrop'|'ringpin'|'dot'|'circle'} style
 * @param {string} color - hex e.g. #4A9BAA
 * @param {{ borderColor?: string, borderWidth?: number, pinFaviconUrl?: string }} border - optional pin border (0-15px), optional favicon (data URL or https URL) inside pin
 * @returns {string} data URL for the icon
 */
export function markerIconDataUrl(style, color, border = {}) {
  const fill = color || "#4A9BAA";
  const stroke = border.borderColor || "#ffffff";
  const sw = Math.max(0, Math.min(15, Number(border.borderWidth) || 0));
  const pinFavicon = border.pinFaviconUrl ? String(border.pinFaviconUrl).trim() : "";
  const hasFavicon = pinFavicon && (/^data:/i.test(pinFavicon) || /^https?:\/\//i.test(pinFavicon));
  const faviconHref = hasFavicon ? pinFavicon.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";

  if (style === "dot") {
    const strokeW = sw > 0 ? sw : 2;
    const strokeCol = sw > 0 ? stroke : "#ffffff";
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" fill="${fill}" stroke="${strokeCol}" stroke-width="${strokeW}"/>
      </svg>
    `.trim();
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
  }

  if (style === "circle") {
    const strokeW = sw > 0 ? sw : 2;
    const strokeCol = sw > 0 ? stroke : "#ffffff";
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="14" fill="${fill}" stroke="${strokeCol}" stroke-width="${strokeW}"/>
      </svg>
    `.trim();
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
  }

  if (style === "ringpin") {
    // Elongated silhouette (user Bézier), viewBox 0 0 120 150; padded for stroke.
    const ringD =
      "M60 10 C35 10 15 29 15 54 C15 86 43 107 60 136 C77 107 105 86 105 54 C105 29 85 10 60 10 Z";
    const ringStrokeW = sw > 0 ? sw : 1;
    const ringStrokeCol = sw > 0 ? stroke : "#ffffff";
    const clipId = `ringpin-fc-${Math.random().toString(36).slice(2, 11)}`;
    const inner = hasFavicon
      ? `
    <defs><clipPath id="${clipId}"><circle cx="60" cy="44" r="20"/></clipPath></defs>
    <path d="${ringD}" fill="${fill}" stroke="${ringStrokeCol}" stroke-width="${ringStrokeW}" stroke-linejoin="round"/>
    <circle cx="60" cy="44" r="20" fill="#ffffff"/>
    <g clip-path="url(#${clipId})">
      <image href="${faviconHref}" x="40" y="24" width="40" height="40" preserveAspectRatio="xMidYMid slice"/>
    </g>`
      : `
    <path d="${ringD}" fill="${fill}" stroke="${ringStrokeCol}" stroke-width="${ringStrokeW}" stroke-linejoin="round"/>
    <circle cx="60" cy="44" r="20" fill="#ffffff"/>
    <circle cx="60" cy="44" r="15.5" fill="none" stroke="#c7cbd1" stroke-width="1"/>
    <path d="M48 45 L57 54 L74 34" fill="none" stroke="${fill}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="140" height="170" viewBox="-10 -10 140 170">
        ${inner.trim()}
      </svg>
    `.trim();
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
  }

  // Pin and Teardrop: allow border up to 15px; use padded viewBox (8px) so stroke isn't clipped.
  const strokeW = sw > 0 ? sw : 1;
  const strokeCol = sw > 0 ? stroke : "#ffffff";
  const pathAttrs = `fill="${fill}" stroke="${strokeCol}" stroke-width="${strokeW}"`;

  // Teardrop: rounder bulb (taller arc), gentle taper to point
  const teardropPath = `d="M2 18 A14 18 0 0 1 30 18 Q24 36 16 46 Q8 36 2 18 Z"`;
  // Pin: classic map marker with a bit more body (fuller shoulder and belly)
  const pinPath = `d="M16 0C7.2 0 0.5 6.8 0.5 15c0 11.8 14.5 30 15.5 31s15.5-19.2 15.5-31C31.5 6.8 24.8 0 16 0z"`;

  const path = style === "teardrop" ? teardropPath : pinPath;
  // Icon inside circle with 3px padding: circle r=10 (20px diam), image 14×14 centered at (16,14) → x=9 y=7
  const faviconSnippet = hasFavicon
    ? `
    <defs><clipPath id="pin-favclip"><circle cx="16" cy="14" r="10"/></clipPath></defs>
    <path ${path} ${pathAttrs}/>
    <g clip-path="url(#pin-favclip)">
      <image href="${faviconHref}" x="9" y="7" width="14" height="14" preserveAspectRatio="xMidYMid slice"/>
    </g>`
    : `
    <path ${path} ${pathAttrs}/>`;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="56" height="70" viewBox="-8 -8 56 70">
      <g transform="translate(8, 8)">
        ${faviconSnippet.trim()}
      </g>
    </svg>
  `.trim();
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

/**
 * Returns the icon URL to use for a marker: custom URL if provided and style is 'custom', else data URL from style+color.
 */
export function getMarkerIconUrl(options) {
  const {
    style = "pin",
    color = "#4A9BAA",
    customIconUrl = null,
    pinBorderColor = "#ffffff",
    pinBorderSize = 0,
    pinFaviconUrl = null,
  } = options;

  if (style === "custom" && customIconUrl) return customIconUrl;
  return markerIconDataUrl(style, color, {
    borderColor: pinBorderColor,
    borderWidth: pinBorderSize,
    pinFaviconUrl: pinFaviconUrl || undefined,
  });
}

/** Sizes and anchors for each style so markers sit on the point correctly. Pin/teardrop use 56×70 viewBox with 8px padding for up to 15px border. */
export const MARKER_ANCHORS = {
  pin:      { scaledSize: { w: 39, h: 49 }, anchor: { x: 24, y: 54 } },
  teardrop: { scaledSize: { w: 39, h: 49 }, anchor: { x: 24, y: 54 } },
  // Ring pin path viewBox 0 0 120 150 (tip at 60,136); padded SVG 140×170 — hotspot at tip.
  ringpin:  { scaledSize: { w: 40, h: 49 }, anchor: { x: 20, y: 42 } },
  dot:      { scaledSize: { w: 24, h: 24 }, anchor: { x: 12, y: 12 } },
  circle:   { scaledSize: { w: 28, h: 28 }, anchor: { x: 14, y: 14 } },
  custom:   { scaledSize: { w: 40, h: 40 }, anchor: { x: 20, y: 40 } },
};

/** Visual scale on map vs. medium (current default). */
const PIN_SIZE_MULTIPLIER = {
  small: 0.78,
  medium: 1,
  large: 1.22,
};

/** @param {unknown} v */
export function normalizePinSize(v) {
  if (v === "small" || v === "large") return v;
  return "medium";
}

/**
 * @param {'pin'|'teardrop'|'ringpin'|'dot'|'circle'|'custom'} styleKey
 * @param {'small'|'medium'|'large'} [pinSize]
 */
export function getScaledMarkerAnchors(styleKey, pinSize = "medium") {
  const base = MARKER_ANCHORS[styleKey] || MARKER_ANCHORS.pin;
  const m = PIN_SIZE_MULTIPLIER[normalizePinSize(pinSize)] ?? 1;
  return {
    scaledSize: {
      w: Math.max(8, Math.round(base.scaledSize.w * m)),
      h: Math.max(8, Math.round(base.scaledSize.h * m)),
    },
    anchor: {
      x: Math.max(1, Math.round(base.anchor.x * m)),
      y: Math.max(1, Math.round(base.anchor.y * m)),
    },
  };
}

/** Scale factor for design-preview thumbnails (matches map multipliers). */
export function pinPreviewScale(pinSize) {
  return PIN_SIZE_MULTIPLIER[normalizePinSize(pinSize)] ?? 1;
}

/**
 * Builds data URLs for map marker icons. Used by DirectoryMap and admin Design preview.
 * @param {'pin'|'teardrop'|'dot'} style
 * @param {string} color - hex e.g. #4A9BAA
 * @param {{ borderColor?: string, borderWidth?: number, pinFaviconUrl?: string }} border
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

  // Pin and Teardrop share viewBox "-8 -8 56 70" (8px padding for border stroke).
  const strokeW = sw > 0 ? sw : 1;
  const strokeCol = sw > 0 ? stroke : "#ffffff";
  const pathAttrs = `fill="${fill}" stroke="${strokeCol}" stroke-width="${strokeW}"`;

  if (style === "teardrop") {
    const teardropPath = `d="M2 18 A14 18 0 0 1 30 18 Q24 36 16 46 Q8 36 2 18 Z"`;
    const faviconSnippet = hasFavicon
      ? `
    <defs><clipPath id="pin-favclip"><circle cx="16" cy="14" r="10"/></clipPath></defs>
    <path ${teardropPath} ${pathAttrs}/>
    <circle cx="16" cy="14" r="10" fill="#ffffff"/>
    <g clip-path="url(#pin-favclip)">
      <image href="${faviconHref}" x="9" y="7" width="14" height="14" preserveAspectRatio="xMidYMid meet"/>
    </g>`
      : `<path ${teardropPath} ${pathAttrs}/>`;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="56" height="70" viewBox="-8 -8 56 70">
        <g transform="translate(8, 8)">${faviconSnippet.trim()}</g>
      </svg>
    `.trim();
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
  }

  // Default pin: circular top tapering to a sharp point.
  const pinPath = `d="M16,46 C8,36 2,27 2,16 A14,14 0 1,1 30,16 C30,27 24,36 16,46 Z"`;
  const faviconSnippet = hasFavicon
    ? `
    <defs><clipPath id="pin-favclip"><circle cx="16" cy="14" r="11"/></clipPath></defs>
    <path ${pinPath} ${pathAttrs}/>
    <g clip-path="url(#pin-favclip)">
      <image href="${faviconHref}" x="8" y="6" width="16" height="16" preserveAspectRatio="xMidYMid meet"/>
    </g>`
    : `<path ${pinPath} ${pathAttrs}/>`;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="56" height="70" viewBox="-8 -8 56 70">
      <g transform="translate(8, 8)">${faviconSnippet.trim()}</g>
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
  dot:      { scaledSize: { w: 24, h: 24 }, anchor: { x: 12, y: 12 } },
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
 * @param {'pin'|'teardrop'|'dot'|'custom'} styleKey
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

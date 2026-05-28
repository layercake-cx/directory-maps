/**
 * Builds data URLs for map marker icons. Used by DirectoryMap and admin Design preview.
 * @param {'pin'|'teardrop'|'dot'} style
 * @param {string} color - hex e.g. #4A9BAA
 * @param {{ borderColor?: string, borderWidth?: number, pinFaviconUrl?: string, dropShadowPx?: number }} border
 * @returns {string} data URL for the icon
 */
export function markerIconDataUrl(style, color, border = {}) {
  const fill = color || "#4A9BAA";
  const stroke = border.borderColor || "#ffffff";
  const sw = Math.max(0, Math.min(15, Number(border.borderWidth) || 0));
  const pinFavicon = border.pinFaviconUrl ? String(border.pinFaviconUrl).trim() : "";
  const dropShadowPx = Math.max(0, Math.min(30, Number(border.dropShadowPx) || 0));
  // How far below the pin tip the shadow centre sits (0–30 SVG units, default 20).
  const baseShadowYOffset = border.dropShadowDistance != null
    ? Math.max(0, Math.min(30, Number(border.dropShadowDistance) || 0))
    : 20;
  // Global opacity multiplier (0–100 %, default 100 = fully visible).
  const shadowOpacityMult = border.dropShadowOpacity != null
    ? Math.max(0, Math.min(100, Number(border.dropShadowOpacity) || 0)) / 100
    : 1;
  const baseShadowOpacity = Math.min(0.58, 0.24 + dropShadowPx / 90) * shadowOpacityMult;
  const hasFavicon = pinFavicon && (/^data:/i.test(pinFavicon) || /^https?:\/\//i.test(pinFavicon));
  const faviconHref = hasFavicon ? pinFavicon.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";

  if (style === "dot") {
    const strokeW = sw > 0 ? sw : 2;
    const strokeCol = sw > 0 ? stroke : "#ffffff";
    const safeDotRadius = Math.max(1, 10 - strokeW / 2);
    const dotShadowRx = Math.max(3.8, 5 + dropShadowPx * 0.1) * 3;
    const dotShadowRy = Math.max(1.4, 1.9 + dropShadowPx * 0.05) * 3;
    const dotShadowCy = Math.min(12 + Math.min(baseShadowYOffset, 8), 23.5 - dotShadowRy);
    const dotShadow = dropShadowPx > 0
      ? `
        <defs>
          <radialGradient id="pin-base-shadow-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#000" stop-opacity="${baseShadowOpacity}"/>
            <stop offset="70%" stop-color="#000" stop-opacity="${Math.max(0.02, baseShadowOpacity * 0.38)}"/>
            <stop offset="100%" stop-color="#000" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <ellipse cx="12" cy="${dotShadowCy}" rx="${dotShadowRx}" ry="${dotShadowRy}" fill="url(#pin-base-shadow-grad)"/>
      `.trim()
      : "";
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
        ${dotShadow}
        <circle cx="12" cy="12" r="${safeDotRadius}" fill="${fill}" stroke="${strokeCol}" stroke-width="${strokeW}"/>
      </svg>
    `.trim();
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
  }

  // Pin and Teardrop share viewBox "-8 -8 56 98" (8px border padding + 28px shadow canvas below tip).
  const strokeW = sw > 0 ? sw : 1;
  const strokeCol = sw > 0 ? stroke : "#ffffff";
  const pathAttrs = `fill="${fill}" stroke="${strokeCol}" stroke-width="${strokeW}" stroke-linejoin="round" stroke-linecap="round"`;

  if (style === "teardrop") {
    // "Rounded Pin": circle head (centre 16,14 r=13) + quadratic-bezier U-tail.
    // Path: large CW arc from left-connection (9,25) over the top to right-connection (23,25),
    // then a quadratic bezier via control (16,37) back to (9,25).
    // Tip (bezier bottom at t=0.5): group y = 0.25*25 + 0.5*37 + 0.25*25 = 31.
    const teardropPath = `d="M 9 25 A 13 13 0 1 1 23 25 Q 16 37 9 25 Z"`;
    const pinShadowRx = Math.max(4.8, 6 + dropShadowPx * 0.12) * 3;
    const pinShadowRy = Math.max(1.7, 2.2 + dropShadowPx * 0.06) * 3;
    // Tip is at group y=31 (SVG natural y=39). viewBox max group y = 82.
    const pinShadowCy = Math.min(31 + baseShadowYOffset, 82 - pinShadowRy);
    const shadowSnippet =
      dropShadowPx > 0
        ? `
    <defs>
      <radialGradient id="pin-base-shadow-grad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#000" stop-opacity="${baseShadowOpacity}"/>
        <stop offset="70%" stop-color="#000" stop-opacity="${Math.max(0.02, baseShadowOpacity * 0.38)}"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <ellipse cx="16" cy="${pinShadowCy}" rx="${pinShadowRx}" ry="${pinShadowRy}" fill="url(#pin-base-shadow-grad)"/>`
        : "";
    // Favicon circle fits inside the circle head (centre 16,14 r=13). Use r=11 to leave
    // a ring of pin colour visible around the edge.
    const faviconSnippet = hasFavicon
      ? `
    <defs><clipPath id="pin-favclip"><circle cx="16" cy="14" r="11"/></clipPath></defs>
    <path ${teardropPath} ${pathAttrs}/>
    <g clip-path="url(#pin-favclip)">
      <image href="${faviconHref}" x="5" y="3" width="22" height="22" preserveAspectRatio="xMidYMid meet"/>
    </g>`
      : `<path ${teardropPath} ${pathAttrs}/>`;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="56" height="98" viewBox="-8 -8 56 98">
        <g transform="translate(8, 8)">${shadowSnippet}${faviconSnippet.trim()}</g>
      </svg>
    `.trim();
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
  }

  // Default pin: circular top tapering to a sharp point.
  const pinPath = `d="M16,46 C8,36 2,27 2,16 A14,14 0 1,1 30,16 C30,27 24,36 16,46 Z"`;
  const pinShadowRx = Math.max(4.8, 6 + dropShadowPx * 0.12) * 3;
  const pinShadowRy = Math.max(1.7, 2.2 + dropShadowPx * 0.06) * 3;
  // viewBox max y = 90, group has translate(8,8), so max group cy = 90 - 8 - 8 - ry = 82 - ry
  const pinShadowCy = Math.min(46 + baseShadowYOffset, 82 - pinShadowRy);
  const shadowSnippet =
    dropShadowPx > 0
      ? `
    <defs>
      <radialGradient id="pin-base-shadow-grad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#000" stop-opacity="${baseShadowOpacity}"/>
        <stop offset="70%" stop-color="#000" stop-opacity="${Math.max(0.02, baseShadowOpacity * 0.38)}"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <ellipse cx="16" cy="${pinShadowCy}" rx="${pinShadowRx}" ry="${pinShadowRy}" fill="url(#pin-base-shadow-grad)"/>`
      : "";
  const faviconSnippet = hasFavicon
    ? `
    <defs><clipPath id="pin-favclip"><circle cx="16" cy="16" r="13"/></clipPath></defs>
    <path ${pinPath} ${pathAttrs}/>
    <g clip-path="url(#pin-favclip)">
      <image href="${faviconHref}" x="3" y="3" width="26" height="26" preserveAspectRatio="xMidYMid meet"/>
    </g>`
    : `<path ${pinPath} ${pathAttrs}/>`;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="56" height="98" viewBox="-8 -8 56 98">
      <g transform="translate(8, 8)">${shadowSnippet}${faviconSnippet.trim()}</g>
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
    pinDropShadowPx = 0,
    pinDropShadowDistance = 20,
    pinDropShadowOpacity = 100,
  } = options;

  if (style === "custom" && customIconUrl) return customIconUrl;
  return markerIconDataUrl(style, color, {
    borderColor: pinBorderColor,
    borderWidth: pinBorderSize,
    pinFaviconUrl: pinFaviconUrl || undefined,
    dropShadowPx: pinDropShadowPx,
    dropShadowDistance: pinDropShadowDistance,
    dropShadowOpacity: pinDropShadowOpacity,
  });
}

/** Sizes and anchors for each style so markers sit on the point correctly.
 *  Pin/teardrop SVG is 56×98 (viewBox -8 -8 56 98): 8px border padding + 28px shadow canvas below tip.
 *  anchor.y=54 is the pin tip in SVG natural coords; scaledSize.h=69 preserves the 0.7 vertical scale (98×0.7). */
export const MARKER_ANCHORS = {
  pin:      { scaledSize: { w: 39, h: 69 }, anchor: { x: 24, y: 54 } },
  // Rounded Pin tip is at SVG natural y=39 (group y=31 + 8px translate).
  teardrop: { scaledSize: { w: 39, h: 69 }, anchor: { x: 24, y: 39 } },
  dot:      { scaledSize: { w: 24, h: 24 }, anchor: { x: 12, y: 12 } },
  custom:   { scaledSize: { w: 40, h: 40 }, anchor: { x: 20, y: 40 } },
};

/** Map marker scale: medium is the design baseline (1×). */
const PIN_SIZE_MULTIPLIER = {
  small: 1,
  medium: 1.22,
  large: 1.49,
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

/**
 * Builds data URLs for map marker icons. Used by DirectoryMap and admin Design preview.
 * @param {'pin'|'dot'|'circle'} style
 * @param {string} color - hex e.g. #4A9BAA
 * @param {{ borderColor?: string, borderWidth?: number }} border - optional pin border (0-5px)
 * @returns {string} data URL for the icon
 */
export function markerIconDataUrl(style, color, border = {}) {
  const fill = color || "#4A9BAA";
  const stroke = border.borderColor || "#ffffff";
  const sw = Math.max(0, Math.min(5, Number(border.borderWidth) || 0));

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

  // default: pin — always show a stroke so the border is visible (default 1px white when border size 0)
  const pinPath = `d="M16 0C7.7 0 1 6.7 1 15c0 11.6 15 31 15 31s15-19.4 15-31C31 6.7 24.3 0 16 0z"`;
  const strokeW = sw > 0 ? sw : 1;
  const strokeCol = sw > 0 ? stroke : "#ffffff";
  const pathAttrs = `fill="${fill}" stroke="${strokeCol}" stroke-width="${strokeW}"`;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="46" viewBox="0 0 32 46">
      <path ${pinPath} ${pathAttrs}/>
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
  } = options;

  if (style === "custom" && customIconUrl) return customIconUrl;
  return markerIconDataUrl(style, color, {
    borderColor: pinBorderColor,
    borderWidth: pinBorderSize,
  });
}

/** Sizes and anchors for each style so markers sit on the point correctly */
export const MARKER_ANCHORS = {
  pin:   { scaledSize: { w: 28, h: 40 }, anchor: { x: 14, y: 40 } },
  dot:   { scaledSize: { w: 24, h: 24 }, anchor: { x: 12, y: 12 } },
  circle: { scaledSize: { w: 28, h: 28 }, anchor: { x: 14, y: 14 } },
  custom: { scaledSize: { w: 40, h: 40 }, anchor: { x: 20, y: 40 } },
};

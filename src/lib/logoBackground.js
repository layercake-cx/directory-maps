import { useEffect, useState } from "react";

/**
 * Homepage listing-card logo box background.
 *
 * Default is white (most logos are designed for it). If the image is mostly
 * transparent with light/white ink, we suggest black instead so the logo
 * stays visible. Editors can still override per entry via
 * `panel_background_color`.
 *
 * The pixel heuristic here must stay in sync with `buildCardLogoBgScript()`
 * in `supabase/functions/generate_directory_site/index.ts`.
 */

export const DEFAULT_CARD_LOGO_BG = "#ffffff";
export const LIGHT_ON_TRANSPARENT_LOGO_BG = "#000000";

const SAMPLE_SIZE = 64;
const ALPHA_TRANSPARENT = 32;
const ALPHA_OPAQUE = 160;
const LUM_LIGHT = 200;
const LUM_DARK = 80;
const MIN_TRANSPARENT_RATIO = 0.2;
const MIN_LIGHT_OF_OPAQUE = 0.65;
const MAX_DARK_OF_OPAQUE = 0.2;

/**
 * Suggest a card logo-box background from RGBA pixel data (4 bytes per pixel).
 * Safe to call from tests with a synthetic Uint8ClampedArray / number[].
 */
export function suggestLogoBackgroundFromPixels(data) {
  if (!data || data.length < 4) return DEFAULT_CARD_LOGO_BG;
  const total = Math.floor(data.length / 4);
  if (total <= 0) return DEFAULT_CARD_LOGO_BG;

  let transparent = 0;
  let light = 0;
  let dark = 0;
  let mid = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const a = data[i + 3];
    if (a < ALPHA_TRANSPARENT) {
      transparent += 1;
      continue;
    }
    // Skip antialiased fringe so downscaled thin strokes don't dilute the vote.
    if (a < ALPHA_OPAQUE) continue;
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    if (lum >= LUM_LIGHT) light += 1;
    else if (lum <= LUM_DARK) dark += 1;
    else mid += 1;
  }

  const opaque = light + dark + mid;
  if (opaque === 0) return DEFAULT_CARD_LOGO_BG;
  if (
    transparent / total >= MIN_TRANSPARENT_RATIO &&
    light / opaque >= MIN_LIGHT_OF_OPAQUE &&
    dark / opaque < MAX_DARK_OF_OPAQUE
  ) {
    return LIGHT_ON_TRANSPARENT_LOGO_BG;
  }
  return DEFAULT_CARD_LOGO_BG;
}

/** Load `url` onto a canvas and suggest white vs black. Falls back to white on CORS/decode failure. */
export function suggestLogoBackgroundFromUrl(url) {
  if (!url) return Promise.resolve(DEFAULT_CARD_LOGO_BG);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = SAMPLE_SIZE;
        canvas.height = SAMPLE_SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(DEFAULT_CARD_LOGO_BG);
          return;
        }
        ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        resolve(suggestLogoBackgroundFromPixels(ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data));
      } catch {
        resolve(DEFAULT_CARD_LOGO_BG);
      }
    };
    img.onerror = () => resolve(DEFAULT_CARD_LOGO_BG);
    img.src = url;
  });
}

/**
 * Live default for the editor card preview. `overrideColor` (the saved
 * panel_background_color) wins when set; otherwise the logo is parsed.
 */
export function useSuggestedLogoBackground(imageUrl, overrideColor) {
  const [suggested, setSuggested] = useState(DEFAULT_CARD_LOGO_BG);
  const override = String(overrideColor || "").trim();

  useEffect(() => {
    if (override) return undefined;
    if (!imageUrl) {
      setSuggested(DEFAULT_CARD_LOGO_BG);
      return undefined;
    }
    setSuggested(DEFAULT_CARD_LOGO_BG);
    let cancelled = false;
    suggestLogoBackgroundFromUrl(imageUrl).then((color) => {
      if (!cancelled) setSuggested(color);
    });
    return () => {
      cancelled = true;
    };
  }, [imageUrl, override]);

  return override || suggested;
}

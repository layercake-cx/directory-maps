/**
 * Claim banner settings: defaults, limits, variable resolution and validation
 * for the admin form and live preview. Mirrors the publish-side logic in
 * supabase/functions/generate_directory_site/builders.ts (CLAIM_BANNER_*,
 * resolveClaimVars, unknownClaimVars, isValidClaimBannerUrl);
 * supabase/functions/generate_directory_site/claimBanner_test.ts fails if the
 * two drift apart.
 */

import { contrastRatio } from "./colorContrast.js";

export const CLAIM_BANNER_DEFAULTS = {
  heading: "Is this your organisation?",
  body: "This listing hasn't been claimed. Claim it for free to update {{org_name}}'s details, description and logo.",
  buttonLabel: "Claim this listing",
  secondaryLabel: "How claiming works",
  secondaryUrl: "",
  accentColour: "#3F4C8A",
  buttonTextColour: "#FFFFFF",
  backgroundColour: "#ECEEFA",
  borderColour: "#CFD4EA",
};

export const CLAIM_BANNER_LIMITS = { heading: 80, body: 240, buttonLabel: 30, secondaryLabel: 30, secondaryUrl: 500 };

/** Listings have no short-name field, so org_name is the only variable. */
export const CLAIM_BANNER_VARIABLES = [{ name: "org_name", label: "Organisation name", example: "Academy of Medical Educators (AoME)" }];

export const SAMPLE_ORG_NAME = "Academy of Medical Educators (AoME)";

/** Settings column <-> form key map. */
export const CLAIM_BANNER_COLUMNS = {
  heading: "banner_heading",
  body: "banner_body",
  buttonLabel: "banner_button_label",
  secondaryLabel: "banner_secondary_label",
  secondaryUrl: "banner_secondary_url",
  accentColour: "banner_accent_colour",
  buttonTextColour: "banner_button_text_colour",
  backgroundColour: "banner_background_colour",
  borderColour: "banner_border_colour",
};

/** Resolves {{ name }} placeholders to plain text (React escapes it). Unknown names become "". */
export function resolveClaimVars(text, vars) {
  return String(text ?? "").replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (_m, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : "");
}

/** Placeholder names in `text` that aren't available. */
export function unknownClaimVars(text) {
  const known = CLAIM_BANNER_VARIABLES.map((v) => v.name);
  const out = [];
  for (const m of String(text ?? "").matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g)) {
    if (!known.includes(m[1]) && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

export function isValidClaimBannerUrl(url) {
  if (!url || url.length > CLAIM_BANNER_LIMITS.secondaryUrl) return false;
  if (url.startsWith("/")) return !url.startsWith("//") && !/[\s\\]/.test(url);
  if (!url.startsWith("https://")) return false;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

const HEX6 = /^#[0-9A-Fa-f]{6}$/;

/**
 * Validates the form values. Returns { errors: {field: message}, warnings: {field: message[]} }.
 * Text fields are required only while claims are enabled (enabled=false lets an admin clear them).
 */
export function validateClaimBanner(b, { enabled = true } = {}) {
  const errors = {};
  const req = (key, label) => {
    const v = (b[key] ?? "").trim();
    if (enabled && !v) errors[key] = `${label} is required.`;
    else if (v.length > CLAIM_BANNER_LIMITS[key]) errors[key] = `${label} must be ${CLAIM_BANNER_LIMITS[key]} characters or fewer.`;
  };
  req("heading", "Heading");
  req("body", "Body text");
  req("buttonLabel", "Button label");
  if ((b.secondaryLabel ?? "").length > CLAIM_BANNER_LIMITS.secondaryLabel) errors.secondaryLabel = `Link label must be ${CLAIM_BANNER_LIMITS.secondaryLabel} characters or fewer.`;
  const url = (b.secondaryUrl ?? "").trim();
  if (url && !isValidClaimBannerUrl(url)) errors.secondaryUrl = "Use an https:// address or a path starting with /.";
  for (const [key, label] of [["accentColour", "Button & icon colour"], ["buttonTextColour", "Button text colour"], ["backgroundColour", "Banner background"], ["borderColour", "Banner border"]]) {
    if (!HEX6.test(b[key] ?? "")) errors[key] = `${label} must be a hex colour like #3F4C8A.`;
  }
  const warnings = {};
  for (const key of ["heading", "body", "buttonLabel"]) {
    const unknown = unknownClaimVars(b[key]);
    if (unknown.length) warnings[key] = unknown.map((n) => `{{${n}}} isn't a known variable and will be left blank.`);
  }
  return { errors, warnings };
}

/** Contrast warnings (not blockers) for the two pairs the spec calls out. */
export function claimBannerContrastWarnings(b, bodyTextColour = "#6F7567") {
  const out = [];
  const pairs = [
    ["buttonTextColour", "Button text on button colour", contrastRatio(b.buttonTextColour, b.accentColour)],
    ["backgroundColour", "Body text on banner background", contrastRatio(bodyTextColour, b.backgroundColour)],
  ];
  for (const [field, label, ratio] of pairs) {
    if (ratio != null && ratio < 4.5) out.push({ field, label, ratio, message: `${label}: contrast ${ratio.toFixed(1)}:1. Aim for at least 4.5:1.` });
  }
  return out;
}

/** Row from directory_claim_settings -> form values (defaults for anything missing). */
export function bannerFromSettings(row) {
  const out = {};
  for (const [key, col] of Object.entries(CLAIM_BANNER_COLUMNS)) {
    const v = row?.[col];
    out[key] = v == null ? CLAIM_BANNER_DEFAULTS[key] : v;
  }
  if (row && row.banner_secondary_label === null) out.secondaryLabel = "";
  return out;
}

/** Form values -> columns to save. */
export function bannerToColumns(b) {
  const cols = {};
  for (const [key, col] of Object.entries(CLAIM_BANNER_COLUMNS)) cols[col] = (b[key] ?? "").trim();
  // Required text may be blank while claims are off; the columns are NOT NULL, so store the default instead.
  for (const key of ["heading", "body", "buttonLabel"]) {
    if (!cols[CLAIM_BANNER_COLUMNS[key]]) cols[CLAIM_BANNER_COLUMNS[key]] = CLAIM_BANNER_DEFAULTS[key];
  }
  cols.banner_secondary_label = cols.banner_secondary_label || null;
  cols.banner_secondary_url = cols.banner_secondary_url || null;
  return cols;
}

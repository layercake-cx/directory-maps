/**
 * DIR-E3 branding — named colour/font presets for DirectoryBrandingPanel.jsx.
 * A preset is a convenience for bulk-filling the form; the persisted value
 * is always the flat field set below (same shape generate_directory_site
 * reads), never a "theme name" — picking one just pre-fills every field,
 * and each field stays independently editable afterward.
 *
 * Field reference (all hex colours, all optional — generate_directory_site
 * falls back to the Natural preset's values when a directory has none set):
 *   primaryColor, primaryDarkColor, accentColor, backgroundColor,
 *   surfaceColor, surfaceAltColor, inkColor, mutedColor, lineColor,
 *   sageColor, sageInkColor, goldColor, tealColor, fontHeading, fontBody,
 *   logoUrl (not part of a preset — always left for the client to set).
 *
 * Region overrides (header/footer independent bg/text/link — see
 * generate_directory_site/builders.ts's DirectoryTheme type for the exact
 * shape): NATURAL deliberately omits them, since NATURAL is also "the
 * look of a directory that never touched branding" and that equivalence
 * (documented in builders.ts) would break if NATURAL diverged from the
 * hardcoded region defaults. The other four presets derive their region
 * values from fields they already have — see regionsFromPalette() below —
 * rather than inventing new hex constants no other field references.
 */
function regionsFromPalette(p) {
  return {
    headerBackground: { type: "solid", color: p.surfaceColor },
    headerText: p.inkColor,
    footerBackground: { type: "solid", color: p.primaryDarkColor },
    footerText: "#FFFFFF",
    footerLink: p.accentColor,
    footerLinkHover: "#FFFFFF",
  };
}

export const NATURAL = {
  primaryColor: "#2E5A39",
  primaryDarkColor: "#24462D",
  accentColor: "#C06B37",
  backgroundColor: "#FAF6EE",
  surfaceColor: "#FFFFFF",
  surfaceAltColor: "#F1ECDF",
  inkColor: "#232820",
  mutedColor: "#6F7567",
  lineColor: "#E6DFCF",
  sageColor: "#E9EEDD",
  sageInkColor: "#3C5733",
  goldColor: "#D6A23E",
  tealColor: "#0E6F68",
  fontHeading: "Spectral",
  fontBody: "Hanken Grotesk",
};

const MIDNIGHT_PALETTE = {
  primaryColor: "#5B6EF5",
  primaryDarkColor: "#3F4ECF",
  accentColor: "#D6A23E",
  backgroundColor: "#0F1420",
  surfaceColor: "#1A2032",
  surfaceAltColor: "#232B40",
  inkColor: "#EDEFF7",
  mutedColor: "#9AA1BD",
  lineColor: "#2C3450",
  sageColor: "#232B40",
  sageInkColor: "#B7C4F0",
  goldColor: "#D6A23E",
  tealColor: "#3FA8A0",
  fontHeading: "Playfair Display",
  fontBody: "Hanken Grotesk",
};
export const MIDNIGHT = { ...MIDNIGHT_PALETTE, ...regionsFromPalette(MIDNIGHT_PALETTE) };

const COASTAL_PALETTE = {
  primaryColor: "#1F6E8C",
  primaryDarkColor: "#17546A",
  accentColor: "#E0714B",
  backgroundColor: "#F5FAFA",
  surfaceColor: "#FFFFFF",
  surfaceAltColor: "#E8F2F2",
  inkColor: "#1B2B33",
  mutedColor: "#5C7480",
  lineColor: "#D6E6E8",
  sageColor: "#E3F1F0",
  sageInkColor: "#1F6E8C",
  goldColor: "#E3B341",
  tealColor: "#0E8F82",
  fontHeading: "Inter",
  fontBody: "Inter",
};
export const COASTAL = { ...COASTAL_PALETTE, ...regionsFromPalette(COASTAL_PALETTE) };

const HERITAGE_PALETTE = {
  primaryColor: "#7A2E3A",
  primaryDarkColor: "#5C222C",
  accentColor: "#C6952E",
  backgroundColor: "#FAF3E9",
  surfaceColor: "#FFFFFF",
  surfaceAltColor: "#F0E4D3",
  inkColor: "#2B211D",
  mutedColor: "#7A6D62",
  lineColor: "#E4D5BE",
  sageColor: "#F0E4D3",
  sageInkColor: "#7A2E3A",
  goldColor: "#C6952E",
  tealColor: "#5A6B5E",
  fontHeading: "Fraunces",
  fontBody: "Hanken Grotesk",
};
export const HERITAGE = { ...HERITAGE_PALETTE, ...regionsFromPalette(HERITAGE_PALETTE) };

const SLATE_PALETTE = {
  primaryColor: "#3E4551",
  primaryDarkColor: "#2A2F38",
  accentColor: "#2F7DE1",
  backgroundColor: "#FAFAFB",
  surfaceColor: "#FFFFFF",
  surfaceAltColor: "#EEF0F3",
  inkColor: "#1E2228",
  mutedColor: "#6B7280",
  lineColor: "#E1E4E9",
  sageColor: "#EEF0F3",
  sageInkColor: "#3E4551",
  goldColor: "#C99A2E",
  tealColor: "#2F7DE1",
  fontHeading: "Hanken Grotesk",
  fontBody: "Hanken Grotesk",
};
export const SLATE = { ...SLATE_PALETTE, ...regionsFromPalette(SLATE_PALETTE) };

// Google Fonts CSS2 family+weight query segment per font name — generated
// from scripts/directory-font-catalog.json (run
// scripts/generate-directory-font-catalog.mjs after editing that list) so
// this and generate_directory_site's copy (fontCatalog.generated.ts) can
// no longer drift out of sync by hand.
export { FONT_CATALOG } from "./directoryFontCatalog.generated.js";

export const DIRECTORY_THEME_PRESETS = [
  { key: "natural", label: "Natural", description: "Earthy sage & terracotta — conservation, wildlife, outdoor.", values: NATURAL },
  { key: "midnight", label: "Midnight", description: "Dark, premium, authoritative.", values: MIDNIGHT },
  { key: "coastal", label: "Coastal", description: "Airy blues & teal — travel, leisure, maritime.", values: COASTAL },
  { key: "heritage", label: "Heritage", description: "Warm burgundy & gold, serif-forward — formal membership bodies.", values: HERITAGE },
  { key: "slate", label: "Slate", description: "Minimal neutral grey with one accent — corporate, B2B.", values: SLATE },
];

export function getThemePreset(key) {
  return DIRECTORY_THEME_PRESETS.find((p) => p.key === key)?.values ?? null;
}

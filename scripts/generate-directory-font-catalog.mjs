#!/usr/bin/env node
/**
 * Regenerates the two runtime FONT_CATALOG files from one canonical source
 * (directory-font-catalog.json), so the curated Google Fonts list for
 * directory branding is edited in exactly one place instead of by hand in
 * both src/lib/directoryThemePresets.js and generate_directory_site's
 * builders.ts — those two files previously had to be kept in sync by hand
 * across the JS (Vite)/TS (Deno) runtime boundary, which is exactly the
 * kind of thing that silently drifts.
 *
 * Run after editing directory-font-catalog.json:
 *   node scripts/generate-directory-font-catalog.mjs
 *
 * Writes:
 *   src/lib/directoryFontCatalog.generated.js
 *   supabase/functions/generate_directory_site/fontCatalog.generated.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(repoRoot, "scripts", "directory-font-catalog.json");
const fonts = JSON.parse(readFileSync(sourcePath, "utf8"));

function cssQuerySegment(family, weights) {
  const urlFamily = family.replace(/\s+/g, "+");
  return `${urlFamily}:wght@${weights.join(";")}`;
}

const entries = fonts.map((f) => [f.family, cssQuerySegment(f.family, f.weights)]);
const objectBody = entries.map(([family, segment]) => `  ${JSON.stringify(family)}: ${JSON.stringify(segment)},`).join("\n");

const header = `// GENERATED FILE — do not hand-edit. Regenerate with:
//   node scripts/generate-directory-font-catalog.mjs
// Source of truth: scripts/directory-font-catalog.json
`;

writeFileSync(
  path.join(repoRoot, "src", "lib", "directoryFontCatalog.generated.js"),
  `${header}\nexport const FONT_CATALOG = {\n${objectBody}\n};\n`,
);

writeFileSync(
  path.join(repoRoot, "supabase", "functions", "generate_directory_site", "fontCatalog.generated.ts"),
  `${header}\nexport const FONT_CATALOG: Record<string, string> = {\n${objectBody}\n};\n`,
);

console.log(`Generated FONT_CATALOG (${entries.length} families) in both runtimes.`);

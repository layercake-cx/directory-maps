#!/usr/bin/env node
/**
 * Block registry: one source, three runtimes.
 *
 * scripts/block-registry.json defines every page block type (fields, limits,
 * regions, page kinds). It is read by:
 *   - the React editor        -> src/lib/blockRegistry.generated.js
 *   - the Edge Function       -> supabase/functions/_shared/blockRegistry.generated.ts
 *   - Postgres (validation)   -> public.block_registry(), embedded in a migration
 *
 * Run after editing block-registry.json:
 *   node scripts/generate-block-registry.mjs          write the JS and TS files
 *   node scripts/generate-block-registry.mjs --sql    print the SQL function for a NEW migration
 *   node scripts/generate-block-registry.mjs --check  fail if any copy has drifted
 *
 * Migrations are immutable once applied, so a registry change ships as a new
 * migration that re-creates block_registry() from the --sql output.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(repoRoot, "scripts", "block-registry.json");
const registry = JSON.parse(readFileSync(sourcePath, "utf8"));
const compact = JSON.stringify(registry);

const header = `// GENERATED FILE — do not hand-edit. Regenerate with:
//   node scripts/generate-block-registry.mjs
// Source of truth: scripts/block-registry.json
`;
const jsPath = path.join(repoRoot, "src", "lib", "blockRegistry.generated.js");
const tsPath = path.join(repoRoot, "supabase", "functions", "_shared", "blockRegistry.generated.ts");
const jsBody = `${header}export const BLOCK_REGISTRY = ${JSON.stringify(registry, null, 2)};\n`;
const tsBody = `${header}// deno-lint-ignore-file\nexport const BLOCK_REGISTRY = ${JSON.stringify(registry, null, 2)} as const;\n`;

function sqlFunction() {
  if (compact.includes("$registry$")) throw new Error("registry contains the $registry$ delimiter");
  return `create or replace function public.block_registry()
returns jsonb
language sql
immutable
set search_path = public
as $fn$ select $registry$${compact}$registry$::jsonb $fn$;
`;
}

/** The JSON embedded in the newest migration that defines block_registry(). */
function latestMigrationRegistry() {
  const dir = path.join(repoRoot, "supabase", "migrations");
  const files = readdirSync(dir).filter((f) => /^\d{14}_.*\.sql$/.test(f)).sort().reverse();
  for (const f of files) {
    const text = readFileSync(path.join(dir, f), "utf8");
    const m = text.match(/function public\.block_registry\(\)[\s\S]*?\$registry\$([\s\S]*?)\$registry\$/);
    if (m) return { file: f, json: m[1] };
  }
  return null;
}

const arg = process.argv[2];
if (arg === "--sql") {
  process.stdout.write(sqlFunction());
} else if (arg === "--check") {
  const problems = [];
  const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } };
  if (read(jsPath) !== jsBody) problems.push("src/lib/blockRegistry.generated.js is out of date");
  if (read(tsPath) !== tsBody) problems.push("supabase/functions/_shared/blockRegistry.generated.ts is out of date");
  const mig = latestMigrationRegistry();
  if (!mig) problems.push("no migration defines public.block_registry()");
  else if (JSON.stringify(JSON.parse(mig.json)) !== compact) problems.push(`${mig.file} embeds a different registry; ship a new migration from --sql`);
  if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
  console.log("block registry: all copies match");
} else {
  writeFileSync(jsPath, jsBody);
  writeFileSync(tsPath, tsBody);
  console.log(`wrote ${path.relative(repoRoot, jsPath)} and ${path.relative(repoRoot, tsPath)}`);
}

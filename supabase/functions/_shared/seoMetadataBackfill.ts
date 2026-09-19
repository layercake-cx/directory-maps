// On-build, non-destructive SEO metadata backfill — Phase 3 of the
// Directory Searchability & AI Metadata plan (docs/DEPLOYMENTS.md,
// 2026-09-19). Called from generate_directory_site on every publish/rebuild.
// The rule (per the product doc): a field with content — written by an
// editor, or by the Phase 2 "Generate with AI" button — is never touched;
// only genuinely empty fields get an AI draft. Presence-based, so it's
// always safe to call again: once a field is filled, it stays filled.
//
// Platform: ANTHROPIC_API_KEY. Never throws — a backfill failure (missing
// key, Anthropic error, one bad entry) must not break the publish it's
// riding along with; it just leaves the field empty for the next build.

import { createServiceClient } from "./supabase.ts";
import { logEdgeFunctionError } from "./errorLog.ts";
import {
  generateEntrySeoMetadataDraft,
  generateDirectorySeoMetadataDraft,
  type EntrySeoMetadataDraft,
} from "./seoMetadataGeneration.ts";
// Entry is generate_directory_site's own render-time type (builders.ts) —
// imported here (rather than duplicating its field list) so an
// EntrySeoBackfillRow is a strict superset and can be passed anywhere an
// Entry is expected, both in index.ts's render loop and into
// generateEntrySeoMetadataDraft's narrower EntryForSeoGeneration parameter.
import type { Entry } from "../generate_directory_site/builders.ts";

// Bounds cost/time on a large directory's first build with everything
// empty (open question in the product doc: uk-associations.com has 329
// entries — 329 sequential Claude calls in one Edge Function invocation
// risks a timeout and would fail the whole publish over metadata, not the
// pages themselves). Entries beyond the cap are simply picked up by a later
// republish — safe because the check is presence-based, not one-shot.
const MAX_ENTRY_BACKFILL_PER_BUILD = 20;

const SEO_DRAFT_FIELDS = ["meta_title", "meta_description", "keywords", "og_title", "og_description", "ai_summary"] as const;
type SeoDraftField = (typeof SEO_DRAFT_FIELDS)[number];

export type EntrySeoBackfillRow = Entry & {
  keywords: string | null;
  og_title: string | null;
  og_description: string | null;
  ai_summary: string | null;
};

function isBlank(value: string | null | undefined): boolean {
  return !value || !value.trim();
}

function missingAnySeoField(entry: EntrySeoBackfillRow): boolean {
  return SEO_DRAFT_FIELDS.some((key) => isBlank(entry[key]));
}

/**
 * Mutates each backfilled entry in place — so this same build's rendered
 * pages already reflect the fresh values, not just the next one — and
 * persists only the fields that were actually empty.
 */
export async function backfillEntrySeoMetadata(
  db: ReturnType<typeof createServiceClient>,
  apiKey: string | undefined,
  entries: EntrySeoBackfillRow[],
  directoryName: string,
): Promise<void> {
  if (!apiKey) return;
  const candidates = entries.filter(missingAnySeoField).slice(0, MAX_ENTRY_BACKFILL_PER_BUILD);

  for (const entry of candidates) {
    try {
      const draft = await generateEntrySeoMetadataDraft(apiKey, entry, directoryName);
      const update: Partial<Record<SeoDraftField, string>> & { seo_metadata_ai_generated_at?: string } = {};
      for (const key of SEO_DRAFT_FIELDS) {
        if (!isBlank(entry[key])) continue;
        const value = draft[key as keyof EntrySeoMetadataDraft];
        if (isBlank(value)) continue;
        update[key] = value;
        entry[key] = value;
      }
      if (Object.keys(update).length === 0) continue;
      update.seo_metadata_ai_generated_at = new Date().toISOString();

      const { error } = await db.from("directory_entries").update(update).eq("id", entry.id);
      if (error) throw error;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await logEdgeFunctionError({
        fn: "generate_directory_site",
        message: `SEO metadata backfill failed for entry ${entry.id}: ${message}`,
        context: { entry_id: entry.id },
      });
      // Swallow — one entry's failed draft must not fail the whole publish.
    }
  }
}

export type DirectorySeoDefaults = {
  meta_title_template?: string | null;
  meta_description?: string | null;
  [key: string]: unknown;
};

/**
 * Directory-homepage equivalent of backfillEntrySeoMetadata — a one-off fill
 * of meta_title_template/meta_description, skipped entirely once both are
 * set. Returns the merged seo_defaults_json on success (so the caller can
 * use it for this same build's landing page) or null if nothing changed.
 */
export async function backfillDirectorySeoMetadata(
  db: ReturnType<typeof createServiceClient>,
  apiKey: string | undefined,
  directoryId: string,
  directoryName: string,
  directoryDescription: string | null,
  entryCount: number,
  categorisationLabels: string[],
  currentSeoDefaults: DirectorySeoDefaults,
): Promise<DirectorySeoDefaults | null> {
  if (!apiKey) return null;
  const hasTitle = !isBlank(currentSeoDefaults.meta_title_template);
  const hasDescription = !isBlank(currentSeoDefaults.meta_description);
  if (hasTitle && hasDescription) return null;

  try {
    const draft = await generateDirectorySeoMetadataDraft(apiKey, directoryName, directoryDescription, entryCount, categorisationLabels);
    const nextSeoDefaults: DirectorySeoDefaults = {
      ...currentSeoDefaults,
      meta_title_template: hasTitle ? currentSeoDefaults.meta_title_template : draft.meta_title_template,
      meta_description: hasDescription ? currentSeoDefaults.meta_description : draft.meta_description,
    };
    const { error } = await db.from("directories").update({ seo_defaults_json: nextSeoDefaults }).eq("id", directoryId);
    if (error) throw error;
    return nextSeoDefaults;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logEdgeFunctionError({
      fn: "generate_directory_site",
      message: `Directory SEO metadata backfill failed: ${message}`,
      context: { directory_id: directoryId },
    });
    return null;
  }
}

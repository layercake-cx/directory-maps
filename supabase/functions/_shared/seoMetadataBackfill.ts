// Non-destructive SEO metadata backfill helpers — Directory Searchability &
// AI Metadata plan, Phase 3. Entry-level backfill runs as an async queue
// (entry_seo_metadata_jobs, process_entry_seo_metadata_jobs — see
// 20260919130000_directory_seo_metadata_backfill_queue.sql), not inline
// during publish: an earlier version of this file capped an inline,
// per-build backfill at 20 entries to bound one publish call's cost/time,
// but that cap was arbitrary and coupled AI generation cost to the publish
// action for no good reason — the queue decouples them entirely, the same
// way entry body content generation already works.
//
// Directory-level backfill (the homepage's own meta_title_template/
// meta_description) stays inline in generate_directory_site: it's at most
// one extra Claude call per publish, self-limiting since it's skipped
// entirely once both fields are set, so it never had the cost/time problem
// the entry-level cap was working around.
//
// Platform: ANTHROPIC_API_KEY. Both functions here are written to never
// throw past their own boundary in ways that would break a caller's larger
// operation (publish, or the queue worker) — callers still see errors
// logged via logEdgeFunctionError.

import { createServiceClient } from "./supabase.ts";
import { logEdgeFunctionError } from "./errorLog.ts";
import {
  generateDirectorySeoMetadataDraft,
  type EntrySeoMetadataDraft,
} from "./seoMetadataGeneration.ts";
// Entry is generate_directory_site's own render-time type (builders.ts) —
// imported here (rather than duplicating its field list) so an
// EntrySeoBackfillRow is a strict superset and can be passed anywhere an
// Entry is expected, both in index.ts's render loop and into
// generateEntrySeoMetadataDraft's narrower EntryForSeoGeneration parameter.
import type { Entry } from "../generate_directory_site/builders.ts";

export const SEO_DRAFT_FIELDS = ["meta_title", "meta_description", "keywords", "og_title", "og_description", "ai_summary"] as const;
export type SeoDraftField = (typeof SEO_DRAFT_FIELDS)[number];

export type EntrySeoBackfillRow = Entry & {
  keywords: string | null;
  og_title: string | null;
  og_description: string | null;
  ai_summary: string | null;
};

function isBlank(value: string | null | undefined): boolean {
  return !value || !value.trim();
}

export function missingAnySeoField(entry: Pick<EntrySeoBackfillRow, SeoDraftField>): boolean {
  return SEO_DRAFT_FIELDS.some((key) => isBlank(entry[key]));
}

/**
 * Given an entry and a freshly-drafted set of all six fields, returns only
 * the ones that were actually empty on the entry — the presence rule that
 * makes this backfill non-destructive regardless of who calls it or how
 * often. Returns null if nothing was actually missing (caller can skip the
 * DB write entirely).
 */
export function computeSeoMetadataUpdate(
  entry: Pick<EntrySeoBackfillRow, SeoDraftField>,
  draft: EntrySeoMetadataDraft,
): (Partial<Record<SeoDraftField, string>> & { seo_metadata_ai_generated_at: string }) | null {
  const update: Partial<Record<SeoDraftField, string>> = {};
  for (const key of SEO_DRAFT_FIELDS) {
    if (!isBlank(entry[key])) continue;
    const value = draft[key];
    if (isBlank(value)) continue;
    update[key] = value;
  }
  if (Object.keys(update).length === 0) return null;
  return { ...update, seo_metadata_ai_generated_at: new Date().toISOString() };
}

export type DirectorySeoDefaults = {
  meta_title_template?: string | null;
  meta_description?: string | null;
  [key: string]: unknown;
};

/**
 * Directory-homepage backfill of meta_title_template/meta_description,
 * skipped entirely once both are set. Returns the merged seo_defaults_json
 * on success (so the caller can use it for this same build's landing page)
 * or null if nothing changed. Called inline from generate_directory_site —
 * see the file header for why this one stays inline rather than moving to
 * the async queue.
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

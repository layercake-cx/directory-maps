/**
 * generate_directory_site (DIR-E2 — Directories build-out, Phase 3b)
 *
 * The Directory entity's own static-publish generator — NOT to be confused
 * with generate_directory_pages (Epic 3), which generates SEO pages from an
 * existing Map's listings. This one generates pages for a Directory
 * (directories/directory_entries), a separate, newer product entity. Kept
 * as its own function rather than folded into generate_directory_pages: the
 * two entities have unrelated gating (feature flag vs. a paid map
 * entitlement) and mixing that into one function body risked exactly the
 * naming confusion this comment exists to avoid. Both share the
 * entity-agnostic rendering mechanics via _shared/staticSiteRenderer.ts.
 *
 * Generates a directory landing page plus one page per active entry, each
 * with schema.org JSON-LD, and uploads them to Vercel Blob at deterministic
 * paths — a distinct top-level prefix ("directories/", plural) from
 * generate_directory_pages' ("directory/", singular) so the two can never
 * collide even if a client's map slug and directory slug happen to match:
 *
 *   directories/<client_slug>/<directory_slug>/index.html
 *   directories/<client_slug>/<directory_slug>/<entry_slug>.html
 *   directories/<client_slug>/<directory_slug>/sitemap.xml
 *   directories/<client_slug>/<directory_slug>/robots.txt
 *
 * middleware.js serves these at /directories/:clientSlug/:directorySlug
 * [/:entrySlug] on the branded domain — a path shape chosen specifically to
 * never collide with the existing /:clientSlug/:mapSlug interactive-map
 * route (which is exactly 2 segments, client-side routed, and must not pay
 * for an extra lookup on every load). The same output also serves a
 * directory's own custom domain root (client_domains.directory_id,
 * DomainSettings.jsx, since 20260827130000) via middleware.js's
 * handleCustomDomain — the one place robots.txt is actually honoured by a
 * real crawler, since crawlers only ever fetch a domain's own root
 * /robots.txt, never a per-path one.
 *
 * Gated on the `directories` feature flag only — this entity has no
 * separate commercial entitlement yet (unlike directory_pages, which is a
 * paid map add-on); if a client can use Directories at all, they can
 * publish one.
 *
 * A directory must already be published (directories.current_publication_id
 * set, via the publish_directory RPC) before this runs — there is no
 * Publish UI yet to call that RPC from, so this function can only be
 * exercised today via a direct RPC call. Entries and their tags/extras are
 * read live at generation time, never snapshotted (see
 * 20260827120000_directory_publish_foundation.sql's header comment for why
 * this mirrors map_publications/EmbedMap.jsx's existing split).
 *
 * Body (JSON): { directory_id: string } or { all: true }
 * Auth: service-role only (called server-side).
 */

import { createServiceClient } from "../_shared/supabase.ts";
import { resolveFeatureFlag } from "../_shared/featureFlags.ts";
import { backfillDirectorySeoMetadata } from "../_shared/seoMetadataBackfill.ts";
import {
  CORS,
  json,
  uploadToBlob,
  buildSitemapXml,
  buildRobotsTxt,
  mapWithConcurrency,
} from "../_shared/staticSiteRenderer.ts";

import {
  SITE_ORIGIN,
  resolveLayout,
  buildEntryPage,
  buildDirectoryLandingPage,
  buildLlmsTxt,
  relatedEntries,
  type Entry,
  type DirectoryTheme,
  type EntryTemplateRow,
  type CategorisationTerm,
  type EvidenceItem,
  type MediaAsset,
  type AccreditationHeld,
  type EntryLink,
  type ProductTile,
  type FilterBarCategorisation,
  type AiSearchOptions,
} from "./builders.ts";

/**
 * Records generate_directory_site's outcome on directories.site_generation_*
 * so the Publish panel can show live status regardless of whether the
 * browser tab that triggered it is still open (see
 * 20260828120000_directory_site_generation_status.sql).
 */
async function generateForDirectory(directoryId: string): Promise<{ directory_id: string; skipped?: string; count?: number }> {
  const db = createServiceClient();
  try {
    const result = await generateForDirectoryInner(db, directoryId);
    if (!result.skipped) {
      await db
        .from("directories")
        .update({ site_generation_status: "succeeded", site_generated_at: new Date().toISOString(), site_generation_error: null })
        .eq("id", directoryId);
    }
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("directories").update({ site_generation_status: "failed", site_generation_error: msg }).eq("id", directoryId);
    throw e;
  }
}

async function generateForDirectoryInner(
  db: ReturnType<typeof createServiceClient>,
  directoryId: string,
): Promise<{ directory_id: string; skipped?: string; count?: number }> {
  const { data: directory, error: dirErr } = await db
    .from("directories")
    .select("id, client_id, name, slug, description, current_publication_id, seo_defaults_json, seo_og_image_url, theme_json, ai_search_prompt")
    .eq("id", directoryId)
    .single();
  if (dirErr) throw new Error(`Directory query failed: ${dirErr.message}`);
  if (!directory?.current_publication_id) throw new Error(`Directory ${directoryId} has no current publication — publish it first`);

  const theme: DirectoryTheme =
    directory.theme_json && typeof directory.theme_json === "object" ? (directory.theme_json as DirectoryTheme) : {};

  // Settings tab's "General settings"/"SEO settings" — seo_defaults_json
  // existed as a data-layer-only column since 20260827120000 but was never
  // consumed until now. default_noindex is the single "let search engines
  // index this directory" switch: it gates the landing page's own noindex
  // meta tag, whether its URL appears in sitemap.xml, and robots.txt
  // Allow/Disallow below — entries keep their own independent per-entry
  // noindex regardless of this directory-wide setting.
  let seoDefaults = (directory.seo_defaults_json ?? {}) as {
    meta_title_template?: string | null;
    meta_description?: string | null;
    default_noindex?: boolean | null;
  };
  const directoryNoindex = !!seoDefaults.default_noindex;

  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");

  const { data: client, error: clientErr } = await db.from("clients").select("id, slug").eq("id", directory.client_id).single();
  if (clientErr) throw new Error(`Client query failed: ${clientErr.message}`);

  const flagEnabled = await resolveFeatureFlag(db, client.id, "directories");
  if (!flagEnabled) return { directory_id: directoryId, skipped: "flag_disabled" };

  await db
    .from("directories")
    .update({ site_generation_status: "running", site_generation_started_at: new Date().toISOString() })
    .eq("id", directoryId);

  const { data: entryRows, error: entryErr } = await db
    .from("directory_entries")
    .select(
      "id, name, slug, directory_group_id, address, postcode, country, city, phone, email, website_url, logo_url, notes_html, allow_html, lat, lng, show_phone, show_email, show_website, show_address, meta_title, meta_description, noindex, structured_data_type, panel_image_url, panel_background_color",
    )
    .eq("directory_id", directoryId)
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (entryErr) throw new Error(`Entries query failed: ${entryErr.message}`);
  const entries = (entryRows ?? []) as Entry[];
  const entryIds = entries.map((e) => e.id);

  let evidenceByEntry = new Map<string, EvidenceItem[]>();
  let mediaByEntry = new Map<string, MediaAsset[]>();
  let accreditationsByEntry = new Map<string, AccreditationHeld[]>();
  let linksByEntry = new Map<string, EntryLink[]>();
  let tilesByEntry = new Map<string, ProductTile[]>();
  let directoryLinks: EntryLink[] = [];

  if (entryIds.length > 0) {
    const [evidenceRes, mediaRes, accRes, entryLinksRes, tilesRes] = await Promise.all([
      db.from("entry_evidence_items").select("entry_id, claim, value, source_url, confidence").in("entry_id", entryIds).order("sort_order", { ascending: true }),
      db.from("entry_media_assets").select("entry_id, url, alt_text, caption, is_hero").in("entry_id", entryIds).order("sort_order", { ascending: true }),
      db
        .from("entry_accreditations")
        .select("entry_id, directory_accreditation_schemes(name, issuing_body, badge_image_url)")
        .in("entry_id", entryIds),
      db.from("prominent_links").select("entry_id, directory_id, label, url, style, open_in_new, tracking").in("entry_id", entryIds).order("sort_order", { ascending: true }),
      db.from("product_tiles").select("entry_id, title, image_url, price, currency, rating, provider, destination_url").in("entry_id", entryIds).order("sort_order", { ascending: true }),
    ]);
    if (evidenceRes.error) throw new Error(`Evidence query failed: ${evidenceRes.error.message}`);
    if (mediaRes.error) throw new Error(`Media query failed: ${mediaRes.error.message}`);
    if (accRes.error) throw new Error(`Accreditations query failed: ${accRes.error.message}`);
    if (entryLinksRes.error) throw new Error(`Prominent links query failed: ${entryLinksRes.error.message}`);
    if (tilesRes.error) throw new Error(`Product tiles query failed: ${tilesRes.error.message}`);

    for (const row of (evidenceRes.data ?? []) as EvidenceItem[]) {
      const list = evidenceByEntry.get(row.entry_id) ?? [];
      list.push(row);
      evidenceByEntry.set(row.entry_id, list);
    }
    for (const row of (mediaRes.data ?? []) as MediaAsset[]) {
      const list = mediaByEntry.get(row.entry_id) ?? [];
      list.push(row);
      mediaByEntry.set(row.entry_id, list);
    }
    for (const row of (accRes.data ?? []) as { entry_id: string; directory_accreditation_schemes: AccreditationHeld | AccreditationHeld[] | null }[]) {
      const scheme = Array.isArray(row.directory_accreditation_schemes) ? row.directory_accreditation_schemes[0] : row.directory_accreditation_schemes;
      if (!scheme) continue;
      const list = accreditationsByEntry.get(row.entry_id) ?? [];
      list.push({ entry_id: row.entry_id, name: scheme.name, issuing_body: scheme.issuing_body, badge_image_url: scheme.badge_image_url });
      accreditationsByEntry.set(row.entry_id, list);
    }
    for (const row of (entryLinksRes.data ?? []) as EntryLink[]) {
      if (!row.entry_id) continue;
      const list = linksByEntry.get(row.entry_id) ?? [];
      list.push(row);
      linksByEntry.set(row.entry_id, list);
    }
    for (const row of (tilesRes.data ?? []) as ProductTile[]) {
      const list = tilesByEntry.get(row.entry_id) ?? [];
      list.push(row);
      tilesByEntry.set(row.entry_id, list);
    }
  }

  {
    const { data: dirLinkRows, error: dirLinkErr } = await db
      .from("prominent_links")
      .select("entry_id, directory_id, label, url, style, open_in_new, tracking")
      .eq("directory_id", directoryId)
      .order("sort_order", { ascending: true });
    if (dirLinkErr) throw new Error(`Directory prominent links query failed: ${dirLinkErr.message}`);
    directoryLinks = (dirLinkRows ?? []) as EntryLink[];
  }

  // DIR-E6 — entry_templates (block order) and the entry-scoped
  // categorisation terms needed both to resolve which template applies per
  // entry (term match takes precedence) and to render "categorisation"
  // blocks. Client-scoped, not directory-scoped, same as categorisations
  // generally (docs/DIRECTORIES.md §4.3) — filtered to this directory's
  // actual usage via entry_category_terms below.
  //
  // Tolerant of the table not existing at all: the migration and this
  // deploy are two independent, non-atomic operations (same class of risk
  // as the custom-domain RPC shape in 20260827130000), and unlike that
  // change, this query runs on EVERY directory's publish, not just ones
  // using the new feature — a hard failure here during any deploy-ordering
  // gap, or after a rollback that hasn't also reverted this code, would
  // break publishing entirely rather than just degrading to the pre-DIR-E6
  // block order. A real permissions/schema problem still surfaces via the
  // downstream queries below, which are not given this same tolerance.
  let templates: EntryTemplateRow[] = [];
  {
    const { data: templateRows, error: templateErr } = await db
      .from("entry_templates")
      .select("id, is_default, applies_to_group_id, applies_to_term_id, layout_json")
      .eq("directory_id", directoryId);
    if (templateErr) {
      console.error(`entry_templates query failed, falling back to the implicit default layout: ${templateErr.message}`);
    } else {
      templates = (templateRows ?? []) as EntryTemplateRow[];
    }
  }

  const entryTermIdsByEntry = new Map<string, Set<string>>();
  const termSortOrder = new Map<string, number>();
  /** Distinct categorisations + terms actually in use on this directory's entries — feeds exploreFilterBar's real, working chips (DIR-E5-S4). */
  const categorisationCatalog = new Map<string, { id: string; key: string; label: string; field_type: FilterBarCategorisation["field_type"]; termsById: Map<string, CategorisationTerm> }>();

  // Only categorisations currently attached to this directory
  // (categorisation_attachments, target_type='directory') feed the filter
  // bar / template block rendering below — detaching a categorisation stops
  // it appearing here even if entries still carry old tags for it, matching
  // the explicit opt-in model (20260829040000_create_categorisation_attachments.sql).
  // sort_order (20260914170000) is the admin-configured filter-rail render
  // order for the directory browse/entry redesign — falls back to label
  // order (via the final .sort below) for any two attachments still tied
  // at the default 0.
  const { data: attachmentRows, error: attachErr } = await db
    .from("categorisation_attachments")
    .select("categorisation_id, sort_order")
    .eq("target_type", "directory")
    .eq("target_id", directory.id);
  if (attachErr) throw new Error(`Categorisation attachments query failed: ${attachErr.message}`);
  const attachedCategorisationIds = new Set((attachmentRows ?? []).map((r) => r.categorisation_id));
  const attachmentSortOrder = new Map<string, number>((attachmentRows ?? []).map((r) => [r.categorisation_id, r.sort_order ?? 0]));

  if (entryIds.length > 0 && attachedCategorisationIds.size > 0) {
    const { data: ectRows, error: ectErr } = await db
      .from("entry_category_terms")
      .select("entry_id, category_terms(id, categorisation_id, label, slug, sort_order, categorisations(key, label, field_type))")
      .in("entry_id", entryIds);
    if (ectErr) throw new Error(`Entry category terms query failed: ${ectErr.message}`);

    type TermEmbed = CategorisationTerm & { categorisations: { key: string; label: string; field_type: string } | { key: string; label: string; field_type: string }[] | null };
    for (const row of (ectRows ?? []) as unknown as { entry_id: string; category_terms: TermEmbed | TermEmbed[] | null }[]) {
      const term = Array.isArray(row.category_terms) ? row.category_terms[0] : row.category_terms;
      if (!term) continue;
      const cat = Array.isArray(term.categorisations) ? term.categorisations[0] : term.categorisations;
      if (!cat) continue;
      if (!attachedCategorisationIds.has(term.categorisation_id)) continue;

      termSortOrder.set(term.id, term.sort_order);

      const idSet = entryTermIdsByEntry.get(row.entry_id) ?? new Set<string>();
      idSet.add(term.id);
      entryTermIdsByEntry.set(row.entry_id, idSet);

      const termRow: CategorisationTerm = { id: term.id, categorisation_id: term.categorisation_id, label: term.label, slug: term.slug, sort_order: term.sort_order };
      const fieldType: FilterBarCategorisation["field_type"] =
        cat.field_type === "single_select" || cat.field_type === "boolean" ? cat.field_type : "multi_select";
      const catEntry = categorisationCatalog.get(term.categorisation_id) ?? {
        id: term.categorisation_id,
        key: cat.key,
        label: cat.label,
        field_type: fieldType,
        termsById: new Map<string, CategorisationTerm>(),
      };
      catEntry.termsById.set(term.id, termRow);
      categorisationCatalog.set(term.categorisation_id, catEntry);
    }
  }

  const filterBarCategorisations: FilterBarCategorisation[] = [...categorisationCatalog.values()]
    .map((c) => ({
      id: c.id,
      key: c.key,
      label: c.label,
      field_type: c.field_type,
      terms: [...c.termsById.values()].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.label.localeCompare(b.label)),
    }))
    .sort(
      (a, b) =>
        (attachmentSortOrder.get(a.id) ?? 0) - (attachmentSortOrder.get(b.id) ?? 0) || a.label.localeCompare(b.label),
    );

  const entryTermIdsFlat = new Map<string, string[]>();
  for (const [entryId, idSet] of entryTermIdsByEntry) entryTermIdsFlat.set(entryId, [...idSet]);

  // Directory-homepage SEO metadata backfill — one-off, skipped entirely
  // once both fields are set. Stays inline here (unlike the entry-level
  // backfill, which moved to an async queue — see _shared/seoMetadataBackfill.ts's
  // header) since it's at most one extra Claude call per publish.
  // filterBarCategorisations' labels double as the "categorised by X"
  // context, no separate lookup needed.
  const directorySeoBackfill = await backfillDirectorySeoMetadata(
    db,
    anthropicApiKey,
    directory.id,
    directory.name,
    directory.description,
    entries.length,
    filterBarCategorisations.map((c) => c.label),
    seoDefaults,
  );
  if (directorySeoBackfill) seoDefaults = directorySeoBackfill;

  const basePath = `directories/${client.slug}/${directory.slug}`;

  // Decision (2026-08-28): a directory's homepage map is exclusively the
  // Map product attached to it via DIR-E4 — Maps and Directories are two
  // separate Layercake products that compose through this attachment, not
  // two independent map implementations. No attached map means no map
  // section on the homepage, not a homegrown fallback built from
  // directory_entries (that fallback existed before this decision and has
  // been removed, along with the /directory-embed route it fed). Computed
  // before the entry-page loop below so each entry's "Show on map" /
  // "Open in directory map" links (Phase 3) can use it too.
  let attachedMapEmbedSrc: string | null = null;
  const { data: mapAssoc } = await db
    .from("directory_map_associations")
    .select("map_id")
    .eq("directory_id", directory.id)
    .limit(1)
    .maybeSingle();
  if (mapAssoc?.map_id) {
    const { data: attachedMap } = await db.from("maps").select("slug").eq("id", mapAssoc.map_id).maybeSingle();
    attachedMapEmbedSrc = attachedMap?.slug
      ? `${SITE_ORIGIN}/${client.slug}/${attachedMap.slug}`
      : `${SITE_ORIGIN}/embed?map=${encodeURIComponent(mapAssoc.map_id)}`;
  }

  // Static Maps API key for each entry page's Location thumbnail (Phase 3)
  // — additive and optional: falls back to no image (never blocks
  // generation) if unset. Same env var precedence as geocode_listings/
  // geocode_address/geocode_directory_entries; a key scoped for geocoding
  // only may need the Static Maps API separately enabled in Google Cloud
  // Console for the thumbnail to actually render.
  const staticMapsApiKey = Deno.env.get("GOOGLE_GEOCODING_API_KEY") ?? Deno.env.get("GOOGLE_MAPS_API_KEY") ?? null;

  // AI intent search (DIR-E7-S1) — the anon key is a public, publishable key
  // by Supabase's own design (already shipped in the live app's committed JS
  // bundle via VITE_SUPABASE_ANON_KEY), so embedding it in the static page's
  // inline script is consistent with its existing exposure, not a new leak.
  // aiSearch stays null (AI search path fully omitted from the generated
  // script) when the directory hasn't configured a prompt.
  const aiSearch: AiSearchOptions | null = directory.ai_search_prompt?.trim()
    ? {
        directoryId: directory.id,
        enabled: true,
        supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
        supabaseAnonKey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      }
    : null;

  // Entry pages upload one at a time until this point — for a 177-entry
  // production directory that measured ~120s end-to-end, essentially all of
  // it this loop (every other step is a handful of batched Promise.all DB
  // reads). Each iteration's Blob PUT is independent of every other, so
  // there's no correctness reason for it to be sequential — bounded to 15
  // concurrent uploads rather than unbounded Promise.all to stay well clear
  // of any Vercel Blob per-second rate limit, not because 15 is some
  // measured optimum.
  await mapWithConcurrency(entries, 15, async (entry) => {
    const layout = resolveLayout(entry, templates, entryTermIdsByEntry.get(entry.id) ?? new Set(), termSortOrder);
    const html = buildEntryPage({
      clientSlug: client.slug,
      directorySlug: directory.slug,
      directoryName: directory.name,
      entry,
      evidence: evidenceByEntry.get(entry.id) ?? [],
      media: mediaByEntry.get(entry.id) ?? [],
      accreditations: accreditationsByEntry.get(entry.id) ?? [],
      links: linksByEntry.get(entry.id) ?? [],
      tiles: tilesByEntry.get(entry.id) ?? [],
      theme,
      layout,
      categorisations: filterBarCategorisations,
      entryTermIds: [...(entryTermIdsByEntry.get(entry.id) ?? [])],
      attachedMapEmbedSrc,
      staticMapsApiKey,
      related: relatedEntries(entry, entries, entryTermIdsByEntry),
    });
    await uploadToBlob(`${basePath}/${entry.slug}.html`, html, "text/html; charset=utf-8");
  });

  const landingHtml = buildDirectoryLandingPage({
    clientSlug: client.slug,
    directorySlug: directory.slug,
    directoryName: directory.name,
    directoryDescription: directory.description,
    entries,
    directoryLinks,
    theme,
    attachedMapEmbedSrc,
    categorisations: filterBarCategorisations,
    entryTermIds: entryTermIdsFlat,
    seoTitle: seoDefaults.meta_title_template || null,
    seoDescription: seoDefaults.meta_description || null,
    seoImageUrl: directory.seo_og_image_url || null,
    seoNoindex: directoryNoindex,
    aiSearch,
  });
  await uploadToBlob(`${basePath}/index.html`, landingHtml, "text/html; charset=utf-8");

  const sitemapUrl = `${SITE_ORIGIN}/directories/${client.slug}/${directory.slug}/sitemap.xml`;
  const sitemapUrls = [
    ...(directoryNoindex ? [] : [`${SITE_ORIGIN}/directories/${client.slug}/${directory.slug}`]),
    ...entries.filter((e) => !e.noindex).map((e) => `${SITE_ORIGIN}/directories/${client.slug}/${directory.slug}/${e.slug}`),
  ];
  await uploadToBlob(`${basePath}/sitemap.xml`, buildSitemapXml(sitemapUrls), "application/xml; charset=utf-8");
  await uploadToBlob(`${basePath}/robots.txt`, buildRobotsTxt(!directoryNoindex, sitemapUrl), "text/plain; charset=utf-8");

  const llmsExtra = (directory.seo_defaults_json as { llms_txt_extra?: string } | null)?.llms_txt_extra ?? null;
  const llmsTxt = buildLlmsTxt({
    clientSlug: client.slug,
    directorySlug: directory.slug,
    directoryName: directory.name,
    directoryDescription: directory.description,
    entries,
    extra: llmsExtra,
  });
  await uploadToBlob(`${basePath}/llms.txt`, llmsTxt, "text/plain; charset=utf-8");

  // Redirects (docs/DIRECTORIES.md §5.11): old slug -> current slug of
  // whichever entry now holds it, so a renamed entry's previous public URL
  // keeps working. Only entries generated above (active, in `entries`) are
  // valid targets — a redirect to an archived/deleted entry is dropped
  // rather than pointed at a page that doesn't exist.
  const { data: redirectRows, error: redirectErr } = await db
    .from("directory_redirects")
    .select("old_slug, entry_id")
    .eq("directory_id", directoryId);
  if (redirectErr) throw new Error(`Redirects query failed: ${redirectErr.message}`);
  const entrySlugById = new Map(entries.map((e) => [e.id, e.slug]));
  const currentSlugs = new Set(entries.map((e) => e.slug));
  const redirectMap: Record<string, string> = {};
  for (const r of (redirectRows ?? []) as { old_slug: string; entry_id: string }[]) {
    const targetSlug = entrySlugById.get(r.entry_id);
    // A redirect old_slug that collides with a *current* entry's own slug
    // must not override that entry's real page — drop it rather than shadow
    // the live entry (can happen if a slug is reused a second time).
    if (targetSlug && !currentSlugs.has(r.old_slug)) redirectMap[r.old_slug] = targetSlug;
  }
  await uploadToBlob(`${basePath}/redirects.json`, JSON.stringify(redirectMap), "application/json; charset=utf-8");

  return { directory_id: directoryId, count: entries.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const { directory_id, all } = body as { directory_id?: string; all?: boolean };

    if (all) {
      const db = createServiceClient();
      const { data: directories, error } = await db.from("directories").select("id").not("current_publication_id", "is", null);
      if (error) throw new Error(`Directories query failed: ${error.message}`);

      const results = await Promise.allSettled((directories ?? []).map((d) => generateForDirectory(d.id)));
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results
        .filter((r) => r.status === "rejected")
        .map((r) => (r as PromiseRejectedResult).reason?.message ?? "unknown");

      return json({ ok: true, total: results.length, succeeded, failed });
    }

    if (!directory_id) return json({ error: "Provide directory_id or all: true" }, 400);

    const result = await generateForDirectory(directory_id);
    return json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("generate_directory_site error:", msg);
    return json({ error: msg }, 500);
  }
});

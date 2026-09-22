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
 *   directories/<client_slug>/<directory_slug>/<page_slug>.html
 *   directories/<client_slug>/<directory_slug>/<parent_slug>/<child_slug>.html
 *   directories/<client_slug>/<directory_slug>/sitemap.xml
 *   directories/<client_slug>/<directory_slug>/robots.txt
 *
 * middleware.js serves these at /directories/:clientSlug/:directorySlug
 * [/:slug] or /directories/:clientSlug/:directorySlug/:parent/:child on the
 * branded domain — a path shape chosen specifically to never collide with
 * the existing /:clientSlug/:mapSlug interactive-map route (which is exactly
 * 2 segments, client-side routed, and must not pay for an extra lookup on
 * every load). Child content pages add a fifth segment under /directories/.
 * The same output also serves a directory's own custom domain root
 * (client_domains.directory_id, DomainSettings.jsx, since 20260827130000)
 * via middleware.js's handleCustomDomain — the one place robots.txt is
 * actually honoured by a real crawler, since crawlers only ever fetch a
 * domain's own root /robots.txt, never a per-path one.
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
 * Body (JSON): { directory_id: string, scope?: "auto" | "full" | "style" | "features" | "entries", entry_ids?: string[] }
 * or { all: true, scope?: "full" | "style" }. Omitted scope is "auto": rewrite only
 * what changed since site_generation_manifest. No manifest, "full", Restore,
 * or a chrome change (nav, enquiry, analytics, favicon, site title) rebuilds
 * every page. "all" defaults to a full rebuild; pass scope "style" to refresh
 * theme.css only.
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
  buildContentPage,
  buildLlmsTxt,
  type LlmsTxtPage,
  buildThemeCss,
  relatedEntries,
  buildSiteNav,
  contentPagePublicPath,
  sanitizeHttpUrl,
  clampLogoMaxHeight,
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
  type ContentPage,
  type SiteAnalytics,
  type DirectoryEnquiry,
  parseDirectoryDestinations,
} from "./builders.ts";
import { PLACES_GB, directoryPlaceCentroids, dominantGeocodeRegion } from "./places.ts";

type Db = ReturnType<typeof createServiceClient>;
type GenerationScope = "auto" | "full" | "style" | "features" | "entries";
type GenerationRequest = { scope: GenerationScope; entryIds?: string[] };
type GenerationResult = { directory_id: string; skipped?: string; count?: number; scopes?: string[] };

/** PostgREST caps a response at 1,000 rows. Page under that. */
const PAGE_SIZE = 1000;
/** UUIDs in one `.in()` stay well under the HTTP/2 header limit (~16KB). */
const IN_CHUNK = 80;

type SiteManifest = {
  style_hash: string;
  chrome_hash: string;
  features_hash: string;
  templates_hash: string;
  entries: Record<string, string>;
  pages: Record<string, string>;
};

type Work = {
  style: boolean;
  homepage: boolean;
  indexes: boolean;
  /** null = every active entry. */
  entryIds: string[] | null;
  /** null = every active content page. */
  pageIds: string[] | null;
};

const FULL_WORK: Work = { style: true, homepage: true, indexes: true, entryIds: null, pageIds: null };
const IDLE_WORK: Work = { style: false, homepage: false, indexes: false, entryIds: [], pageIds: [] };

async function digest(value: unknown): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(value));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseManifest(raw: unknown): SiteManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Partial<SiteManifest>;
  if (typeof m.style_hash !== "string" || typeof m.chrome_hash !== "string" || typeof m.features_hash !== "string" || typeof m.templates_hash !== "string") return null;
  if (!m.entries || typeof m.entries !== "object" || !m.pages || typeof m.pages !== "object") return null;
  return m as SiteManifest;
}

function stylePayload(theme: DirectoryTheme) {
  const mode = theme.headerMode === "logo" || theme.headerMode === "text" ? theme.headerMode : "logoText";
  return {
    primaryColor: theme.primaryColor ?? null,
    primaryDarkColor: theme.primaryDarkColor ?? null,
    accentColor: theme.accentColor ?? null,
    backgroundColor: theme.backgroundColor ?? null,
    surfaceColor: theme.surfaceColor ?? null,
    surfaceAltColor: theme.surfaceAltColor ?? null,
    inkColor: theme.inkColor ?? null,
    mutedColor: theme.mutedColor ?? null,
    lineColor: theme.lineColor ?? null,
    sageColor: theme.sageColor ?? null,
    sageInkColor: theme.sageInkColor ?? null,
    fontHeading: theme.fontHeading ?? null,
    fontBody: theme.fontBody ?? null,
    fontSizeBase: theme.fontSizeBase ?? null,
    fontSizeH1: theme.fontSizeH1 ?? null,
    fontSizeH2: theme.fontSizeH2 ?? null,
    fontSizeH3: theme.fontSizeH3 ?? null,
    headerBackground: theme.headerBackground ?? null,
    headerText: theme.headerText ?? null,
    footerBackground: theme.footerBackground ?? null,
    footerText: theme.footerText ?? null,
    footerLink: theme.footerLink ?? null,
    footerLinkHover: theme.footerLinkHover ?? null,
    logoUrl: sanitizeHttpUrl(theme.logoUrl),
    logoMaxHeight: clampLogoMaxHeight(theme.logoMaxHeight),
    headerMode: mode,
    showHeaderTitle: theme.showHeaderTitle ?? null,
    heroBannerUrl: sanitizeHttpUrl(theme.heroBannerUrl),
    heroBannerHeight: theme.heroBannerHeight ?? null,
  };
}

async function fetchPages<T>(
  label: string,
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await run(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${label} query failed: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

/** null = every active entry in the directory. A list is fetched in small `.in()` chunks. */
function idChunks(entryIds: string[] | null): Array<string[] | null> {
  if (!entryIds) return [null];
  if (entryIds.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < entryIds.length; i += IN_CHUNK) chunks.push(entryIds.slice(i, i + IN_CHUNK));
  return chunks;
}

type LoosePage = PromiseLike<{ data: unknown; error: { message: string } | null }>;

async function loadByEntry<T>(
  label: string,
  entryIds: string[] | null,
  run: (chunk: string[] | null, from: number, to: number) => LoosePage,
): Promise<T[]> {
  const rows: T[] = [];
  for (const chunk of idChunks(entryIds)) {
    const page = await fetchPages<T>(label, async (from, to) => {
      const res = await run(chunk, from, to);
      return { data: (res.data ?? null) as T[] | null, error: res.error };
    });
    rows.push(...page);
  }
  return rows;
}

/**
 * Records generate_directory_site's outcome on directories.site_generation_*
 * so the Publish panel can show live status regardless of whether the
 * browser tab that triggered it is still open (see
 * 20260828120000_directory_site_generation_status.sql).
 */
async function generateForDirectory(directoryId: string, request: GenerationRequest): Promise<GenerationResult> {
  const db = createServiceClient();
  try {
    const result = await generateForDirectoryInner(db, directoryId, request);
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
  db: Db,
  directoryId: string,
  request: GenerationRequest,
): Promise<GenerationResult> {
  const { data: directory, error: dirErr } = await db
    .from("directories")
    .select("id, client_id, name, slug, description, current_publication_id, seo_defaults_json, seo_og_image_url, theme_json, ai_search_prompt, home_nav_label, analytics_json, enquiry_email, location_search_enabled, updated_at, site_generation_manifest")
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

  const { data: client, error: clientErr } = await db.from("clients").select("id, slug, name").eq("id", directory.client_id).single();
  if (clientErr) throw new Error(`Client query failed: ${clientErr.message}`);

  const flagEnabled = await resolveFeatureFlag(db, client.id, "directories");
  if (!flagEnabled) return { directory_id: directoryId, skipped: "flag_disabled" };

  await db
    .from("directories")
    .update({ site_generation_status: "running", site_generation_started_at: new Date().toISOString() })
    .eq("id", directoryId);

  const basePath = `directories/${client.slug}/${directory.slug}`;
  const manifest = parseManifest((directory as { site_generation_manifest?: unknown }).site_generation_manifest);

  // An explicit style publish only overwrites theme.css. The first publish
  // (no manifest yet) falls through and rebuilds every page so they link it.
  if (request.scope === "style" && manifest) {
    await uploadToBlob(`${basePath}/theme.css`, buildThemeCss(theme), "text/css; charset=utf-8");
    await db
      .from("directories")
      .update({ site_generation_manifest: { ...manifest, style_hash: await digest(stylePayload(theme)) } })
      .eq("id", directoryId);
    return { directory_id: directoryId, count: 0, scopes: ["style"] };
  }

  const entryRows = await fetchPages<Entry>("Entries", (from, to) =>
    db
      .from("directory_entries")
      .select(
        "id, name, slug, directory_group_id, address, postcode, country, city, phone, email, website_url, logo_url, notes_html, allow_html, lat, lng, show_phone, show_email, show_website, show_address, meta_title, meta_description, keywords, ai_summary, noindex, structured_data_type, panel_image_url, panel_background_color, updated_at",
      )
      .eq("directory_id", directoryId)
      .eq("is_active", true)
      .order("id", { ascending: true })
      .range(from, to),
  );
  const entries = entryRows.sort((a, b) => a.name.localeCompare(b.name));
  const entryIds = entries.map((e) => e.id);

  let evidenceByEntry = new Map<string, EvidenceItem[]>();
  let mediaByEntry = new Map<string, MediaAsset[]>();
  let accreditationsByEntry = new Map<string, AccreditationHeld[]>();
  let linksByEntry = new Map<string, EntryLink[]>();
  let tilesByEntry = new Map<string, ProductTile[]>();
  let directoryLinks: EntryLink[] = [];

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
    const ectRows = await loadByEntry<{ entry_id: string; category_terms: unknown }>("Entry category terms", null, (chunk, from, to) => {
      let q = db
        .from("entry_category_terms")
        .select("entry_id, category_terms(id, categorisation_id, label, slug, sort_order, categorisations(key, label, field_type)), directory_entries!inner(id)")
        .eq("directory_entries.directory_id", directoryId)
        .eq("directory_entries.is_active", true)
        .order("entry_id", { ascending: true })
        .order("term_id", { ascending: true });
      if (chunk) q = q.in("entry_id", chunk);
      return q.range(from, to);
    });

    type TermEmbed = CategorisationTerm & { categorisations: { key: string; label: string; field_type: string } | { key: string; label: string; field_type: string }[] | null };
    for (const row of ectRows as unknown as { entry_id: string; category_terms: TermEmbed | TermEmbed[] | null }[]) {
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

  // AI Help me choose (DIR-E7-S1) — the anon key is a public, publishable key
  // by Supabase's own design (already shipped in the live app's committed JS
  // bundle via VITE_SUPABASE_ANON_KEY), so embedding it in the static page's
  // inline script is consistent with its existing exposure, not a new leak.
  // aiSearch stays null (Help me choose omitted from the generated page)
  // when the directory hasn't configured a prompt. Keyword search always
  // runs locally and never calls this function.
  const aiSearch: AiSearchOptions | null = directory.ai_search_prompt?.trim()
    ? {
        directoryId: directory.id,
        enabled: true,
        supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
        supabaseAnonKey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      }
    : null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const siteAnalytics: SiteAnalytics | null =
    supabaseUrl && supabaseAnonKey
      ? {
          directoryId: directory.id,
          supabaseUrl,
          supabaseAnonKey,
          destinations: parseDirectoryDestinations(directory.analytics_json),
        }
      : null;

  const enquiryEmail = typeof (directory as { enquiry_email?: string | null }).enquiry_email === "string"
    ? (directory as { enquiry_email: string }).enquiry_email.trim()
    : "";
  let entryEnquiry: DirectoryEnquiry | null = null;
  if (enquiryEmail && supabaseUrl && supabaseAnonKey) {
    const { data: messaging } = await db
      .from("client_messaging_settings")
      .select("messaging_enabled, messaging_prompt, email_test_mode")
      .eq("client_id", client.id)
      .maybeSingle();
    if (messaging?.messaging_enabled === true) {
      entryEnquiry = {
        prompt: typeof messaging.messaging_prompt === "string" ? messaging.messaging_prompt : null,
        testMode: messaging.email_test_mode !== false,
        directoryId: directory.id,
        supabaseUrl,
        supabaseAnonKey,
      };
    }
  }

  const entrySlugSet = new Set(entries.map((e) => e.slug));

  // Content pages — nested URLs for children (`parentSlug/childSlug.html`).
  // Query every page (including unpublished) so a published child's path can
  // still resolve its parent's slug; only is_active pages are generated and
  // only those with show_in_navigation appear in header/footer nav.
  const { data: pageRows, error: pageErr } = await db
    .from("directory_content_pages")
    .select("id, parent_page_id, title, slug, position, nav_label, show_in_navigation, is_active, body_html, meta_title, meta_description, noindex, updated_at")
    .eq("directory_id", directoryId)
    .order("position", { ascending: true })
    .order("title", { ascending: true });
  if (pageErr) throw new Error(`Content pages query failed: ${pageErr.message}`);
  const allPages = (pageRows ?? []) as ContentPage[];
  const pagesById = new Map(allPages.map((p) => [p.id, p]));
  const contentPages = allPages.filter((p) => p.is_active !== false);
  const nav = buildSiteNav({
    clientSlug: client.slug,
    directorySlug: directory.slug,
    homeNavLabel: (directory as { home_nav_label?: string | null }).home_nav_label,
    pages: allPages,
  });
  const childPagesByParent = new Map<string, ContentPage[]>();
  for (const p of contentPages) {
    if (!p.parent_page_id) continue;
    const list = childPagesByParent.get(p.parent_page_id) ?? [];
    list.push(p);
    childPagesByParent.set(p.parent_page_id, list);
  }
  for (const list of childPagesByParent.values()) {
    list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.title.localeCompare(b.title));
  }

  const styleHash = await digest(stylePayload(theme));
  const chromeHash = await digest({
    name: directory.name,
    slug: directory.slug,
    clientSlug: client.slug,
    siteTitle: theme.siteTitle ?? null,
    favicon: sanitizeHttpUrl(theme.faviconUrl),
    homeNavLabel: (directory as { home_nav_label?: string | null }).home_nav_label ?? null,
    pages: allPages.map((p) => ({
      id: p.id,
      parent: p.parent_page_id,
      slug: p.slug,
      title: p.title,
      nav: p.nav_label ?? null,
      show: p.show_in_navigation !== false,
      position: p.position ?? 0,
      active: p.is_active !== false,
    })),
    enquiry: entryEnquiry ? { on: true, prompt: entryEnquiry.prompt, test: entryEnquiry.testMode } : { on: false },
    analytics: siteAnalytics?.destinations ?? null,
  });
  const llmsExtra = (directory.seo_defaults_json as { llms_txt_extra?: string } | null)?.llms_txt_extra ?? null;
  const featuresHash = await digest({
    description: directory.description,
    seo: seoDefaults,
    llmsExtra,
    publisher: client.name ?? null,
    og: directory.seo_og_image_url ?? null,
    aiPrompt: directory.ai_search_prompt ?? null,
    locationSearch: !!directory.location_search_enabled,
    map: attachedMapEmbedSrc,
    links: directoryLinks.map((l) => ({ label: l.label, url: l.url, style: l.style })),
    cats: filterBarCategorisations.map((c) => ({
      id: c.id,
      key: c.key,
      label: c.label,
      field_type: c.field_type,
      terms: c.terms.map((t) => ({ id: t.id, label: t.label, slug: t.slug, sort_order: t.sort_order })),
    })),
  });
  const templatesHash = await digest(
    templates.map((t) => ({
      id: t.id,
      is_default: t.is_default,
      group: t.applies_to_group_id,
      term: t.applies_to_term_id,
      layout: t.layout_json,
    })),
  );

  const activeEntryIds = new Set(entries.map((e) => e.id));
  let work: Work;
  if (!manifest || request.scope === "full") {
    work = FULL_WORK;
  } else if (request.scope === "features") {
    work = { style: false, homepage: true, indexes: true, entryIds: [], pageIds: [] };
  } else if (request.scope === "entries") {
    const wanted = new Set(request.entryIds ?? []);
    const ids = entries.filter((e) => wanted.has(e.id)).map((e) => e.id);
    if (ids.length === 0) throw new Error("No active entries matched entry_ids");
    work = { style: false, homepage: true, indexes: true, entryIds: ids, pageIds: [] };
  } else if (chromeHash !== manifest.chrome_hash) {
    work = FULL_WORK;
  } else {
    const dirtyEntries = entries.filter((e) => manifest.entries[e.id] !== (e.updated_at ?? "")).map((e) => e.id);
    const removedEntries = Object.keys(manifest.entries).some((id) => !activeEntryIds.has(id));
    const templatesDirty = templatesHash !== manifest.templates_hash;
    const dirtyPages = contentPages.filter((p) => manifest.pages[p.id] !== (p.updated_at ?? "")).map((p) => p.id);
    const removedPages = Object.keys(manifest.pages).some((id) => !contentPages.some((p) => p.id === id));
    const featuresDirty = featuresHash !== manifest.features_hash;
    const homepage = featuresDirty || removedEntries || dirtyEntries.length > 0;
    const entryIds = templatesDirty ? null : dirtyEntries;
    const buildingEntries = entryIds === null || entryIds.length > 0;
    work = {
      style: styleHash !== manifest.style_hash,
      homepage,
      indexes: homepage || dirtyPages.length > 0 || removedPages,
      entryIds: buildingEntries ? entryIds : [],
      pageIds: dirtyPages,
    };
    if (!work.style && !work.homepage && !work.indexes && !buildingEntries && dirtyPages.length === 0) work = IDLE_WORK;
  }

  if (work === IDLE_WORK || (!work.style && !work.homepage && !work.indexes && work.entryIds?.length === 0 && work.pageIds?.length === 0)) {
    return { directory_id: directoryId, count: 0, scopes: [] };
  }

  const buildingEntryPages = work.entryIds === null || work.entryIds.length > 0;
  if (buildingEntryPages) {
    const ids = work.entryIds;
    const [evidence, media, accRows, linkRows, tileRows] = await Promise.all([
      loadByEntry<EvidenceItem>("Evidence", ids, (chunk, from, to) => {
        let q = db
          .from("entry_evidence_items")
          .select("entry_id, claim, value, source_url, confidence, directory_entries!inner(id)")
          .eq("directory_entries.directory_id", directoryId)
          .eq("directory_entries.is_active", true)
          .order("entry_id", { ascending: true })
          .order("sort_order", { ascending: true })
          .order("id", { ascending: true });
        if (chunk) q = q.in("entry_id", chunk);
        return q.range(from, to);
      }),
      loadByEntry<MediaAsset>("Media", ids, (chunk, from, to) => {
        let q = db
          .from("entry_media_assets")
          .select("entry_id, url, alt_text, caption, is_hero, directory_entries!inner(id)")
          .eq("directory_entries.directory_id", directoryId)
          .eq("directory_entries.is_active", true)
          .order("entry_id", { ascending: true })
          .order("sort_order", { ascending: true })
          .order("id", { ascending: true });
        if (chunk) q = q.in("entry_id", chunk);
        return q.range(from, to);
      }),
      loadByEntry<{ entry_id: string; directory_accreditation_schemes: AccreditationHeld | AccreditationHeld[] | null }>("Accreditations", ids, (chunk, from, to) => {
        let q = db
          .from("entry_accreditations")
          .select("entry_id, directory_accreditation_schemes(name, issuing_body, badge_image_url), directory_entries!inner(id)")
          .eq("directory_entries.directory_id", directoryId)
          .eq("directory_entries.is_active", true)
          .order("entry_id", { ascending: true })
          .order("scheme_id", { ascending: true });
        if (chunk) q = q.in("entry_id", chunk);
        return q.range(from, to);
      }),
      loadByEntry<EntryLink>("Prominent links", ids, (chunk, from, to) => {
        let q = db
          .from("prominent_links")
          .select("entry_id, directory_id, label, url, style, open_in_new, tracking, directory_entries!inner(id)")
          .eq("directory_entries.directory_id", directoryId)
          .eq("directory_entries.is_active", true)
          .order("entry_id", { ascending: true })
          .order("sort_order", { ascending: true })
          .order("id", { ascending: true });
        if (chunk) q = q.in("entry_id", chunk);
        return q.range(from, to);
      }),
      loadByEntry<ProductTile>("Product tiles", ids, (chunk, from, to) => {
        let q = db
          .from("product_tiles")
          .select("entry_id, title, image_url, price, currency, rating, provider, destination_url, directory_entries!inner(id)")
          .eq("directory_entries.directory_id", directoryId)
          .eq("directory_entries.is_active", true)
          .order("entry_id", { ascending: true })
          .order("sort_order", { ascending: true })
          .order("id", { ascending: true });
        if (chunk) q = q.in("entry_id", chunk);
        return q.range(from, to);
      }),
    ]);
    for (const row of evidence) {
      const list = evidenceByEntry.get(row.entry_id) ?? [];
      list.push(row);
      evidenceByEntry.set(row.entry_id, list);
    }
    for (const row of media) {
      const list = mediaByEntry.get(row.entry_id) ?? [];
      list.push(row);
      mediaByEntry.set(row.entry_id, list);
    }
    for (const row of accRows) {
      const scheme = Array.isArray(row.directory_accreditation_schemes) ? row.directory_accreditation_schemes[0] : row.directory_accreditation_schemes;
      if (!scheme) continue;
      const list = accreditationsByEntry.get(row.entry_id) ?? [];
      list.push({ entry_id: row.entry_id, name: scheme.name, issuing_body: scheme.issuing_body, badge_image_url: scheme.badge_image_url });
      accreditationsByEntry.set(row.entry_id, list);
    }
    for (const row of linkRows) {
      if (!row.entry_id) continue;
      const list = linksByEntry.get(row.entry_id) ?? [];
      list.push(row);
      linksByEntry.set(row.entry_id, list);
    }
    for (const row of tileRows) {
      const list = tilesByEntry.get(row.entry_id) ?? [];
      list.push(row);
      tilesByEntry.set(row.entry_id, list);
    }
  }

  const entriesToBuild = work.entryIds === null ? entries : entries.filter((e) => work.entryIds!.includes(e.id));

  // Entry pages used to upload sequentially (~120s for 177 entries, almost
  // all of it Blob PUTs). Bounded concurrency is still required, but 15
  // in-flight PUTs regularly 503s Vercel Blob on large directories (UK
  // Associations-scale) and failed the whole generation. 6 plus per-PUT
  // retries in uploadToBlob is the compromise.
  await mapWithConcurrency(entriesToBuild, 6, async (entry) => {
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
      nav,
      analytics: siteAnalytics,
      enquiry: entryEnquiry,
    });
    await uploadToBlob(`${basePath}/${entry.slug}.html`, html, "text/html; charset=utf-8");
  });

  const publishedPagePaths = new Map<string, string>();
  for (const page of contentPages) {
    if (!page.parent_page_id && entrySlugSet.has(page.slug)) {
      console.error(`Content page ${page.id} ("${page.title}") slug "${page.slug}" collides with an existing entry — skipped`);
      continue;
    }
    publishedPagePaths.set(page.id, contentPagePublicPath(page, pagesById));
  }
  const pagesToUpload = work.pageIds === null ? contentPages : contentPages.filter((p) => work.pageIds!.includes(p.id));
  for (const page of pagesToUpload) {
    const publicPath = publishedPagePaths.get(page.id);
    if (!publicPath) continue;
    const html = buildContentPage({
      clientSlug: client.slug,
      directorySlug: directory.slug,
      directoryName: directory.name,
      page,
      parentPage: page.parent_page_id ? pagesById.get(page.parent_page_id) ?? null : null,
      childPages: childPagesByParent.get(page.id) ?? [],
      pagesById,
      theme,
      nav,
      analytics: siteAnalytics,
    });
    await uploadToBlob(`${basePath}/${publicPath}.html`, html, "text/html; charset=utf-8");
  }

  if (work.homepage) {
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
      locationSearch: directory.location_search_enabled
        ? {
            directoryId: directory.id,
            supabaseUrl,
            supabaseAnonKey,
            region: dominantGeocodeRegion(entries),
            places: { ...PLACES_GB, ...directoryPlaceCentroids(entries) },
          }
        : null,
      nav,
      analytics: siteAnalytics,
    });
    await uploadToBlob(`${basePath}/index.html`, landingHtml, "text/html; charset=utf-8");
  }

  if (work.indexes) {
  const sitemapUrl = `${SITE_ORIGIN}/directories/${client.slug}/${directory.slug}/sitemap.xml`;
  const siteBase = `${SITE_ORIGIN}/directories/${client.slug}/${directory.slug}`;
  const directoryUpdatedAt = (directory as { updated_at?: string | null }).updated_at ?? null;
  const sitemapUrls = [
    ...(directoryNoindex ? [] : [{ loc: siteBase, lastmod: directoryUpdatedAt }]),
    ...entries.filter((e) => !e.noindex).map((e) => ({ loc: `${siteBase}/${e.slug}`, lastmod: e.updated_at ?? null })),
    ...[...publishedPagePaths.entries()]
      .filter(([id]) => {
        const p = pagesById.get(id);
        return p && !p.noindex;
      })
      .map(([id, path]) => ({ loc: `${siteBase}/${path}`, lastmod: pagesById.get(id)?.updated_at ?? null })),
  ];
  await uploadToBlob(`${basePath}/sitemap.xml`, buildSitemapXml(sitemapUrls), "application/xml; charset=utf-8");
  await uploadToBlob(`${basePath}/robots.txt`, buildRobotsTxt(!directoryNoindex, sitemapUrl), "text/plain; charset=utf-8");

  const llmsPages: LlmsTxtPage[] = contentPages
    .filter((p) => !p.noindex)
    .map((p) => ({
      title: p.nav_label?.trim() || p.title,
      path: publishedPagePaths.get(p.id) ?? "",
      description: p.meta_description,
      inNavigation: p.show_in_navigation !== false,
    }))
    .filter((p) => p.path);
  const llmsTxt = buildLlmsTxt({
    directoryName: directory.name,
    directoryDescription: directory.description,
    seoDescription: seoDefaults.meta_description || null,
    categorisationLabels: filterBarCategorisations.map((c) => c.label),
    indexableEntryCount: entries.filter((e) => !e.noindex).length,
    publisherName: client.name ?? null,
    siteBase,
    pages: llmsPages,
    extra: llmsExtra,
  });
  await uploadToBlob(`${basePath}/llms.txt`, llmsTxt, "text/markdown; charset=utf-8");

  // Redirects (docs/DIRECTORIES.md §5.11): old slug -> current slug of
  // whichever entry now holds it, so a renamed entry's previous public URL
  // keeps working. Only entries generated above (active, in `entries`) are
  // valid targets — a redirect to an archived/deleted entry is dropped
  // rather than pointed at a page that doesn't exist.
  const { data: redirectRows, error: redirectErr } = await db
    .from("directory_redirects")
    .select("old_slug, entry_id, page_id")
    .eq("directory_id", directoryId);
  if (redirectErr) throw new Error(`Redirects query failed: ${redirectErr.message}`);
  const entrySlugById = new Map(entries.map((e) => [e.id, e.slug]));
  const livePaths = new Set<string>([...entries.map((e) => e.slug), ...publishedPagePaths.values()]);
  const redirectMap: Record<string, string> = {};
  for (const r of (redirectRows ?? []) as { old_slug: string; entry_id: string | null; page_id: string | null }[]) {
    const target = r.entry_id ? entrySlugById.get(r.entry_id) : r.page_id ? publishedPagePaths.get(r.page_id) : undefined;
    // A redirect old_slug that collides with a live path must not override
    // that page — drop it rather than shadow the current URL (can happen if
    // a slug is reused a second time).
    if (target && target !== r.old_slug && !livePaths.has(r.old_slug)) redirectMap[r.old_slug] = target;
  }
  // First nested-URL publish: child pages used to live at /:childSlug.
  // Emit a 301 unless that one-segment path is already a live entry or
  // top-level page.
  for (const page of contentPages) {
    if (!page.parent_page_id) continue;
    const newPath = publishedPagePaths.get(page.id);
    if (!newPath) continue;
    if (!livePaths.has(page.slug) && !redirectMap[page.slug]) redirectMap[page.slug] = newPath;
  }
  await uploadToBlob(`${basePath}/redirects.json`, JSON.stringify(redirectMap), "application/json; charset=utf-8");
  }

  if (work.style) {
    await uploadToBlob(`${basePath}/theme.css`, buildThemeCss(theme), "text/css; charset=utf-8");
  }

  const nextManifest: SiteManifest = {
    style_hash: styleHash,
    chrome_hash: chromeHash,
    features_hash: featuresHash,
    templates_hash: templatesHash,
    entries: Object.fromEntries(entries.map((e) => [e.id, e.updated_at ?? ""])),
    pages: Object.fromEntries(contentPages.map((p) => [p.id, p.updated_at ?? ""])),
  };
  await db.from("directories").update({ site_generation_manifest: nextManifest }).eq("id", directoryId);

  const isFull = work.entryIds === null && work.pageIds === null && work.homepage && work.style && work.indexes;
  const scopes = isFull
    ? ["full"]
    : [
        work.style ? "style" : null,
        work.homepage ? "features" : null,
        work.entryIds === null || work.entryIds.length > 0 ? "entries" : null,
        work.pageIds === null || work.pageIds.length > 0 ? "pages" : null,
      ].filter((s): s is string => !!s);

  return { directory_id: directoryId, count: entriesToBuild.length, scopes };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const { directory_id, all, scope, entry_ids } = body as {
      directory_id?: string;
      all?: boolean;
      scope?: GenerationScope;
      entry_ids?: string[];
    };
    const request: GenerationRequest = {
      scope: scope === "full" || scope === "style" || scope === "features" || scope === "entries" ? scope : "auto",
      entryIds: Array.isArray(entry_ids) ? entry_ids.filter((id) => typeof id === "string") : undefined,
    };

    if (all) {
      const db = createServiceClient();
      const { data: directories, error } = await db.from("directories").select("id").not("current_publication_id", "is", null);
      if (error) throw new Error(`Directories query failed: ${error.message}`);
      const each: GenerationRequest = { scope: request.scope === "style" ? "style" : "full" };

      const results = await Promise.allSettled((directories ?? []).map((d) => generateForDirectory(d.id, each)));
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results
        .filter((r) => r.status === "rejected")
        .map((r) => (r as PromiseRejectedResult).reason?.message ?? "unknown");

      return json({ ok: true, total: results.length, succeeded, failed });
    }

    if (!directory_id) return json({ error: "Provide directory_id or all: true" }, 400);

    const result = await generateForDirectory(directory_id, request);
    return json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("generate_directory_site error:", msg);
    return json({ error: msg }, 500);
  }
});

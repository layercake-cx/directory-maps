# Directories — Product Specification

**Status:** Draft for engineering review · **Owner:** Product · **Repo:** `directory-maps` · **Prepared:** 2026-07-14

---

## 1. Overview

Directories is a new capability that lets a client (or Layercake staff, on a client's behalf) build, publish, and maintain a structured business/member directory — a searchable, filterable list of organisations or people, each with a rich profile page — as a standalone, SEO- and AI-crawlable public website, as a datasource feeding an existing Layercake Map, and as an embeddable companion to one. It sits alongside the existing "map + listings" product rather than replacing it: a `Directory` is a new first-class entity (parallel to `Map`), a `DirectoryEntry` is the directory equivalent of a `Listing`, and directories and maps can be wired together in either direction (a directory can embed a map; a map can pull its pins from a directory). The value to a client is a single dataset — say, a membership body's list of accredited firms — that can be presented as a browsable, Google-indexable website *and* visualised geographically, without maintaining the data twice.

## 2. Personas & roles

| Persona | Definition in this codebase | Directories permission summary |
|---|---|---|
| **Platform Admin** | `profiles.role = 'admin'` (`supabase/migrations/20250201000000_create_profiles.sql`). One flat tier today — there is **no** enforced `platform_superadmin` vs `platform_admin` split; that vocabulary exists only as free-text in admin-event metadata and a cosmetic nav-link class (see §3.6). This spec treats "Admin" as that single tier and does not introduce new sub-tiers. | Full CRUD and settings access to any client's directories, on behalf of the client, from `/admin/*`. Same event-instrumentation obligations as any other admin workflow (AGENTS.md §"Admin event instrumentation"). |
| **Client — Owner / Manager** | `contacts.role IN ('owner','manager')`, or `contacts.is_primary` (`src/lib/clientAuth.js`, `canManageOrg()`). | Full CRUD on their own client's directories: create/archive directories, manage entries, categorisations, publishing, branding, domains, map associations. |
| **Client — Member** | `contacts.role = 'member'`. Access today is scoped per-map via `contact_map_permissions`; no per-directory equivalent exists yet (see Data model §4, `contact_directory_permissions`). | Entry-level CRUD only on directories they've been explicitly granted access to; **cannot** publish, change branding, manage domains, or manage categorisation definitions (org-wide taxonomy changes are Owner/Manager-only, matching how `FilterFieldsPanel.jsx` — the closest existing analogue — is only reachable from Owner/Manager-visible nav). |
| **Anonymous visitor** | Unauthenticated. | Read-only access to the *published* version of a directory and its entries, gated the same way anon reads are gated today (RLS restricted to published content only — see §3.5/§5). |

Every story below that has a permission dimension states it explicitly using these four labels.

## 3. Existing-patterns audit

This section is a factual account of what exists in this repository today, gathered by direct investigation (file paths, migrations, and code quoted where useful), not assumption. Where the codebase lacks something the new epics require, that is called out as a **Gap**.

### 3.1 The "datasources" tabbed UI (map → Data tab)

The map-editing "Data" tab is implemented twice, near-identically, with no shared component: [`src/pages/admin/AdminMapData.jsx`](../src/pages/admin/AdminMapData.jsx) and [`src/pages/client/ClientMapData.jsx`](../src/pages/client/ClientMapData.jsx). Routed at `/admin/clients/:clientId/maps/:mapId/data` and `/client/maps/:mapId/data`, one level below `MapEditSubNav` (`Design | Data | Stats | Publish`).

The tab bar itself is **not** Mantine `Tabs` — it's a hand-rolled array of `{id, label, disabled, disabledReason}` objects rendered as a row of `<button>`s with CSS classes `.admin-map-tabs` / `.admin-map-tabs__tab` / `.is-active` / `.is-disabled` (defined in `src/pages/admin/admin.css`), with `activeTab` as local `useState` and content rendered inline as `{activeTab === "..." && <div>…</div>}` blocks in the same file — no separate per-tab components exist. This exact convention (array-of-ids + button strip) is also used for the Design/Publish settings overlay in `AdminMapDashboard.jsx`/`ClientMapDashboard.jsx`, confirming it is the house pattern, not a one-off.

Current tabs: `branding` (listing table + logo/active toggles), `manual` (CRUD + modal form), `spreadsheet` (CSV upload/import), `drive` (Google Sheets sync), `sync_history` (shown only if sync logs exist).

**A new "Directories" tab means**: appending one object to the `tabs` array and one `{activeTab === "directories" && (...)}` block, in *both* `AdminMapData.jsx` and `ClientMapData.jsx`. **Decision (2026-07-14):** since this is the third near-duplicate tab set added to these two files, DIR-E4 explicitly includes extracting a shared component (tab strip + a small per-tab-content contract) used by both Admin and Client — this is in scope for the feature, not deferred as tech debt.

The existing "datasource" for a map is the `map_data_sources` table (`supabase/migrations/20260306100600_create_map_data_sources.sql`), currently Google-Sheets-specific (`refresh_token not null`) and constrained to **one row per map regardless of provider** (`unique(map_id)`, added in `20260504120000_map_data_sources_unique_map_id.sql`). **Decision (2026-07-14):** Directory-as-datasource does **not** extend this table. A directory-sourced map consumes the directory's *published* entries **directly and live** — not via a synced/copied row set — so `map_data_sources` (which models an OAuth-linked copy-in/sync-job pattern) is left completely untouched by this feature; see the revised §4.7.

### 3.2 CRUD / list / table / detail patterns

Two generations of pattern exist for the map `listings` entity; this spec follows the **current, actively-developed** one and explicitly deprecates the older one as a model to copy:

- **Legacy (do not copy):** `AdminMapListings.jsx` / `ClientMapListings.jsx` (read-only plain `<table>`, all-rows-loaded, client-side filter) plus `AdminEditListing.jsx` (full-page create/edit at `/admin/listings/:id`, `upsert`/hard `delete`, no Mantine). The "New listing" button here is already `disabled` in the current UI — a sign this path is being sunset.
- **Current pattern (the one to imitate):** `ClientMapData.jsx` / `AdminMapData.jsx`. Concretely:
  - List: hand-rolled `<table>` (Mantine used only for atoms — `Alert, Badge, Button, Loader, Overlay, SegmentedControl`), client-side search (`useMemo` substring match) and pagination (`PAGE_SIZE = 100`, all rows fetched in one query, no server-side `.range()` paging today — **Gap** if Directories needs to scale past a few thousand entries per directory).
  - Create/edit: a hand-rolled fixed-position overlay `div` acting as a modal (not Mantine `Modal` — no modal library is used anywhere in this codebase), `<form onSubmit>` inside an `admin-card`, `supabase.from("listings").insert/update`.
  - Bulk actions: `selectedIds` as a `Set` in state, a "Bulk edit filters" button opening `src/components/BulkFilterEditModal.jsx`, which upserts into an EAV values table with an `onConflict` clause and an add-vs-replace mode toggle.
  - CSV import: **no interactive column-mapper** — a fixed-header-convention template (`downloadTemplate()` emits `id,name,address,postcode,country,lat,lng,website_url,email,phone,logo_url,notes_html,allow_html,group_name,is_active` plus one auto-appended `filter_<key>` column per active custom field), hand-rolled RFC4180 parser (`parseCSV`), Replace-vs-Add-to-existing choice, then `upsert(..., { onConflict: "id" })`. Directories' import/mapping requirement (scope item 1) is genuinely new UI if free-form column mapping is wanted — reusing the template-download convention is the lower-risk, pattern-consistent option (see DIR-E1-S6).
  - Delete/archive: `listings.is_active` is a soft **visibility** toggle (still shown in admin, hidden from the public map), not an audit-safe archive. Actual deletion is a hard `DELETE` behind a native `window.confirm()` — there is no Mantine confirm dialog anywhere in the codebase.
  - Per-record custom fields: `map_filter_fields` / `map_filter_field_options` / `listing_filter_values` (`supabase/migrations/20260713120000_create_map_filter_fields.sql`) is a mature three-table EAV pattern (field defs → options → per-record values) with its own admin panel (`src/components/FilterFieldsPanel.jsx`) and CSV-import glue (`src/lib/filterFields.js`). This is the strongest existing precedent for the new Categorisation model in DIR-E5, and this spec explicitly reuses its shape rather than inventing a new one.

### 3.3 Settings screens

Per-map settings live inside `ClientMapDashboard.jsx` / `AdminMapDashboard.jsx`, in a right-hand "Map Settings" rail: a flat list of custom tab buttons (again, not Mantine `Tabs`) opening a slide-in overlay panel, grouped internally into `panel-section` blocks. Persistence is **mixed**, not one generic settings table:
- Structural fields are individual columns on `maps` (`name`, `slug`, `default_zoom`, `enable_clustering`, …).
- Free-form design settings are packed into a single `maps.theme_json jsonb` column, merged-and-rewritten on save.
- Per-category overrides reuse the same idea on `groups.theme_json`.
- A separate **draft vs. published** tier exists: live edits autosave to `maps`/`groups` columns; the public embed only ever reads an immutable, versioned snapshot in `map_publications` (`config jsonb`, `version`, `published_by`), swapped via the `publish_map` / `rollback_map_to` RPCs.

This "individual columns for structure + one jsonb blob for cosmetic settings + a versioned publish-snapshot table for what the public actually sees" shape is the direct template for Directory publish settings and branding (DIR-E2, DIR-E3).

### 3.4 Map embedding mechanism

Embed code is generated in the Publish tab of `AdminMapDashboard.jsx` / `ClientMapDashboard.jsx`: an `embedSrc` (`https://<origin>/:clientSlug/:mapSlug`, or a legacy `/embed?map=<id>` fallback) wrapped in a small `<style>` + `<div>` + `<iframe>` snippet (`embedIframe`), shown with "Copy embed code" / "Launch map" actions. The iframe target is `src/pages/EmbedMap.jsx` (own anon-only Supabase client, tries a CDN JSON snapshot first, falls back to live reads of `maps`/`map_publications`/`public_listings`/`groups`), reached either via `/embed?map=` or via `/:clientSlug/:mapSlug` → `SlugMap.jsx` → `get_map_id_by_slugs` RPC → `EmbedMap`. This exact iframe-snippet convention is what DIR-E8 reuses for embedding a map inside a directory page, and what a directory's own embed code (if ever needed) should copy.

**Correction to a common assumption:** the app does **not** use `HashRouter` today, despite `AGENTS.md`, `docs/README.md`, `docs/FEATURES.md`, and `docs/DEPLOY.md` all still describing hash routes. `src/Root.jsx` uses `BrowserRouter`; `src/lib/hashSearchParams.js` contains an explicit comment confirming the migration away from hash routing, and `index.html` still carries a legacy `#/...` → clean-path redirect shim for old bookmarks. This matters directly for the SEO/rendering NFRs below (§5) and should be corrected in the docs independently of this feature — flagged as a separate, small doc-hygiene item, not part of these epics.

### 3.5 Data model, API conventions, rendering stack

No ORM: raw SQL in `supabase/migrations/` (66 files, each with a paired `_<timestamp>_name.rollback.sql`, per the template in `docs/DATABASE_MIGRATIONS.md`), consumed via `@supabase/supabase-js` directly from React — there is no conventional backend API layer, only Supabase Edge Functions for anything needing a secret or third-party call (`geocode_listings`, `sync_sheet_listings`, `google_oauth_start`, `send_contact_message`, `create_checkout_session`, etc. — none of them render HTML). Access control is enforced entirely by Postgres RLS, following a consistent `<table>_admin_all` (`profiles.role='admin'`) + `<table>_own_client` (via `current_user_client_id()`) + a narrower `<table>_anon_select` policy pattern (see `20260520100000_tenant_scoped_rls.sql`, `20260713120000_create_map_filter_fields.sql`).

**Critical gap for the publishing/SEO epic (DIR-E2):** this is a pure client-side-rendered (CSR) Vite SPA. There is no SSR framework, no prerendering/SSG plugin, no `react-helmet`(-async) dependency, zero `document.title` writes anywhere in `src/`, zero Open Graph/Twitter/JSON-LD markup anywhere in the repo, and no `sitemap.xml` or `robots.txt`. The one existing public content route, `/:clientSlug/:mapSlug` → `SlugMap.jsx` → `EmbedMap.jsx`, resolves its data via a client-side Supabase RPC after an initial "Loading…" shell — a non-JS crawler sees nothing. Production is deployed as a static build to **GitHub Pages** (`AGENTS.md` "Frontend deployment", confirmed by `.github/workflows/`), which has no server-side rewrite capability and, as far as this repo shows, no SPA-fallback `404.html` — a real, pre-existing deep-link risk independent of this feature. A `vercel.json` (pure static rewrite, not SSR) and a linked Vercel project also exist, described by `docs/DEPLOY.md`/`docs/ENVIRONMENTS_SETUP.md` as the "recommended" target, but `AGENTS.md` and the GitHub Actions workflow describe GitHub Pages as the actual automatic production path — these two docs disagree with each other and both still describe hash routing; neither matches the current `BrowserRouter` code. **Conclusion: delivering a genuinely server-rendered, crawlable Directories site is new infrastructure for this codebase, not an extension of an existing rendering pattern.** DIR-E2 and its non-functional requirements are written with this explicitly as a scoped build item, with two candidate approaches given in §5 rather than one silently assumed.

There is also no existing AI/LLM integration anywhere in this Maps codebase (unlike the sibling Jobs product, which has `score_candidate`/`generate_candidate_summary` Claude-backed Edge Functions) — relevant to the natural-language search requirement in DIR-E7, resolved as a new LLM-backed Edge Function per the decision recorded in §9.

### 3.6 Auth / roles model

Two separate identity tables, not one role enum:
- `profiles.role` (`'admin' | null`) — Layercake staff. **Gap:** no real `platform_superadmin`/`platform_admin` split exists in the data — that vocabulary is only used in admin-event `meta` strings and a cosmetic nav-link CSS class (`AdminLayout.jsx`'s `superadmin: true` flag does not gate any route). This spec does not introduce a split that doesn't otherwise exist.
- `contacts.role` (`'owner' | 'manager' | 'member'`, default `'member'`) — the client-org role, enforced via `canManageOrg()` (`src/lib/clientAuth.js`) for UI gating and via RLS (`current_user_client_id()`) for actual data access.

Route protection is coarse — `AdminGate.jsx` (blocks non-admins from all of `/admin/*`) and `ClientGate.jsx` (blocks unauthenticated/unverified users from `/client`) — with **no per-org-role route guard**; owner/manager-only actions (Team, Messaging) are hidden from nav but not hard-blocked at the router level, matching how `FilterFieldsPanel` access is currently gated. Member-level, per-resource scoping exists today only for maps, via `contact_map_permissions`; there is no equivalent for any other entity yet — DIR-E1 introduces `contact_directory_permissions` as the direct analogue (see §4).

### 3.7 Theming / branding primitives

Theming is **per-map, not per-client-org** — there is no "set your brand colour once" org-level feature today; each map has independent `marker_style`, `marker_color`, and a `theme_json` jsonb blob covering everything else (pin styling, panel colours, cluster colours, `mapTypeId`, etc.), with per-group overrides in `groups.theme_json`. The concrete mechanism worth reusing is in `PublishedMapView.jsx`: theme values are injected as **inline CSS custom properties on the map's root DOM node** (`style={{ ["--panel-bg"]: panelBg, ... }}`), consumed by CSS in `src/style.css` which defines sensible brand-default fallbacks (`--brand-teal: #0f9da8`, `--brand-coral: ...`) so an unthemed map still looks correct. This CSS-variable-injection pattern is what DIR-E3's branding preview should copy.

**Gap:** there is no custom-domain/subdomain hosting mechanism anywhere in the app. The only "domain" feature that exists is unrelated — per-client **email-sending** domain verification via Resend (`clients.email_domain`, `resend_domain_id`, `email_domain_status` enum, `email_dns_records jsonb`, added in `20260517120000_client_resend_email.sql`, surfaced on `ClientEmail.jsx`), which this spec reuses only as a *status-enum modelling precedent* (pending/verified/failed), not as working code — the actual domain-mapping/TLS mechanism for hosting a directory under a client's own domain does not exist today and is new infrastructure, resolved as the Vercel Domains API per the decision in §9 (see §4).

---

## 4. Data model

New tables, additive only — nothing below removes or renames an existing table/column. `directories` is the peer of `maps`; `directory_entries` is the peer of `listings`. Where the seed schema in the brief and the existing `listings` shape already agree, this spec keeps the same column names for consistency.

```
clients (existing)
 └─< directories (new)
       ├─< directory_entries (new)                — the seed schema, extended
       ├─< directory_groups (new)                  — simple built-in single-value grouping, mirrors `groups`
       ├─< directory_publications (new)             — mirrors map_publications (versioned, immutable snapshots)
       ├─  directories.theme_json (new column)      — mirrors maps.theme_json
       ├─< directory_domain_mappings (new)          — custom domain + TLS + verification
       ├─< entry_templates (new)                    — page-layout designer output
       └─< directory_map_associations (new)         — join: directory ↔ map (either direction)

categorisations (new, client-scoped, reusable across directories)
 └─< category_terms (new)
       ├─< directory_category_terms (new)           — tag a whole directory with a term
       └─< entry_category_terms (new)               — tag an entry with a term (replaces ad hoc EAV per directory)

contact_directory_permissions (new)                 — mirrors contact_map_permissions

maps (existing)
 └─< map_data_sources (existing, unchanged — not used by Directories; see §4.7)
 └─< directory_map_associations (new, both directions — embed and datasource)
```

### 4.1 `directories`

| Column | Type | Notes |
|---|---|---|
| `id` | `text pk` | Matches `maps.id`/`clients.id` convention (client-generated text id, not uuid). |
| `client_id` | `text → clients.id` | Tenant owner. |
| `name` | `text not null` | |
| `slug` | `text not null` | Unique per client (mirrors `maps.slug`), used in the public URL `/:clientSlug/:directorySlug`. |
| `description` | `text null` | Shown on the directory's public index page. |
| `is_active` | `boolean not null default true` | Soft-archive, same semantics as `listings.is_active` today. |
| `theme_json` | `jsonb null` | Branding: brand colours, logo, layout preferences — same blob-of-cosmetics precedent as `maps.theme_json`. |
| `seo_defaults_json` | `jsonb null` | Directory-level SEO defaults: `meta_title_template`, `meta_description`, `default_noindex` (bool), `default_structured_data_type` (`Organization`\|`LocalBusiness`\|`ItemList`), `llms_txt_extra` (free text appended to the generated `llms.txt` block for this directory). |
| `current_publication_id` | `uuid null → directory_publications.id` | Mirrors `maps.current_publication_id`. |
| `published_at` | `timestamptz null` | Mirrors `maps.published_at`; null = never published. |
| `created_at`, `updated_at` | `timestamptz` | |

### 4.2 `directory_entries` (the seed schema, reconciled)

Seed schema requested: `id, name, address, postcode, country, website_url, email, phone, logo_url, notes_html, allow_html, group_name, is_active`. Reconciled against `listings` (which already has all of these plus `city`, `lat`, `lng`, `geocode_status`, `source`) — this spec keeps that superset, since DIR-E4 requires lat/lng for map use and DIR-E1 requires source-tracking parity with the existing import/sync UI:

| Column | Type | Notes |
|---|---|---|
| `id` | `text pk` | |
| `directory_id` | `text → directories.id` | |
| `name` | `text not null` | |
| `address`, `postcode`, `country`, `city` | `text null` | Matches `listings`. |
| `lat`, `lng` | `double precision null` | Optional — only required for DIR-E4 (map datasource). `geocode_status` (`text null`) mirrors `listings.geocode_status` for the existing `geocode_listings` edge function to be reused unchanged against this table. |
| `website_url`, `email`, `phone` | `text null` | |
| `logo_url` | `text null` | |
| `notes_html`, `allow_html` | `text null`, `boolean default false` | Matches `listings`. |
| `directory_group_id` | `text null → directory_groups.id` | The **simple, single-value** grouping — the direct equivalent of `listings.group_id`/import's `group_name` column, kept for backward-compatible CSV import behaviour (unchanged column name in templates: `group_name`). See reconciliation note below. |
| `is_active` | `boolean not null default true` | Same soft-visibility-toggle semantics as `listings.is_active`, not an audit archive (matches existing convention; DIR-E1 stories call out that hard delete remains separate, per existing precedent). |
| `source` | `text check in ('manual','csv','integration')` | Mirrors `listings.source`. |
| `meta_title`, `meta_description` | `text null` | Per-entry SEO override (DIR-E2). Null = fall back to `directories.seo_defaults_json` template. |
| `noindex` | `boolean null` | Per-entry override of `directories.seo_defaults_json.default_noindex`; null = inherit. |
| `structured_data_type` | `text null check in ('LocalBusiness','Organization','Person')` | Per-entry override of the directory default. |
| `sitemap_priority` | `numeric(2,1) null check (sitemap_priority between 0 and 1)` | Optional per-entry `sitemap.xml` `<priority>` override. |
| `created_at`, `updated_at` | `timestamptz` | |

**Reconciling `group_name` with the new Categorisation model (scope item 5):** `group_name` remains, unchanged, as the simple single-value grouping column used by CSV import today — `directory_groups` is a straight copy of the existing `groups` table, scoped to `directory_id` instead of `map_id`, for exactly this purpose, and the CSV template keeps a `group_name` column with the same auto-create-on-import behaviour as `groups` has today. The new, richer **Categorisation** model (§4.3) is additive and reusable *across directories* — e.g. a "Sector" categorisation shared by every directory a client owns — which `directory_groups` structurally cannot do (it is per-directory only, single-valued, exactly like `groups` is per-map only). Put simply: `directory_group_id` answers "which single group is this entry filed under" (cheap, familiar, matches existing import UX); `entry_category_terms` answers "which of any number of reusable, multi-directory taxonomy terms apply to this entry" (the new capability). Both coexist, exactly as `groups` and `map_filter_fields` already coexist for maps today (§3.2) — this is not a novel shape for this codebase, it's the same precedent applied to a new entity.

### 4.3 Categorisations (taxonomies) — DIR-E5

| Table | Key columns | Notes |
|---|---|---|
| `categorisations` | `id uuid pk`, `client_id → clients.id`, `key text` (unique per client), `label text`, `applies_to text check in ('directory','entry','both')`, `is_active boolean`, `created_at` | Client-scoped (not per-directory), so one "Sector" taxonomy can tag entries across every directory the client owns. Mirrors `map_filter_fields`' shape (`key`/`label`/`is_active`) at client scope instead of map scope. |
| `category_terms` | `id uuid pk`, `categorisation_id → categorisations.id`, `label text`, `slug text`, `sort_order int`, `color text null` | Mirrors `map_filter_field_options`. Unique `(categorisation_id, slug)`. |
| `directory_category_terms` | `directory_id → directories.id`, `term_id → category_terms.id`, pk `(directory_id, term_id)` | Tags a whole directory (e.g. "this directory covers the Healthcare sector") — drives cross-directory discovery/navigation. |
| `entry_category_terms` | `entry_id → directory_entries.id`, `term_id → category_terms.id`, pk `(entry_id, term_id)` | Mirrors `listing_filter_values` but as a pure many-to-many (no free-text value variant, unlike `listing_filter_values.value_text` — categorisations in this spec are always term-based; a free-text "note" is already covered by `directory_entries.notes_html`). |

RLS on all four follows the existing `_admin_all` / `_own_client` / `_anon_select` (published-only) triad from `20260713120000_create_map_filter_fields.sql`.

### 4.4 Entry page layout designer output — DIR-E6

| Table | Key columns | Notes |
|---|---|---|
| `entry_templates` | `id uuid pk`, `directory_id → directories.id`, `name text`, `is_default boolean`, `applies_to_group_id text null → directory_groups.id`, `applies_to_term_id uuid null → category_terms.id`, `layout_json jsonb`, `created_at`, `updated_at` | `layout_json` is an ordered array of block descriptors, e.g. `[{type:"logo"},{type:"heading",field:"name"},{type:"address_map"},{type:"contact_details",fields:["phone","email","website_url"]},{type:"notes_html"},{type:"categorisation",key:"sector"}]`. A single jsonb blob for a designer's output matches the existing `theme_json`/`mapStyleSettings` precedent — no new persistence pattern is introduced. |

**Decision (2026-07-14): multiple templates are supported in v1**, not deferred. A directory can have several named `entry_templates` rows. Exactly one has `is_default = true` (the fallback used when nothing more specific matches). Any other template may optionally target a specific `directory_group_id` or `category_term_id` (mutually exclusive — a template targets a group *or* a term, not both) to override the default for just that slice of entries. Resolution order per entry, most specific first: (1) a template whose `applies_to_term_id` matches one of the entry's `entry_category_terms`, (2) a template whose `applies_to_group_id` matches the entry's `directory_group_id`, (3) the directory's default template. If more than one term-targeted template matches an entry (it has several tags with distinct templates assigned), the tie-break is the term's `category_terms.sort_order`. Deleting a non-default template that is still targeted simply falls back that slice of entries to the default — it does not delete entries or their data.

### 4.5 Publishing snapshot — DIR-E2

`directory_publications` mirrors `map_publications` exactly: `id uuid`, `directory_id`, `version int`, `config jsonb` (a snapshot of directory settings + entries + categorisation terms + entry template, at publish time), `note text`, `published_at`, `published_by`, unique `(directory_id, version)`. Two new RPCs, `publish_directory(p_directory_id, p_config, p_note)` and `rollback_directory_to(p_directory_id, p_publication_id)`, `security definer`, mirroring `publish_map`/`rollback_map_to` including their manual tenant re-check.

### 4.6 Branding & domain — DIR-E3

- `directories.theme_json` (§4.1) covers colour tokens/logo — reuses the `maps.theme_json` + CSS-custom-property-injection pattern (§3.7), no new mechanism.
- `directory_domain_mappings`: `id uuid`, `directory_id → directories.id`, `domain text unique`, `status text check in ('pending','verifying','verified','failed')` (naming precedent: `clients.email_domain_status`), `verification_token text`, `dns_instructions jsonb` (record type/name/value to show the client), `tls_status text check in ('pending','issued','failed')`, `verified_at timestamptz null`, `created_at`, `updated_at`. Per the §9 decision, this mirrors status returned by the **Vercel Domains API** rather than implementing DNS/TLS logic in this codebase — there is no existing domain-hosting mechanism to extend, only the unrelated Resend email-domain-verification naming convention borrowed above (§3.7).

### 4.7 Map ↔ Directory association — DIR-E4 / DIR-E8

**Decision (2026-07-14): a directory-sourced map consumes the directory's published entries directly and live — there is no sync/copy job, and `listings`/`map_data_sources` are not touched by this feature at all.** This is a deliberate departure from the Google-Sheets-style "sync into `listings`" pattern in §3.1/§3.2: a client should never end up editing the same entry in two places (once via `ClientMapData.jsx`'s manual/CSV/Sheets tabs, once via the Directory's own entry management), and the map should never show data that's silently drifted from the directory it's supposed to reflect. One join table expresses both directions of the relationship:

- `directory_map_associations`: `directory_id → directories.id`, `map_id → maps.id`, `role text check in ('embedded_on_directory','directory_as_datasource')`, `sort_order int`, pk `(directory_id, map_id, role)`. Many-to-many (multiple maps per directory, and — per the 2026-07-14 decision to support multiple now rather than defer — multiple directories feeding one map is *not* required, but a directory *can* be associated with more than one map in either role).
- **`directory_as_datasource` role, resolved at read time, not sync time:** when a map has a `directory_map_associations` row with this role, its public/embedded rendering path (`EmbedMap.jsx` → `PublishedMapView.jsx`) sources pins from a new `public_directory_entries` view (mirrors the existing `public_listings` view shape/columns exactly — `name`, `lat`, `lng`, `logo_url`, etc. — but reads from `directory_entries` scoped to `directory_id`, filtered to `is_active = true` and to the directory's `current_publication_id` being non-null) **instead of** from `public_listings`. There is no `map_data_sources` row, no `sync_logs` entry, and no "Sync now" action for this provider — the map is always exactly as current as the directory's last publish, by construction, with no separate stale/fresh state to reason about.
- Because there's no sync step, the map's own Manual entry / Upload CSV / Sync data tabs are **disabled** for a map in this mode (same "tab disabled with a reason" convention already used to mutually-exclude Manual/CSV while a Google Sheets sync is linked, §3.1) — a map is either self-authored (manual/CSV/Sheets, using `listings`) or directory-sourced (using the associated directory's entries), never both, for v1.
- `contact_directory_permissions`: `contact_id → contacts.id`, `directory_id → directories.id`, `can_edit_entries boolean`, mirroring `contact_map_permissions` exactly, for Member-level per-directory scoping (§2).

---

## 5. Non-functional requirements

**SEO & AI discoverability.** A published directory must be crawlable by a client that does not execute JavaScript and by an LLM crawler reading `llms.txt`. Given the audit in §3.5 (no SSR/SSG capability exists today), and per the **decision made 2026-07-14**, this is delivered as:
  - **Static pre-render at publish time** — on `publish_directory`, a new Edge Function renders each entry + the directory index to static HTML (and the accompanying `sitemap.xml`, per-entry JSON-LD, `robots.txt`, `llms.txt`) and uploads it to static storage (reusing the existing `generate_map_snapshot` → Vercel Blob precedent, §3.5), served at the public URL instead of the SPA shell. This was chosen over on-demand SSR because it needs no new always-on server runtime and fits the existing draft/publish snapshot model exactly — content is exactly as fresh as the last `publish_directory` call, matching how every other "published" surface in this codebase already behaves (§3.3).
  Required elements: per-page `<title>`/`<meta description>`, canonical `<link rel="canonical">`, Open Graph + Twitter Card tags, JSON-LD (`LocalBusiness`/`Organization` per entry, `ItemList` for the directory index), `sitemap.xml`, `robots.txt`, `llms.txt` (directory-level + per-entry summaries), clean crawlable URLs (`/:clientSlug/:directorySlug` and `/:clientSlug/:directorySlug/:entrySlug`, following the existing `/:clientSlug/:mapSlug` convention), index/no-index controls at both directory and entry level (§4).

**Rendering.** The *authoring* UI (admin/client portal) stays CSR React, matching every other screen in the app — only the *public* surface gets the new static-pre-render path.

**Performance.** List/table views must not regress the existing "load everything into the browser" pattern for small datasets, but per §3.2's flagged gap, any directory expected to exceed roughly 1,000 entries needs server-side pagination (Supabase `.range()`), which is new relative to current `listings`/`ClientMapData` behaviour — called out per-story where relevant (DIR-E1-S1).

**Accessibility.** New UI (layout designer, faceted filters, published entry pages) must meet the same bar implicitly set by existing Mantine-based screens (keyboard-operable controls, visible focus states, form labels) — no stricter WCAG target is asserted here beyond what the codebase already does, since none is documented today.

**Security / multi-tenancy.** Every new table gets RLS following the existing `_admin_all` / `_own_client` / `_anon_select` (published-only) triad (§3.5) — no new access-control mechanism is introduced. Custom-domain TLS (DIR-E3) must not weaken tenant isolation: a verified domain must be provably owned by the client before it's wired to serve that client's content.

**Custom domain / TLS — decided 2026-07-14: Vercel Domains API.** A Vercel project is already linked to this repo (`vercel.json`, `.vercel/project.json`) and `docs/DEPLOY.md`/`docs/ENVIRONMENTS_SETUP.md` already treat Vercel as a deployment target, so client custom domains are added to that same project via the Vercel Domains API — Vercel handles the DNS-ownership verification challenge and automatic TLS issuance/renewal, and `directory_domain_mappings` (§4.6) stores the mapping and mirrors Vercel's own verification/TLS status rather than implementing DNS/TLS logic from scratch. This does mean production directory traffic is served via Vercel even though the main app's production deploy target today is GitHub Pages (§3.5) — worth the team confirming this split (marketing/app on GitHub Pages, published directories on Vercel) is acceptable before DIR-E3 implementation, since it's a new operational split, not a correction of an existing one.

**Natural-language search — decided 2026-07-14: LLM-backed parser.** DIR-E7 introduces a new Edge Function (naming convention: `directory_nl_search`, alongside the existing `score_candidate`-style precedent from the sibling Jobs product, though no such function exists in this Maps codebase today — see §3.5) that sends the visitor's query plus the directory's available categorisations/terms to an LLM and gets back a structured filter predicate. This is a **new third-party integration** for this codebase and, per `AGENTS.md`'s documentation rules, requires a `docs/DATA_AND_PRIVACY.md` update before DIR-E7 ships (new external API, new data flow: visitor search query text leaves the app to a third-party LLM provider). Query text must not include any authenticated-user PII beyond what the visitor typed; do not send `contacts`/`profiles` data alongside the query.

---

## 6. Epics

| ID | Title | Goal | Scope |
|---|---|---|---|
| **DIR-E1** | Directory & Entry Management | Clients and admins can create, edit, archive, and bulk-manage directories and their entries, including CSV/XLSX import. | CRUD UI for `directories`/`directory_entries`, bulk actions, import — reusing the `ClientMapData.jsx`-style pattern (§3.2). |
| **DIR-E2** | Publishing as an SEO/AI-discoverable website | A directory can be published as a crawlable public site with full SEO metadata, sitemap, and structured data. | Publish snapshot model, public rendering path, per-directory/per-entry SEO settings. |
| **DIR-E3** | White-labelling & branding | A client can brand their directory's public site and serve it from their own domain. | `theme_json` branding UI + preview, custom domain mapping + DNS/TLS verification. |
| **DIR-E4** | Directory as a map datasource | An existing map can use a directory's published entries as its live pin data — no sync/copy step. | New "Directories" tab in the map Data panel (built on a newly-extracted shared tab component, §3.1); `directory_map_associations(role='directory_as_datasource')` + `public_directory_entries` view (§4.7); explicitly does **not** touch `map_data_sources`/`listings`. |
| **DIR-E5** | Categorisations | Reusable, client-wide taxonomies can be applied to directories and entries, driving filtering/navigation. | `categorisations`/`category_terms` model + management UI; reconciles with `group_name`. |
| **DIR-E6** | Entry page layout designer | A client can arrange the blocks on an entry's page and save one or more reusable templates, optionally targeted to a group or category term. | Drag-and-drop block editor + live preview, `entry_templates` (multi-template supported from v1, §4.4). |
| **DIR-E7** | Natural-language search + faceted filtering | Visitors (and portal users) can search entries in plain language or by structured filters. | LLM-backed NL query parsing to structured predicates (new Edge Function, §5), published-site and in-app filter UI. |
| **DIR-E8** | Map association & embedding | A directory can link to one or more maps and show them embedded on its published pages. | `directory_map_associations(role='embedded_on_directory')` (many-to-many from v1), reuse of the existing embed-snippet mechanism (§3.4). |

## 7. Sequencing / suggested delivery order

1. **DIR-E1** (foundation — nothing else is buildable without directories/entries existing).
2. **DIR-E5** (categorisations) — entries need a real taxonomy before layout/search/publish stories can reference it meaningfully; also the point at which `group_name` reconciliation (§4.2) must land.
3. **DIR-E8** (map association & embedding) — the lower-risk half of the map↔directory relationship (pure reuse of the existing embed snippet, §3.4); unblocks demoable end-to-end value (a directory with a map on it) before the harder SEO/rendering work starts.
4. **DIR-E2** (publishing/SEO) — depends on E1 (content to publish) and benefits from E5 (categorisation-driven `ItemList`/breadcrumb structure). Rendering approach is decided (static pre-render at publish, §5), so this can proceed without further architectural debate.
5. **DIR-E6** (entry layout designer) — most useful once there's a real published surface (E2) to preview against; depends on E1 for the field set and E5 for categorisation/group-targeted templates (§4.4).
6. **DIR-E3** (branding & custom domain) — depends on E2 existing (nothing to brand/host under a custom domain before there's a public site). Since the DNS/TLS provider is decided (Vercel Domains API, §5), the branding-colours and custom-domain halves can proceed together rather than being split by an open decision.
7. **DIR-E4** (directory as map datasource) — depends on E1; sequenced after E8 so the shared tab-component extraction it requires (§3.1, now in scope) lands after E8 has already exercised the embed side of the same map-editing surface. Since this epic no longer touches `map_data_sources` (§4.7 — it reads published directory data live, no sync job), its schema footprint is smaller than originally scoped, but the shared-component extraction still benefits from coming after E8.
8. **DIR-E7** (NL search) — deliberately last: it depends on entries, categorisations, and a published surface all existing. The resolution approach is decided (LLM-backed parser, §5), but this is a brand-new third-party integration for this codebase with its own privacy documentation step (`docs/DATA_AND_PRIVACY.md`) — sequenced last so it doesn't block anything else while that integration is stood up.

---

## 8. User stories

### DIR-E1 — Directory & Entry Management

**DIR-E1-S1 — Create a directory**
As a **Client Owner/Manager**, I want to create a new directory for my organisation, so that I have a place to add and manage entries before publishing.

```gherkin
Given I am signed in as an Owner or Manager of client "Acme"
When I go to Directories and choose "New directory"
And I enter a name "Accredited Suppliers" and a slug "accredited-suppliers"
Then a new directory row is created with client_id = my client, is_active = true, and no current_publication_id
And I am taken to the directory's Entries tab, which shows an empty state with a "Add your first entry" call to action

Given a directory slug "accredited-suppliers" already exists for client "Acme"
When I try to create another directory for "Acme" with the same slug
Then the save is rejected with a validation error "This slug is already used by another directory" and no row is created

Given I am signed in as a Member (not Owner/Manager) of client "Acme"
When I view the Directories section
Then I do not see a "New directory" action
And directly navigating to the create-directory route redirects me away with a permission notice
```
*Tech guardrails:* New page under `src/pages/client/` and `src/pages/admin/` following the existing `MapEditSubNav`/map-create flow as the closest analogue (there is no existing "Directories" nav item — add one at the same level as "Maps" in `ClientLayout.jsx`/`AdminLayout.jsx`). Slug uniqueness enforced by a `unique(client_id, slug)` index on `directories`, mirroring `maps`. Emit `directory_created` admin event (new category, same `meta` shape as `map_design_created`, per AGENTS.md's event rule) when created via `/admin/*`.

**DIR-E1-S2 — List and search entries within a directory**
As a **Client Owner/Manager/Member with access**, I want to see a searchable, paginated table of a directory's entries, so that I can find and manage individual entries.

```gherkin
Given directory "Accredited Suppliers" has 1,200 entries
When I open its Entries tab
Then entries load in pages of 100 (matching PAGE_SIZE convention in ClientMapData.jsx), server-side, not all 1,200 at once
And I can type into a search box to filter by name/address, with results updating without a full page reload

Given I am a Member without contact_directory_permissions granted for this directory
When I try to open its Entries tab directly by URL
Then I see a "you don't have access to this directory" message instead of the entry table
```
*Tech guardrails:* This is the one place this spec deliberately deviates from the existing `ClientMapData.jsx` pattern rather than copying it: use Supabase `.range()` server-side pagination instead of client-side `.slice()`, per the scale gap noted in §3.2/§5. Reuse the existing table/search-box visual style, not the pagination mechanism.

**DIR-E1-S3 — Create/edit an entry**
As a **Client Owner/Manager/Member with edit access**, I want to add or edit a directory entry with the seed fields, so that the directory's content stays accurate.

```gherkin
Given I am editing directory "Accredited Suppliers"
When I click "Add entry" and fill in name "Bright Solutions Ltd", address, postcode, country, website, email, phone, and pick a group
And I click Save
Then a new directory_entries row is created with source = 'manual'
And it appears in the entries table immediately

Given I am editing an existing entry and leave "Name" blank
When I try to save
Then the save is rejected with "Name is required" and no row is written

Given allow_html is enabled for an entry's notes field
When I save notes_html containing a <script> tag
Then the tag is stripped/escaped before storage or rendering (no raw script execution on the published page)
```
*Tech guardrails:* Reuse the fixed-overlay modal-form convention from `ClientMapData.jsx` (§3.2) rather than introducing a modal library, for visual/behavioural consistency. `notes_html` sanitisation must happen regardless of `allow_html`, since `listings.notes_html` has no documented sanitisation today — flagged as a security guardrail specific to this new entity rather than an assumption that the existing pattern already handles it safely (verify during implementation; do not silently inherit an unverified assumption).

**DIR-E1-S4 — Bulk actions on entries**
As a **Client Owner/Manager**, I want to select multiple entries and apply a bulk action, so that I can manage large directories efficiently.

```gherkin
Given I have selected 40 entries via their row checkboxes
When I choose "Bulk archive" (set is_active = false)
Then all 40 entries are updated in one operation and disappear from the default (active-only) view

Given I have selected entries with mixed existing category-term values
When I open "Bulk tag" and choose to add term "Healthcare" in "add" mode
Then the term is added to entries that don't already have it and left unchanged on entries that do
When I instead choose "replace" mode
Then existing terms for that categorisation are removed and replaced with "Healthcare" only, for all selected entries
```
*Tech guardrails:* Mirrors `BulkFilterEditModal.jsx`'s add-vs-replace mode exactly, but targets `entry_category_terms` (§4.3) instead of `listing_filter_values`.

**DIR-E1-S5 — Archive and delete a directory**
As a **Client Owner/Manager**, I want to archive or permanently delete a directory, so that I can retire directories that are no longer needed.

```gherkin
Given directory "Old Suppliers List" is currently published
When I choose "Archive"
Then is_active is set to false, the directory disappears from the default directories list, and its public page starts returning a "no longer available" response instead of stale content
But its data and publication history are retained (soft action, matching listings.is_active convention)

Given I choose "Delete permanently" on an archived directory
When I confirm by typing DELETE (matching the ConfirmDelete pattern in FilterFieldsPanel.jsx, not a native window.confirm)
Then the directory, its entries, categorisation term links, and publications are hard-deleted
And this action is only available to Owner/Manager, never to Member
```
*Tech guardrails:* Uses the `ConfirmDelete`-with-typed-confirmation pattern (§3.2) rather than `window.confirm`, since permanent deletion here cascades much further (entries + publications) than the existing single-row `listings` delete — a stronger confirmation than the codebase's current default is a deliberate, called-out choice, not scope creep.

**DIR-E1-S6 — Import entries from CSV/XLSX**
As a **Client Owner/Manager**, I want to import entries from a CSV or XLSX file, so that I can bring in an existing dataset without re-keying it.

```gherkin
Given I download the entry import template
Then it contains the seed columns (name, address, postcode, country, website_url, email, phone, logo_url, notes_html, allow_html, group_name, is_active) plus one filter_<key>-style column per active categorisation applied to this directory

Given I upload a CSV with 500 rows, including a group_name column with 3 distinct values
When I choose "Add to existing"
Then 3 new directory_groups rows are auto-created for previously-unseen group names (matching groups auto-create behaviour today) and 500 entries are upserted

Given I upload an XLSX file instead of CSV
Then it is accepted and parsed equivalently (Gap: today's CSV import is CSV-only — XLSX support is new work, not a copy of existing behaviour)

Given my file is missing the required "name" header
When I try to upload
Then I see "Missing required column: name" and the import does not proceed
```
*Tech guardrails:* CSV path reuses `parseCSV`/`downloadTemplate`/import-mode-overlay conventions from `ClientMapData.jsx` (§3.2) directly. XLSX parsing is new (no existing precedent in this codebase to reuse) — recommend a client-side XLSX-to-row-object parser feeding the same import pipeline used for CSV, so downstream validation/upsert logic is shared, not duplicated.

**DIR-E1-S7 — Delete a single entry**
As a **Client Owner/Manager/Member with edit access**, I want to permanently delete a single entry, so that I can remove incorrect or unwanted records.

```gherkin
Given I choose "Delete" on entry "Bright Solutions Ltd"
Then I am asked to type DELETE to confirm (the ConfirmDelete-with-typed-confirmation pattern, §3.2/§4.2's precedent) — not a plain window.confirm()
When I type DELETE and confirm
Then the entry, its entry_category_terms rows, and any per-entry template assignment are hard-deleted, and it disappears from the entries table immediately

Given I open the delete confirmation but do not type DELETE correctly
When I click Confirm
Then the deletion does not proceed and the entry is unchanged
```
*Tech guardrails:* **Decision (2026-07-14): entry deletion uses the same typed-confirmation pattern as directory deletion (DIR-E1-S5) and categorisation-definition deletion (`FilterFieldsPanel.jsx`'s `ConfirmDelete`)**, not the plain `window.confirm()` used by `listings.delete()` today — a deliberate, consistent upgrade over the existing convention for this new entity, not an inherited default.

---

### DIR-E2 — Publishing as an SEO- and AI-discoverable website

**DIR-E2-S1 — Publish a directory**
As a **Client Owner/Manager**, I want to publish my directory, so that it becomes a live, indexable public website.

```gherkin
Given directory "Accredited Suppliers" has never been published
When I click "Publish" and confirm
Then a directory_publications row is created (version 1), directories.current_publication_id and published_at are set
And the public URL /acme/accredited-suppliers now serves the published content instead of a "not yet published" message

Given the directory was already published at version 3, and I've made further entry edits since
When I click "Publish" again
Then a new version 4 snapshot is created reflecting current entries/categorisations, and current_publication_id moves to it
And the previous version remains available for rollback (mirrors rollback_map_to)
```
*Tech guardrails:* Mirrors `publish_map`/`map_publications` exactly (§4.5); emit `directory_publish_requested` / `directory_published` / `directory_publish_failed` admin events per the existing `map_publish_*` category convention.

**DIR-E2-S2 — Per-directory SEO defaults**
As a **Client Owner/Manager**, I want to set default meta title/description, index/no-index, and structured-data type for my directory, so that every entry has sensible SEO metadata without per-entry effort.

```gherkin
Given I set the directory's default meta description and choose structured-data type "LocalBusiness"
When I publish
Then every entry's public page includes that meta description (unless overridden per-entry) and LocalBusiness JSON-LD populated from its fields

Given I set the directory to "No-index" by default
When an entry has not set its own noindex override
Then that entry's page renders a <meta name="robots" content="noindex"> tag and is excluded from sitemap.xml
```
*Tech guardrails:* `directories.seo_defaults_json` / `directory_entries.meta_title|meta_description|noindex|structured_data_type` per §4.1/§4.2; per-entry `null` = inherit directory default (explicit precedence rule engineers must implement, not left implicit).

**DIR-E2-S3 — Per-entry SEO override**
As a **Client Owner/Manager/Member with edit access**, I want to override the meta title, description, index setting, or structured-data type for a specific entry, so that unusual entries (e.g. a flagship member) can have custom SEO treatment.

```gherkin
Given entry "Bright Solutions Ltd" has a custom meta_title set
When the directory is published
Then that entry's page uses the custom meta_title instead of the directory-level template

Given entry "Confidential Pilot Member" has noindex = true
Then it is omitted from sitemap.xml and rendered with a noindex meta tag, even though the directory default is indexable
```

**DIR-E2-S4 — Sitemap, robots.txt, and llms.txt**
As an **Anonymous visitor's crawler (search engine or LLM)**, I want machine-readable discovery files for a published directory, so that its content can be indexed correctly.

```gherkin
Given directory "Accredited Suppliers" is published with 500 active, indexable entries
When a crawler requests /acme/accredited-suppliers/sitemap.xml
Then it lists the directory index URL and all 500 entry URLs, honouring each entry's sitemap_priority where set

Given the same directory
When a crawler requests /acme/accredited-suppliers/llms.txt
Then it returns a plain-text summary of the directory (name, description, entry count) plus a link list of entry pages, incorporating seo_defaults_json.llms_txt_extra if set

Given the directory root
When a crawler requests /robots.txt
Then noindexed directories/entries are disallowed and the sitemap location is referenced
```
*Tech guardrails:* Generated at publish time under the chosen rendering approach (§5) — do not generate these at request time against live data, to keep them consistent with the immutable publish snapshot model used everywhere else in this feature.

**DIR-E2-S5 — Crawlable entry page without JavaScript**
As an **Anonymous visitor's crawler**, I want an entry's page to contain full content in the initial HTML response, so that it can be indexed without executing JavaScript.

```gherkin
Given entry "Bright Solutions Ltd" is published
When a crawler (or curl, with no JS execution) requests /acme/accredited-suppliers/bright-solutions-ltd
Then the initial HTML response contains the entry's name, address, and notes content directly in the markup — not only inside a client-rendered <div id="root">Loading…</div> shell
And it includes Open Graph and Twitter Card tags reflecting the entry's name/description/logo_url as the image
And it includes a canonical <link rel="canonical" href="https://.../acme/accredited-suppliers/bright-solutions-ltd">
```
*Tech guardrails:* Delivered via the static-pre-render-at-publish approach decided in §5 — cannot be delivered by the current CSR-only architecture (§3.5) without that new rendering step. Do not attempt to satisfy this with client-side `document.title` writes alone (insufficient for non-JS crawlers, and not how any existing page in this codebase currently behaves — there are zero such writes today, §3.5).

---

### DIR-E3 — White-labelling / branding

**DIR-E3-S1 — Brand colours and logo**
As a **Client Owner/Manager**, I want to set a brand colour scheme and logo for my directory's public site, so that it looks consistent with my organisation, not the default Layercake theme.

```gherkin
Given I open the directory's Branding settings and set a primary colour and upload a logo
When I save
Then directories.theme_json is updated with those values and a live preview updates immediately, without needing to publish first

Given I have not set a custom brand colour
When the directory is published
Then it falls back to the platform default teal/coral brand tokens (matching --brand-teal/--brand-coral fallback behaviour in style.css today), not a broken/unstyled page
```
*Tech guardrails:* Reuse the CSS-custom-property injection pattern from `PublishedMapView.jsx` (§3.7) applied to the directory's public page root, not a new theming mechanism.

**DIR-E3-S2 — Live branding preview**
As a **Client Owner/Manager**, I want to preview my branding changes against real entry content before publishing, so that I can be confident in how the live site will look.

```gherkin
Given I change the primary colour in Branding settings
When I look at the preview pane
Then it renders a representative entry page (or the directory index) using the draft theme_json values, updating without a page reload, matching the existing draft-autosave pattern used for map design settings
```

**DIR-E3-S3 — Custom domain mapping**
As a **Client Owner/Manager**, I want to map my own domain or subdomain to my directory, so that visitors see my brand's URL instead of the platform's.

```gherkin
Given I enter "suppliers.acme.com" as a custom domain for directory "Accredited Suppliers"
When I save
Then a directory_domain_mappings row is created with status = 'pending', the domain is registered against the project via the Vercel Domains API, and I am shown the DNS record (type/name/value) Vercel requires

Given I have added the required DNS record at my registrar
When Vercel confirms the domain (polled or webhook-driven, not a manual "Verify" click the client has to time)
Then status becomes 'verified' and tls_status moves to 'issued' automatically once Vercel completes certificate issuance — no separate manual TLS step
On failure (DNS not yet propagated, misconfigured record), status remains 'pending' and I see the specific reason Vercel's API returns (e.g. "TXT record not found")

Given a domain is already verified and mapped to a different client's directory
When I try to map the same domain to my directory
Then the save is rejected — domain uniqueness is enforced (unique constraint on directory_domain_mappings.domain), consistent with Vercel's own one-project-per-domain rule
```
*Tech guardrails:* **Decision (2026-07-14): Vercel Domains API** (§5) — `directory_domain_mappings` mirrors Vercel's verification/TLS status rather than implementing DNS-challenge/certificate-issuance logic in this codebase. Status-enum naming still borrows the `clients.email_domain_status` precedent for consistency (§3.7), but the underlying mechanism is Vercel's, not custom-built.

---

### DIR-E4 — Directory as a map datasource

**DIR-E4-S1 — Add a "Directories" tab to the map Data panel**
As a **Client Owner/Manager**, I want a "Directories" tab alongside the existing Manual entry / Upload CSV / Sync data tabs when editing a map's data, so that I can use one of my directories as the map's pin source.

```gherkin
Given I am on a map's Data tab
Then I see a new "Directories" tab in the same tab strip as "Manual entry", "Upload CSV", and "Sync data", styled identically (admin-map-tabs convention)

Given a Google Sheets sync is currently linked to this map, or a Directory is already linked
When I view the other data-source tabs (Manual entry / Upload CSV / Sync data / Directories)
Then whichever ones are not the active source are disabled with the same "Disconnect X to use this tab" messaging used for mutually-exclusive tabs today — a map is either self-authored or directory-sourced, never both
```
*Tech guardrails:* **Decision (2026-07-14): this story includes extracting a shared tab-strip component** used by both `AdminMapData.jsx` and `ClientMapData.jsx` (§3.1) — rather than adding a fourth copy-pasted tab block to each file, the tab-id/label/disabled-reason array and the button-strip rendering become one shared piece, with each tab's content still supplied by the (admin- or client-specific) parent. This is explicitly in scope for DIR-E4, not a deferred refactor.

**DIR-E4-S2 — Associate a directory as the map's live datasource**
As a **Client Owner/Manager**, I want to pick one of my directories so this map's pins come directly from its published entries, so that I never have to maintain the same location data twice or worry about it drifting out of sync.

```gherkin
Given I open the Directories tab and pick "Accredited Suppliers" and confirm
Then a directory_map_associations row is created with role = 'directory_as_datasource'
And the map immediately shows pins for that directory's currently-published, active entries that have lat/lng — with no separate "sync" action to trigger and no map_data_sources/sync_logs rows created at all

Given the selected directory has entries without lat/lng
Then those entries are simply not shown as pins (not shown as broken pins), with a count of "N entries have no location" surfaced the same way missing-geocode entries are surfaced today

Given the selected directory has never been published (no current_publication_id)
Then the map shows an empty state ("Accredited Suppliers hasn't been published yet") rather than an error, and starts showing pins automatically the moment the directory is published — no re-selection needed
```
*Tech guardrails:* No schema change to `map_data_sources` — this reads from the new `public_directory_entries` view (§4.7), scoped to the directory's current publication, at render time in `EmbedMap.jsx`/`PublishedMapView.jsx`. There is no import/upsert step and nothing to reconcile, by design.

**DIR-E4-S3 — Map reflects directory changes automatically on the directory's next publish**
As a **Client Owner/Manager**, I want the map to reflect the directory's latest published content without any separate map-side action, so that publishing the directory once is the only step needed.

```gherkin
Given the map is associated with directory "Accredited Suppliers" as its datasource
When I add a new entry with valid lat/lng in the directory and then publish the directory
Then the new entry appears as a pin on the map immediately — there is no "Sync now" button on the map side to click, because the map always reads the directory's current publication live

Given I edit an entry's location or archive it in the directory but do not publish the directory yet
Then the map continues showing the previous published state (the old location, or the entry still visible) until the directory is next published — matching how the map's own design changes already only take effect for the public embed once published (§3.3), not on every draft save
```
*Tech guardrails:* **Decision (2026-07-14): no sync job, scheduled or manual — the map consumes the directory's published data directly.** This removes the need for `map_data_sources.sync_schedule`/`sync_logs` for this provider entirely; "freshness" is governed purely by when the client last published the directory, identical to how a map's own design settings only reach the public embed via `publish_map` today.

---

### DIR-E5 — Categorisations

**DIR-E5-S1 — Create a categorisation and its terms**
As a **Client Owner/Manager**, I want to define a reusable categorisation (e.g. "Sector") with a set of terms, so that I can consistently tag directories and entries across my organisation.

```gherkin
Given I create a categorisation "Sector" that applies_to "entry"
And I add terms "Healthcare", "Manufacturing", "Retail"
Then categorisations and category_terms rows are created, scoped to my client (not any single directory)

Given I try to create a second categorisation with the same key "sector" for the same client
Then the save is rejected — key uniqueness is enforced per client (mirrors map_filter_fields' per-map key uniqueness, applied at client scope)
```
*Tech guardrails:* New admin/client panel modelled directly on `FilterFieldsPanel.jsx` (§3.2), including its "type/applies_to is immutable after creation, delete-and-recreate to change it" convention and its typed-confirmation delete flow.

**DIR-E5-S2 — Apply categorisation terms to entries and directories**
As a **Client Owner/Manager/Member with edit access**, I want to tag an entry (or a whole directory) with one or more terms from a categorisation, so that visitors can filter/navigate by it.

```gherkin
Given entry "Bright Solutions Ltd" and categorisation "Sector" (multi-select-capable)
When I tag it with both "Healthcare" and "Manufacturing"
Then two entry_category_terms rows are created for that entry

Given I remove the "Manufacturing" tag from the entry
Then only its entry_category_terms row for that term is deleted; the entry's other tags are unaffected

Given a categorisation applies_to "directory" (not "entry")
When I look at an individual entry's edit form
Then that categorisation does not appear as a taggable option there — it only appears on the directory-level settings screen
```

**DIR-E5-S3 — Reconcile with existing `group_name`**
As a **Client Owner/Manager**, I want the existing "Group" field (from CSV import) and my new categorisations to coexist without confusion, so that migrating from a simple grouping to richer taxonomies is not disruptive.

```gherkin
Given directory "Accredited Suppliers" already has entries with a group_name-based group assigned (directory_group_id)
When I additionally define and apply a "Sector" categorisation
Then both the entry's group and its categorisation terms are visible and independently editable on the entry's edit form, in clearly separate sections labelled "Group" and "Categorisations"

Given I export or view the CSV import template for this directory
Then it still contains a single group_name column (unchanged, backward-compatible) plus one additional column per active categorisation
```

**DIR-E5-S4 — Filter navigation driven by categorisations**
As an **Anonymous visitor**, I want to filter a published directory by categorisation terms, so that I can narrow down to entries relevant to me.

```gherkin
Given published directory "Accredited Suppliers" has categorisation "Sector" with terms Healthcare/Manufacturing/Retail applied across its entries
When I visit the directory's public index page
Then I see filter controls for "Sector" listing only the terms actually in use, each showing a count of matching entries
When I select "Healthcare"
Then the entry list narrows to only entries tagged Healthcare, and the URL reflects the filter (shareable/bookmarkable, e.g. ?sector=healthcare)
```

---

### DIR-E6 — Entry page layout designer

**DIR-E6-S1 — Arrange blocks on the entry template**
As a **Client Owner/Manager**, I want to drag and drop the blocks that make up an entry's page (logo, name, address+map, contact details, notes, categorisation tags), so that I control the layout without needing engineering help.

```gherkin
Given I open the directory's "Entry layout" designer
Then I see the current default block order (logo, heading, address+map, contact details, notes, categorisation tags) as a vertical list of draggable blocks

When I drag "Contact details" above "Address + map" and save
Then entry_templates.layout_json is updated to reflect the new order, with is_default = true

Given I remove the "Notes" block entirely
Then subsequent entry pages omit that section, even though the underlying notes_html data is retained (removing a block from the template does not delete data)
```
*Tech guardrails:* Persist as a single ordered `layout_json` array (§4.4) — no new persistence pattern versus the existing `theme_json`/`mapStyleSettings` jsonb-blob convention. No existing drag-and-drop library is used anywhere in this codebase today — this is genuinely new UI, not a reuse of an existing pattern (call this out rather than imply an existing drag-and-drop component is being extended).

**DIR-E6-S2 — Live preview while designing**
As a **Client Owner/Manager**, I want to see a live preview of a real entry using my in-progress layout, so that I can judge the result before saving.

```gherkin
Given I am mid-edit in the layout designer, having moved "Contact details" up
When I look at the preview pane
Then it renders using a real entry from this directory (or a placeholder if the directory has none yet) reflecting the current unsaved block order
```

**DIR-E6-S3 — Categorisation-driven block**
As a **Client Owner/Manager**, I want to include a specific categorisation's tags as a block on the entry page, so that visitors can see (and click through to) an entry's category memberships.

```gherkin
Given categorisation "Sector" applies_to "entry"
When I add a "Categorisation: Sector" block to the layout
Then published entry pages render that entry's Sector terms as clickable chips linking to the filtered directory index (DIR-E5-S4)

Given I try to add a block for a categorisation with applies_to "directory"
Then it is not offered as an option in the entry-template block palette (directory-level categorisations don't belong on an entry page)
```

**DIR-E6-S4 — Create additional templates targeted to a group or category term**
As a **Client Owner/Manager**, I want more than one entry template, so that different kinds of entries (e.g. a different group or category) can have a different page layout, not just a single one-size-fits-all default.

```gherkin
Given directory "Accredited Suppliers" has a default template
When I create a new template "Healthcare profile" and set it to apply to category term "Healthcare" (from the Sector categorisation)
Then a new entry_templates row is created with applies_to_term_id set to that term's id, is_default = false

Given entry "Bright Solutions Ltd" is tagged with the "Healthcare" term
When its public page is rendered
Then it uses the "Healthcare profile" template's block order, not the directory's default template

Given an entry has no matching group- or term-targeted template
Then it falls back to the directory's single default template (is_default = true)

Given I try to create a second template also targeting the "Healthcare" term
Then I'm warned that only one template can target a given term, and asked to edit the existing one instead (applies_to_term_id has a uniqueness expectation per directory)
```
*Tech guardrails:* Implements the resolution order decided in §4.4 (term match > group match > default). Reuses the same block editor as DIR-E6-S1, just against a different `entry_templates` row — no separate designer UI is needed for non-default templates.

---

### DIR-E7 — Natural-language search + faceted filtering

**DIR-E7-S1 — Natural-language search on the published site**
As an **Anonymous visitor**, I want to type a plain-language query like "healthcare suppliers near Manchester", so that I get relevant entries without having to know the exact filter names.

```gherkin
Given published directory "Accredited Suppliers" has a "Sector" categorisation and entries with city/postcode data
When I type "healthcare suppliers near Manchester" into the search box
Then the query is resolved into a structured predicate (sector = Healthcare AND city ≈ Manchester) and the results shown match that predicate
And the applied structured filters are shown/editable as chips underneath the search box, so the visitor can see and adjust what was inferred

Given my query does not map cleanly to any known categorisation/field (e.g. "best suppliers")
Then the system falls back to a plain keyword/full-text match across name/address/notes rather than returning zero results with no explanation
```
*Tech guardrails:* **Decision (2026-07-14): LLM-backed parser** (§5) — a new Edge Function sends the query plus the directory's categorisation/terms to an LLM and returns a structured predicate. No existing NL-to-structured-query mechanism or LLM integration exists elsewhere in this codebase to extend (§3.5) — this is new integration work, with the `docs/DATA_AND_PRIVACY.md` update it requires as a hard prerequisite before shipping (§5).

**DIR-E7-S2 — Faceted filtering in the portal (admin/client)**
As a **Client Owner/Manager/Member**, I want to filter the entries table by any categorisation or structured field while managing a directory, so that I can find entries to bulk-edit or review.

```gherkin
Given directory "Accredited Suppliers" has categorisations "Sector" and "Region"
When I open the entries table and apply Sector = Healthcare AND Region = North West
Then only matching entries are shown, and the applied filters persist across pagination (page 2 still shows only matching entries)
```
*Tech guardrails:* Server-side filtered query (extends the server-side pagination introduced in DIR-E1-S2), not a client-side re-filter of an already-paginated page.

**DIR-E7-S3 — Faceted filtering on the published site**
As an **Anonymous visitor**, I want to combine multiple category filters on the public directory page, so that I can narrow results precisely without typing a search query.

```gherkin
Given the published directory has Sector and Region categorisations
When I select Sector = Healthcare and Region = North West from the filter controls
Then the entry list shows only entries matching both, and the resulting URL is shareable/bookmarkable and reproduces the same filtered view when revisited directly
```

---

### DIR-E8 — Map association & embedding

**DIR-E8-S1 — Associate one or more maps with a directory**
As a **Client Owner/Manager**, I want to link one or more existing maps to my directory, so that I can show them on the directory's published pages.

```gherkin
Given I open directory "Accredited Suppliers"'s settings and choose "Associate a map"
And I pick an existing map "Supplier Locations"
Then a directory_map_associations row is created with role = 'embedded_on_directory' and sort_order = 0

Given the directory already has "Supplier Locations" associated
When I associate a second map "Regional Offices"
Then a second directory_map_associations row is created (sort_order = 1) — the first association is not replaced; both maps are now available to place on published pages

Given I remove the "Regional Offices" association
Then only that row is deleted; "Supplier Locations" remains associated
```
*Tech guardrails:* **Decision (2026-07-14): multiple associated maps are supported in v1**, not deferred — `directory_map_associations` already models this as many-to-many (§4.7); `sort_order` determines display order when more than one map is placed on the same published page (DIR-E8-S2).

**DIR-E8-S2 — Embed the associated map(s) on published directory pages**
As an **Anonymous visitor**, I want to see the associated map(s) on the directory's public index page, so that I can see entries geographically as well as in the list.

```gherkin
Given directory "Accredited Suppliers" has map "Supplier Locations" associated and both are published
When I visit the directory's public index page
Then the map is embedded using the same iframe-snippet mechanism used for standalone map embeds today (embedSrc/embedIframe convention, §3.4), sized to fit the page layout

Given the directory instead has two associated maps, "Supplier Locations" and "Regional Offices", both published
When I visit the directory's public index page
Then both maps are embedded in `sort_order`, each using the same iframe-snippet mechanism, not merged into one

Given one of the associated maps is not published (no current_publication_id) while the other is
Then only the published map's section renders; the unpublished one is omitted entirely rather than showing a broken/empty embed
```
*Tech guardrails:* Pure reuse of the existing embed generation logic (§3.4) for each associated map — no new embedding mechanism, only a new place it's inserted (the directory's public page template, iterating `directory_map_associations` by `sort_order`) and a per-map guard for its own publish state.

**DIR-E8-S3 — Get an embed snippet for a directory itself**
As a **Client Owner/Manager**, I want to get an iframe embed snippet for my published directory (not just for a map), so that I can place the directory listing itself on an external website.

```gherkin
Given directory "Accredited Suppliers" is published
When I open its Publish settings
Then I see an embed code snippet in the same style as the existing map embed panel (copy button, iframe wrapped in a responsive <style>/<div>), pointing at the directory's public URL
```
*Tech guardrails:* Directly copies the `embedSrc`/`embedIframe` `useMemo` pattern from `AdminMapDashboard.jsx`/`ClientMapDashboard.jsx` (§3.4), retargeted at the directory's public URL instead of a map's.

---

## 9. Decisions log (resolved 2026-07-14)

The following were open questions in the first draft of this spec and have since been resolved directly with the client stakeholder. Each decision is also inlined at its point of use above (§5, §4.4, §4.7, and the relevant stories); this log exists as a single at-a-glance record.

| # | Question | Decision | Where applied |
|---|---|---|---|
| 1 | SSR/SSG approach for DIR-E2 | **Static pre-render at publish time** (reuses the `generate_map_snapshot` → Vercel Blob precedent) | §5, DIR-E2-S5 |
| 2 | Custom domain / TLS provider for DIR-E3 | **Vercel Domains API** — a Vercel project is already linked to this repo | §5, DIR-E3-S3 |
| 3 | Natural-language search resolution for DIR-E7 | **LLM-backed parser** (new Edge Function) — requires a `docs/DATA_AND_PRIVACY.md` update before shipping, per AGENTS.md | §5, DIR-E7-S1 |
| 4 | Single vs. multiple entry templates / associated maps per directory | **Support multiple in v1**, not deferred — `entry_templates` gains `applies_to_group_id`/`applies_to_term_id`; `directory_map_associations` is many-to-many from the start | §4.4, §4.7, DIR-E6-S4, DIR-E8-S1/S2 |
| 5 | Entry-level delete confirmation strength | **Typed confirmation** (same `ConfirmDelete` pattern as directories/categorisations), not a plain `window.confirm()` | DIR-E1-S7 |
| 6 | Sync mode for directory-as-map-datasource | **No sync job at all** — the map consumes the directory's *published* entries live, via a `public_directory_entries` view; `map_data_sources`/`listings` are untouched by this feature | §4.7, DIR-E4-S2/S3 |
| 7 | Shared tab-component extraction in `AdminMapData.jsx`/`ClientMapData.jsx` | **Extract a shared component as part of this work**, not a deferred refactor | §3.1, DIR-E4-S1 |

## 10. Remaining open items (not product decisions — informational)

These are pre-existing conditions in the codebase, unrelated to Directories, noted only because they affect how confidently adjacent parts of this spec (routing, deployment) can be reasoned about. They do not block any epic above and are not proposed as part of this feature's scope.

1. **Stale documentation.** `AGENTS.md`, `docs/README.md`, `docs/FEATURES.md`, and `docs/DEPLOY.md` all still describe `HashRouter`/hash routes, which no longer match the code (`BrowserRouter`, confirmed by `src/Root.jsx` and `src/lib/hashSearchParams.js`). Recommend a small separate doc-correction pass.
2. **GitHub Pages SPA-fallback gap.** No `404.html` SPA-fallback or `CNAME` exists for the current GitHub Pages deployment — a pre-existing risk for any deep-linked `BrowserRouter` route today. Worth the team's separate attention, especially since Directories adds many more public deep-linked routes than exist today (though per the Vercel Domains API decision, §5, published directory traffic is served from the Vercel project, not GitHub Pages — this gap mainly affects the existing app's own deep links, not new Directories routes).

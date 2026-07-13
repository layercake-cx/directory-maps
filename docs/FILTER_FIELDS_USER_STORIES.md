# Configurable filter fields — user stories

**Status:** Draft for implementation planning. **Author:** Product (via Claude, Cowork). **Date:** 2026-07-13.

## 1. Why

Today a map has exactly one categorisation axis: **groups**, a one-to-one relationship (`listings.group_id → groups.id`) that also drives marker colour and the search-panel "Key". Continent filtering exists but is a special case — hardcoded country→continent lookup (`src/lib/continents.js`), a single boolean toggle in `theme_json` (`showContinentFilter`), and bespoke filtering logic inside `PublishedMapView.jsx`. There is no way for a client to add their own metadata (e.g. "Sector", "Membership tier", "Services offered", "Languages spoken") or to choose whether a field is single-select, multi-select, or free text.

APMG's supplier directory is the reference: multiple independent filter axes, some single-pick, some multi-pick, rendered as dropdowns, multi-select lists, and typeaheads in the search panel.

This document breaks that gap into build-ready user stories, grouped into epics. It assumes familiarity with `docs/FEATURES.md`, `docs/INTEGRATION_ARCHITECTURE.md`, and `docs/DATABASE_MIGRATIONS.md` — every migration story here must follow the golden rules in that last document (staging first, paired rollback file, dry run, `docs/DEPLOYMENTS.md` entry).

## 2. Scope & assumptions (confirm with Damian before building)

- **Groups are untouched.** Groups keep driving marker colour/pin theming and remain the map's primary one-to-one category. The new "filter fields" system is additive — a second, client-configurable layer of metadata. A later story could migrate groups into the same framework, but that's out of scope here.
- **Continent filtering is left as-is** for this phase. Story E5 flags it as a candidate to migrate onto the new framework later, so the codebase doesn't end up with two parallel filter mechanisms long-term.
- **Field values live in a new EAV-style join table**, not as dynamic columns on `listings`. This keeps the `listings` schema stable (no per-client `ALTER TABLE`), works for both 1-2-1 and many-to-many out of the box, and matches how `groups` already relates to `listings` via a foreign key rather than inline data.
- **Filter fields are scoped to a single map** (`map_filter_fields.map_id`), matching how `groups` are scoped today. No cross-map/shared taxonomies in this phase.
- **Display control (dropdown / multi-select / typeahead) is a per-field admin choice**, independent of cardinality where sensible (e.g. a single-select field could render as a dropdown or a typeahead; a multi-select field renders as a checkbox list or a multi-pick typeahead).

---

## Epic A — Data model foundation

### A1. Create the filter field schema

**As** the platform, **I need** tables to store per-map filter field definitions, their option lists, and per-listing values, **so that** every other story has a schema to build against.

Acceptance criteria:
- New migration `supabase/migrations/<ts>_create_map_filter_fields.sql` (+ paired `_<ts>_create_map_filter_fields.rollback.sql`) follows the template in `docs/DATABASE_MIGRATIONS.md` exactly (pre-check, dry-run comment block, post-verification, integrity checklist).
- Creates three tables:
  - **`map_filter_fields`** — `id uuid pk default gen_random_uuid()`, `map_id text not null references maps(id) on delete cascade`, `key text not null` (URL/import-safe slug, unique per map), `label text not null`, `field_type text not null check (field_type in ('single_select','multi_select','text'))`, `sort_order integer not null default 0`, `is_active boolean not null default true`, `show_in_filter_bar boolean not null default false`, `display_control text not null default 'dropdown' check (display_control in ('dropdown','multi_select','typeahead'))`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`. Unique index on `(map_id, key)`.
  - **`map_filter_field_options`** — `id uuid pk`, `field_id uuid not null references map_filter_fields(id) on delete cascade`, `value text not null` (stable import key), `label text not null`, `sort_order integer not null default 0`, `color text null`. Unique index on `(field_id, value)`. Only populated for `single_select`/`multi_select` fields.
  - **`listing_filter_values`** — `id uuid pk`, `listing_id text not null references listings(id) on delete cascade`, `field_id uuid not null references map_filter_fields(id) on delete cascade`, `option_id uuid null references map_filter_field_options(id) on delete cascade`, `value_text text null` (used only when `field_type = 'text'`), `created_at timestamptz not null default now()`. Unique index on `(listing_id, field_id, option_id)` (partial, where `option_id is not null`) to stop duplicate tags.
- Indexes: `idx_map_filter_fields_map_id`, `idx_filter_field_options_field_id`, `idx_listing_filter_values_listing_id`, `idx_listing_filter_values_field_id`.
- RLS enabled on all three tables, tenant-scoped the same way as `groups`/`listings` (via the map's `client_id`, reusing `current_user_client_id()`); anon `select` allowed only for maps that are published (mirror the `public_listings` pattern).
- Integrity checklist in `docs/DATABASE_MIGRATIONS.md` §"Integrity verification checklist" is extended with row counts for the three new tables and an orphan check (`listing_filter_values` rows without a valid `listing_id`/`field_id`).
- Migration and rollback files are **output only, not applied** by the agent, per the "Agents" section of `docs/DATABASE_MIGRATIONS.md`. Chat response states the run order explicitly (dry run → staging → verify → production).
- `docs/DEPLOYMENTS.md` gets a new entry describing the change in plain English.

### A2. Extend the public listings view for anon filter reads

**As** the embed map, **I need** to read filter field definitions, options, and listing values for a published map without authentication, **so that** viewers can filter without being logged in.

Acceptance criteria:
- A new anon-safe view or RLS policy set lets the embed read `map_filter_fields`, `map_filter_field_options`, and `listing_filter_values` scoped to `maps.published_at is not null`, matching the existing pattern for `public_listings`.
- No listing PII beyond what's already exposed via `public_listings` is newly exposed.
- Confirmed via a manual smoke test: an anonymous Supabase client (anon key only) can read filter data for a published map and gets zero rows for an unpublished one.

---

## Epic B — Admin: configure filter fields per map

### B1. Filter fields list panel

**As a** map admin (client portal or platform admin), **I want** a new "Filters" panel in the map editor, **so that** I can see and manage all custom filter fields for this map.

Acceptance criteria:
- New panel added alongside the existing `General / Pin Design / Panels / Groups / Map Style / Publish Map / Search` set in `ClientMapDashboard.jsx`, and mirrored in `AdminMapDashboard.jsx` (admin editing a client's map) — follow the existing panel-overlay pattern used by the `Groups` panel.
- Panel lists existing fields (label, type, cardinality badge, option count, active/inactive state), ordered by `sort_order`, with drag-or-arrow reordering (writes `sort_order`).
- Empty state explains what a filter field is, with a "Create your first filter field" CTA.
- Route/nav label: "Filters" (confirm final copy with Damian — keep it short and plain per existing copy discipline).

### B2. Create / edit a filter field

**As a** map admin, **I want** to define a new filter field (label, type, options), **so that** I can capture metadata specific to my directory (e.g. "Sector", "Languages spoken").

Acceptance criteria:
- Create form: **Label** (required, free text), **Key** auto-slugified from label but editable (must stay unique per map; inline validation), **Type** — `single_select` / `multi_select` / `text` radio group with one-line explanations of what each means for viewers.
- For `single_select`/`multi_select`: an options editor (add/remove/reorder rows, each with a label and optional colour swatch — reuse the colour-picker component already used in the `Groups` panel).
- For `text`: no options editor; a note that text fields support free-text filtering (typeahead-only, see D2) but not exact-match dropdown/multi-select.
- Edit form reuses the same UI; changing `field_type` after values exist is blocked with an explanatory message (see B4) rather than silently discarding data.
- Save writes to `map_filter_fields` (+ `map_filter_field_options` rows); client-side validation prevents saving an empty label or a select-type field with zero options.
- New field defaults to `is_active = true`, `show_in_filter_bar = false` (admin opts in via the Search panel, see Epic D) so nothing appears to viewers until explicitly enabled.

### B3. Archive / delete a filter field

**As a** map admin, **I want** to remove a filter field I no longer need, **so that** stale metadata doesn't clutter the editor or the viewer-facing search bar.

Acceptance criteria:
- "Archive" (soft, sets `is_active = false`, hides from filter bar and edit forms, keeps data) is the default action, matching the general "don't destroy data silently" posture in this codebase.
- "Delete permanently" is a separate, confirmed action (type-to-confirm or double confirmation) that cascades to `map_filter_field_options` and `listing_filter_values` for that field — call out clearly in the UI that this removes historical listing values.
- Archived fields are excluded from B1's default list view behind a "Show archived" toggle.

### B4. Manage options on an existing field

**As a** map admin, **I want** to add, rename, reorder, or remove options on a `single_select`/`multi_select` field after creation, **so that** the taxonomy can evolve without recreating the field.

Acceptance criteria:
- Add/rename/reorder options freely.
- Removing an option that is still assigned to at least one listing requires confirmation and explains how many listings will lose that tag (count query against `listing_filter_values`); on confirm, cascades the delete.
- Renaming an option's **label** does not affect stored `listing_filter_values` (option `id` is stable); renaming/changing the underlying `value` (import key) is either disallowed post-creation or triggers a clear warning that it will break CSV/Sheet import matching for that option (see Epic C) — pick one behaviour and document it in `docs/USER_GUIDE.md`.

---

## Epic C — Populate filter values (manual, import, sync)

### C1. Manual value entry on a single listing

**As a** map admin, **I want** to set filter field values while editing a single listing, **so that** I can tag listings by hand without a bulk import.

Acceptance criteria:
- The listing edit form (wherever `ClientMapListings.jsx` opens a single-listing editor) grows a "Filters" section rendering one control per active `map_filter_fields` row for this map: single-select → dropdown, multi-select → multi-pick checklist, text → free-text input.
- Saving writes/replaces the relevant `listing_filter_values` rows for that listing+field (delete-then-insert per field is fine given expected volumes; note the pattern for whoever implements C2/C3 so behaviour stays consistent).
- Works for both the client portal and the admin console listing editors (shared component preferred over duplicated logic).

### C2. Bulk manual tagging from the listings table

**As a** map admin, **I want** to filter/select multiple listings in `ClientMapListings.jsx` and apply a filter-field value to all of them at once, **so that** I don't have to open each listing individually.

Acceptance criteria:
- Listings table gains multi-row selection (checkboxes) and a "Bulk edit filters" action.
- Bulk edit modal lets the admin pick one field and one or more values (respecting the field's cardinality) to **add** or **replace** across the selected listings.
- Action is logged as an admin event (`admin_events`) following the naming/metadata conventions in `AGENTS.md` §"admin event instrumentation" (consistent event names, minimal but useful `meta`).
- Out of scope for this story: bulk-editing multiple fields in one action (defer to a later story if needed).

### C3. CSV import: map columns to filter fields

**As a** map admin, **I want** the CSV importer to recognise columns for my configured filter fields, **so that** I can bring in tagged listings in bulk without hand-editing each one.

Acceptance criteria:
- CSV template download (currently fixed columns per `docs/FEATURES.md` §4.4) is generated per-map: after the standard columns, it appends one column per active `map_filter_fields` row, named `filter_<key>`. Multi-select columns accept a delimited list (pipe `|`, documented in the template header/help text — comma is already used as the CSV delimiter so avoid reusing it).
- Import parser resolves each `filter_<key>` cell against `map_filter_field_options.value` for that field (case-insensitive match); unmatched values are reported as import warnings per-row rather than silently dropped, consistent with existing "Issues detected" messaging described in `docs/GOOGLE_SHEETS_SYNC.md` §8.
- Text-type fields import the raw cell value directly into `listing_filter_values.value_text`.
- Existing `group_name`/core-column import behaviour is unchanged.
- `docs/USER_GUIDE.md` CSV section is updated with the new column convention.

### C4. Google Sheets sync: map columns to filter fields

**As a** map admin, **I want** a connected Google Sheet to sync filter field values the same way it syncs `group_name`, **so that** my live spreadsheet stays the source of truth for tags, not just locations.

Acceptance criteria:
- `validate_sheet_source` edge function is extended to recognise `filter_<key>` headers for the map's active fields and report which are present/missing/unmatched, mirroring its existing column validation (see `docs/INTEGRATION_ARCHITECTURE.md` §4 and `docs/GOOGLE_SHEETS_SYNC.md` §6).
- `sync_sheet_listings` edge function upserts `listing_filter_values` rows the same way it currently handles `group_name` → `group_id` resolution (resolve `filter_<key>` cell values against `map_filter_field_options`, same unmatched-value handling as C3).
- A sync that includes unmatched filter values still succeeds for the rest of the row (warning-level `sync_logs` entry, not a hard failure), consistent with current sync error/warning semantics.
- `docs/GOOGLE_SHEETS_SYNC.md` §6 ("Sheet format") is updated to document the new columns.
- No change to the daily `pg_cron` dispatch mechanism — this only changes what a sync run does with extra columns.

---

## Epic D — Admin: control filter display in the map search bar

### D1. "Show in filter bar" toggle per field

**As a** map admin, **I want** to choose which filter fields actually appear to viewers, **so that** I can configure fields for internal use (tagging/reporting) without exposing them all as filters.

Acceptance criteria:
- Toggle lives on each field in the B1 list (or its edit form) — `show_in_filter_bar` boolean, defaults off per B2.
- Toggling is a discrete, immediately-saved action (not batched into the draft-save flow used by `General`/`Pin Design`, to match how `Groups` behave today) — confirm this against current save-model conventions before building; if the panel already uses draft+publish (like `General`), follow that instead for consistency. **Flag this as an open question for Damian**: should filter-bar visibility be live-immediately or part of the draft/publish cycle like the rest of map design?

### D2. Display control & ordering

**As a** map admin, **I want** to choose how each visible filter field is presented (dropdown, multi-select list, or typeahead) and in what order it appears, **so that** the search bar matches how my members actually search (e.g. a long "Country" list as a typeahead, a short "Membership tier" as a dropdown).

Acceptance criteria:
- Per-field `display_control` selector: `dropdown` (single-select only), `multi_select` (checkbox/chip list, for `single_select` or `multi_select` field types), `typeahead` (available for all field types; for `text` fields this is the only option).
- Invalid combinations are disabled in the UI with a tooltip (e.g. `dropdown` not offered for `multi_select` field type).
- Field order in the search bar follows `sort_order` from B1; reordering there is reflected live in D3's preview.
- A live preview of the search bar (or reuse the existing map-editor live preview already used for `General`/`Pin Design`) shows the filter bar as viewers will see it, so the admin isn't guessing.

### D3. Extend the Search panel's "Display options"

**As a** map admin, **I want** the existing Search panel (`ClientMapDashboard.jsx` "Search" tab, currently offering the continent-filter and Key toggles) to also surface the new filter fields, **so that** all search-bar configuration lives in one place.

Acceptance criteria:
- New "Filter fields" subsection added to the Search panel, listing active fields with their D1/D2 controls inline (avoids forcing admins to jump between the Filters panel and the Search panel to configure the same thing) — or, alternatively, keep configuration solely in the Filters panel (B1–B4) and have the Search panel just link there. **Decide one home for this configuration and be consistent** — duplicating controls in two panels is worse than picking one. Recommendation: keep field definition (B) and display config (D) in the same "Filters" panel, and have the Search panel show a read-only summary + link, to avoid the two-panel duplication problem the continent toggle already has (it's Search-panel-only, filter fields would otherwise be split across two).
- `docs/FEATURES.md` §4.3 (map design & publish panel table) is updated to describe the new Filters panel and its relationship to Search.

---

## Epic E — Viewer: filter the map with the configured controls

### E1. Render filter controls in the embed search panel

**As a** map viewer, **I want** to see filter controls for the fields the admin has enabled, **so that** I can narrow down listings by the metadata that matters to me.

Acceptance criteria:
- `PublishedMapView.jsx` (shared by embed + admin/client live preview) fetches active, `show_in_filter_bar = true` fields (+ options) for the map alongside existing `groups`/`listings` data.
- Renders one control per field per its `display_control`: dropdown (native `<select>` or existing Mantine equivalent already in use — see `@mantine/core` in `docs/INTEGRATION_ARCHITECTURE.md` §6), multi-select (checkbox/chip list matching the existing group-lozenge visual language), typeahead (type-to-filter input, works for `text` fields and large option lists).
- Controls render below/alongside the existing group lozenges and continent chips, in `sort_order`, visually consistent with `embed-list-panel__filter` styling already in `style.css`.
- No fields configured for a map → no visual change from today's search panel (backward compatible for all existing published maps).

### E2. Filtering logic

**As a** map viewer, **I want** selecting filter values to narrow both the map markers and the listings list, **so that** filtering behaves the same way group/continent filtering already does.

Acceptance criteria:
- New `active*` state (mirroring `activeGroupIds`/`activeContinents`) tracks selected values per field — e.g. a `Map<fieldId, Set<optionId>>` for select fields, `Map<fieldId, string>` for text/typeahead.
- Filtering combines with **AND** logic across different fields and with the existing group/continent/search-text filters (a listing must match every active filter to show), and **OR** logic within a multi-select field's chosen values (matching how group lozenges already behave) — confirm this matches Damian's expectation before building, since APMG-style directories sometimes want AND-within-field for multi-select (e.g. "must offer both Service A and Service B"). **Flag as an open question.**
- Listings with no value set for an active filter field are excluded when that field has an active selection (same "empty = show everything, selected = narrow" behaviour as groups today).
- Clearing a filter (deselect all values) returns to showing everything for that field, same as today's group/continent toggles.

### E3. Engagement tracking for filter usage

**As a** product owner, **I want** filter-field interactions logged the same way group/continent filtering is, **so that** I can see which custom filters clients' visitors actually use.

Acceptance criteria:
- New engagement event type(s) recorded via the existing `recordEngagement` call used for `directory_group_filter`/`directory_continent_filter` (see `PublishedMapView.jsx` `toggleGroupFilter`/`toggleContinent`) — e.g. `directory_custom_filter` with `meta: { field_id, field_key, option_id | value_text }`.
- Follows the anonymous, insert-only, best-effort (non-blocking `console.warn` on failure) pattern already documented in `docs/MAP_ENGAGEMENT.md`.
- No new PII exposure — field/option ids only, no free text from `text`-type filters logged verbatim if that's considered sensitive (**confirm with Damian**; may want to log "used text filter on field X" without the query itself).

### E4. Mobile / responsive behaviour

**As a** map viewer on a small screen, **I want** the new filter controls to behave like the existing mobile sheet (`isMobileSheet` in `PublishedMapView.jsx`), **so that** the search panel doesn't become unusable on phones.

Acceptance criteria:
- Filter controls collapse into the same mobile bottom-sheet pattern already used for groups/key.
- Typeahead controls are usable with an on-screen keyboard (correct input type, no layout shift on focus).
- Manual test pass on a narrow viewport (or existing responsive test approach for this repo) before merge.

### E5. (Stretch, separate story) Migrate continent filtering onto the new framework

**As** the platform, **I want** continent filtering to eventually be "just another filter field" (a built-in `single_select` field seeded per map, values derived from `continentForCountry`), **so that** there's one filtering mechanism in the codebase instead of two.

Not required to ship Epics A–E. Flagged here so it's not forgotten and doesn't get built as a third parallel pattern later. Needs its own design pass (continent is derived from `listings.country`, not manually tagged — doesn't fit the manual/import population model in Epic C as-is).

---

## Epic F — Documentation & rollout

### F1. Update product documentation

**As** the team, **I need** the standard docs kept current, **so that** onboarding and support don't drift from reality (per `AGENTS.md`'s documentation rules).

Acceptance criteria:
- `docs/FEATURES.md`: new row(s) in the client portal table for the Filters panel (§4.3), new row in Public embed table (§5) for filter controls, new entries in §7.1 (`map_filter_fields`, `map_filter_field_options`, `listing_filter_values`) and, if D applies, no new RPC/edge functions unless C4 introduces one.
- `docs/USER_GUIDE.md`: new section explaining how to create filter fields, tag listings (manual/CSV/Sheets), and configure the search bar — written in the existing plain, short, client-facing style.
- `docs/DATA_AND_PRIVACY.md`: reviewed for whether custom filter metadata changes the data inventory (likely yes — new listing-linked data categories).
- `docs/DEPLOYMENTS.md`: one entry per shipped migration/feature slice, per the existing format.

### F2. Beta/founding-partner communication

**As** the business, **I want** to know when this is safe to mention to prospects (e.g. in an APMG-style pitch), **so that** sales doesn't oversell a feature still in progress — consistent with the "API honesty" principle already applied to Maps copy.

Acceptance criteria:
- Feature is marked accurately in `docs/FEATURES.md` §10 (maturity matrix) at each stage (Not started → In progress → Production-ready) rather than assumed done once code merges.
- No public-facing copy references "custom filters" / "configurable metadata" until at least Epics A–D are production-ready on the founding-partner's map(s).

---

## 3. Suggested build order

1. **A1, A2** — schema must exist before anything else.
2. **B1–B4** — admin needs to create fields before there's anything to populate or display.
3. **C1** (manual single-listing) — fastest way to get real data in and validate the model end-to-end.
4. **D1, D2, D3** — configure display before building viewer-facing rendering against real toggles.
5. **E1, E2** — viewer rendering + filtering logic.
6. **C2, C3, C4** — bulk/import population can land in parallel with or after E, since C1 already proves the data model.
7. **E3, E4** — analytics and mobile polish.
8. **F1, F2** — documentation, throughout, not saved for the end (each earlier story that changes user-facing behaviour should update docs in the same PR per `AGENTS.md`).
9. **E5** — deferred, revisit once A–E are stable.

## 4. Open questions to confirm with Damian before/while building

1. Is filter-bar visibility (D1) a live-immediately toggle, or part of the existing draft/publish cycle used by the rest of map design?
2. Where does display configuration (D2/D3) live — inside the Filters panel, or duplicated/linked from the Search panel?
3. Within a multi-select filter field, should selecting multiple values be OR (any match) or AND (must have all)? Groups/continents today are OR.
4. Should raw typeahead query text ever be logged in engagement events, or only "filter used" with no value?
5. Should changing an option's import `value` after creation be blocked outright, or allowed with a warning that it breaks existing CSV/Sheet column matching?

# Engagement analytics (maps and directories)

Captures how visitors interact with **published embed maps** and **published directory sites**. Events share one table, `map_engagement_events`. The **client portal** exposes map dashboards at `/client/maps/<mapId>/stats` (map overview) and `.../stats/listings/<listingId>` (per listing). Directory in-app reporting is not built yet; rows are stored so it can be added later.

## Overview

When someone loads an embed (`/embed?map=<MAP_ID>`), the app records anonymous engagement events: opening listings, clicking website/email links, using search, and sending contact messages. When someone loads a published directory page, a small first-party script records directory views, search, filters, listing views, and outbound clicks on the **same table**. Each event is a row with a common schema plus optional JSON in `meta`.

**Scope today**

- **Maps recorded:** public embed (`EmbedMap` → `PublishedMapView`), `surface: embed`
- **Directories recorded:** generated public HTML (`generate_directory_site`), `surface: directory_site`
- **Not recorded:** client/admin map previews (`client_preview` / `admin_preview` reserved)
- Directory-sourced map embeds also stamp `directory_id` on map events so directory reporting can join pin clicks without a second store

**Requirements for inserts**

- A **published map** (`maps.published_at`) when `map_id` is set; a **published directory** when `directory_id` is set. At least one of those ids is required.
- The public surfaces use the Supabase **anon** key; RLS allows append-only inserts only.

External GA4/GTM on directory pages is optional (`directories.analytics_json`) and only loads after the visitor accepts analytics cookies. First-party rows do not wait on that consent (same privacy model as map embeds: no IP, no account, session id only).

## Where data is stored

| Layer | Location |
|-------|----------|
| Database | Supabase Postgres table `public.map_engagement_events` |
| Migrations | `20260514120000_map_engagement_events.sql` (create), later CHECK expansions, `20260920090000_directory_engagement_analytics.sql` (directory_id, nullable map_id, directory event types) |
| Client recorder | `src/lib/mapEngagement.js` (`createEngagementRecorder`) |
| Map instrumentation | `src/pages/EmbedMap.jsx`, `src/components/PublishedMapView.jsx` |
| Directory instrumentation | `supabase/functions/generate_directory_site/builders.ts` (inline script + consent banner) |
| Directory destinations UI | `src/components/directories/DirectoryAnalyticsPanel.jsx` |

Rows are **not** kept in the browser beyond a session identifier (`client_session_id` in `sessionStorage`) used to group events from the same visit. Directory HTML and the map iframe do **not** share sessionStorage (different origins/contexts).

## Row schema

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` | Primary key |
| `occurred_at` | `timestamptz` | When the event happened (default `now()`) |
| `map_id` | `text` (nullable) | Map FK when the event is map-scoped |
| `directory_id` | `text` (nullable) | Directory FK when the event is directory-scoped (or a directory-sourced embed) |
| `listing_id` | `text` (nullable) | Subject id: `listings.id` **or** `directory_entries.id` (no single FK; RLS checks membership) |
| `event_type` | `text` | See [Event types](#event-types) |
| `surface` | `text` | `embed` (default), `directory_site`, or `client_preview` / `admin_preview` for future use |
| `client_session_id` | `text` (nullable) | Stable id per browser tab session |
| `meta` | `jsonb` (nullable) | Event-specific payload (see below) |

CHECK: `map_id` or `directory_id` (or both) must be set.

### `meta` column

`meta` is a **structured JSON blob** whose fields depend on `event_type`. There is no per-event database table; new fields can be added in application code without a migration (as long as `event_type` remains in the allowed list).

Examples:

```json
// search — submit
{ "query": "dentist london", "action": "submit", "result": "listing", "listing_id": "abc123" }

// listing_panel_open
{ "source": "marker" }

// directory_group_expand
{ "group_id": "uuid-here" }
```

Search queries are capped at **500 characters** in the client before insert.

## Event types

Map embed names are **unchanged** (map Stats dashboards depend on them). Directory HTML uses the directory catalogue. The same row can carry both `map_id` and `directory_id`.

### Map embed (`surface: embed`)

| `event_type` | When it fires | `listing_id` | Typical `meta` |
|--------------|---------------|--------------|----------------|
| `session_start` | Embed loads with a valid published config | — | — |
| `directory_group_expand` | (legacy; no longer emitted) | — | `group_id` |
| `listing_panel_open` | Listing detail panel opens; pin click uses `source: "marker"` (directory `map_marker_click` equivalent) | set | `source`: `marker`, `list_panel`, or `search` |
| `website_click` | “Visit website” clicked | set | — |
| `email_click` | Listing email `mailto:` clicked | set | — |
| `message_compose_open` | “Send message” opened on listing card | set | — |
| `message_sent` | Contact form submitted successfully | set | — |
| `search` | Search used (see [Search events](#search-events)) | — | `query`, `action`, plus action-specific fields |
| `directory_group_filter` / `directory_continent_filter` / `directory_custom_filter` | Filter toggles on the embed | — | group / continent / field ids |

### Directory site (`surface: directory_site`)

| `event_type` | When it fires | `listing_id` | Typical `meta` |
|--------------|---------------|--------------|----------------|
| `directory_view` | Any public HTML document loads (landing or content page) | — | `path` |
| `listing_view` | Entry page loads | set | `path`, `listing_name` |
| `directory_search` | Search used (debounced / submit, query ≥2 chars) | — | `query` (max 500) |
| `directory_filter` | Facet selection changes after first apply | — | `filter` |
| `listing_website_click` | Entry “Visit website” | set | `cta_type` |
| `listing_contact_click` | Entry `mailto:` | set | `cta_type` |
| `listing_cta_click` | Primary website, prominent-link tile, or “Show on map” | set | `cta_type` |

Reserved (CHECK only; not emitted until those products exist): `listing_claim_start`, `listing_claim_complete`, `listing_upgrade_start`, `listing_upgrade_complete`, `map_marker_click`.

### Search events

All `search` rows include `meta.query`. `meta.action` describes how the search was used:

| `meta.action` | When |
|---------------|------|
| `query` | User pauses typing for 600ms with ≥2 characters (logged once per distinct query per session) |
| `submit` | Enter pressed; includes `result`: `place`, `listing`, or `none`, and `place_address` / `listing_id` when relevant |
| `select_place` | User picks a place from suggestions |
| `select_listing` | User picks a listing from suggestions |

For `query`, `meta` may also include `listing_count` and `place_count` at log time.

## Access control (RLS)

- **Anonymous (`anon`):** `INSERT` only. The referenced map (if any) must be published; the referenced directory (if any) must be published. If `listing_id` is set it must belong to that map’s `listings`, that directory’s `directory_entries`, or the directory attached to the map via `directory_map_associations` (directory-sourced pins).
- **Authenticated:** `SELECT` for admins (`is_admin()`) or client contacts who can access that map (owner/manager, or `contact_map_permissions`) **or** that directory (owner/manager, or `contact_directory_permissions`).
- **No client `INSERT` for authenticated users** — public traffic uses anon inserts.

## Code flow

**Maps**

1. `EmbedMap` creates a recorder: `createMapEngagementRecorder({ supabase, mapId, directoryId?, surface: "embed" })`.
2. On successful load of a published map, it records `session_start`.
3. The recorder is passed to `PublishedMapView` as `recordEngagement`.
4. UI handlers call `recordEngagement(eventType, { listingId, meta })`.
5. `mapEngagement.js` inserts into `map_engagement_events` fire-and-forget; failures log a console warning only.

**Directories**

1. `generate_directory_site` bakes `directories.analytics_json` plus a first-party recorder into every HTML page.
2. On load the page inserts `directory_view` or `listing_view`.
3. Search/filter scripts call `window.dmRecordEngagement`.
4. If GA4/GTM IDs are enabled, a cookie banner + Google Consent Mode run; tags load only after Accept. The same event names are then pushed to `dataLayer` / `gtag`.

List picks from the directory panel use `meta.source: "list_panel"`; map pin clicks use `"marker"`; search uses `"search"`. A ref suppresses duplicate `listing_panel_open` events when centering the map after a list selection.

## Setup

Apply migrations to **each** Supabase project your app uses (production, staging/test, etc.). The table must exist on the project pointed to by `VITE_SUPABASE_URL` in `.env.local`.

**Option A — Supabase CLI** (link the correct project first):

```bash
supabase link --project-ref YOUR_STAGING_PROJECT_REF
supabase db push
```

**Option B — SQL Editor** (staging or when CLI history is out of sync):

1. Open the **staging** project in [Supabase Dashboard](https://supabase.com/dashboard).
2. SQL Editor → New query.
3. Paste and run [`scripts/apply-map-engagement-events.sql`](../scripts/apply-map-engagement-events.sql).

If you still see “Could not find the table … in the schema cache”, wait a minute or run `notify pgrst, 'reload schema';` again, then hard-refresh the app.

Ensure the embed app has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` configured (same as the rest of the app).

## Querying data

Example: recent events for one map

```sql
select
  occurred_at,
  event_type,
  listing_id,
  client_session_id,
  meta
from map_engagement_events
where map_id = '<MAP_ID>'
order by occurred_at desc
limit 200;
```

Example: search terms used

```sql
select
  occurred_at,
  meta->>'query' as query,
  meta->>'action' as action,
  meta->>'result' as result
from map_engagement_events
where map_id = '<MAP_ID>'
  and event_type = 'search'
order by occurred_at desc;
```

Example: sessions per day

```sql
select
  date_trunc('day', occurred_at) as day,
  count(distinct client_session_id) as sessions,
  count(*) as events
from map_engagement_events
where map_id = '<MAP_ID>'
group by 1
order by 1 desc;
```

Authenticated users with map access can read via the Supabase client:

```js
const { data, error } = await supabase
  .from("map_engagement_events")
  .select("occurred_at, event_type, listing_id, meta, client_session_id")
  .eq("map_id", mapId)
  .order("occurred_at", { ascending: false })
  .limit(500);
```

## Privacy and behaviour notes

- Events are **anonymous** at the database level (no user accounts on the public surfaces).
- **Search text** is stored in `meta.query` for analytics; treat this as potentially sensitive in exports and UI.
- Recording is **best-effort** (failed inserts do not block the UI).
- Client/admin previews do not record events today, avoiding noise from editors testing maps.
- Directory GA4/GTM scripts are **not** loaded until analytics consent; first-party inserts still run.
- No IP address is stored.

## Client portal dashboards

| Route | Component | Contents |
|-------|-----------|----------|
| `/client/maps/:mapId/stats` | `MapStats.jsx` | Date range, metric cards, daily events chart, funnel, search terms table, listing picker |
| `/client/maps/:mapId/stats/listings/:listingId` | `ListingStats.jsx` | Per-listing engagement breakdown |

Hooks and charts: `src/hooks/useListingEngagement.js`, `src/components/engagement/*`.

| `/admin/clients/:clientId/maps/:mapId/stats` | `AdminMapStats` → shared `MapStats` |
| `/admin/clients/:clientId/maps/:mapId/stats/listings/:listingId` | `AdminListingStats` → shared `ListingStats` |

Admin map routes include the same **Stats** tab and dashboards as the client portal (admins read engagement via `is_admin()` RLS).

## Future work

- Optional `client_preview` / `admin_preview` recording with a flag.
- In-app directory and listing-owner analytics dashboards (store is ready).
- Aggregations (materialized views or scheduled rollups) if event volume grows.
- CSV export of engagement data from the portal.

## Related files

| File | Role |
|------|------|
| `src/lib/mapEngagement.js` | Session id + Supabase insert helper |
| `src/pages/EmbedMap.jsx` | Recorder setup, `session_start`, `message_sent`, directory_id stamp |
| `src/components/PublishedMapView.jsx` | UI event hooks (panel, links, search, groups) |
| `src/components/directories/DirectoryAnalyticsPanel.jsx` | GA4/GTM destination settings |
| `supabase/functions/generate_directory_site/builders.ts` | Consent banner, first-party + GA/GTM adapters |
| `supabase/migrations/20260514120000_map_engagement_events.sql` | Table + original RLS |
| `supabase/migrations/20260920090000_directory_engagement_analytics.sql` | Directory columns, event types, RLS |

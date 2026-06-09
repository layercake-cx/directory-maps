# Map engagement analytics

Captures how visitors interact with **published embed maps** (public map views). Events are stored in Supabase for reporting. The **client portal** exposes dashboards at `/#/client/maps/<mapId>/stats` (map overview) and `.../stats/listings/<listingId>` (per listing). This document describes what is recorded and how it works.

## Overview

When someone loads an embed (`/#/embed?map=<MAP_ID>`), the app records anonymous engagement events: opening listings, expanding directory groups, clicking website/email links, using search, and sending contact messages. Each event is a row in `map_engagement_events` with a common schema plus optional JSON in `meta` for event-specific details.

**Scope today**

- **Recorded:** public embed (`EmbedMap` → `PublishedMapView`)
- **Not recorded:** client/admin map previews in the dashboard (the `surface` column supports `client_preview` / `admin_preview` for future use)

**Requirements for inserts**

- The map must be **published** (`maps.published_at` is set). Unpublished embeds show a message and do not record events.
- The embed uses the Supabase **anon** key; RLS allows append-only inserts for published maps only.

## Where data is stored

| Layer | Location |
|-------|----------|
| Database | Supabase Postgres table `public.map_engagement_events` |
| Migrations | `supabase/migrations/20260514120000_map_engagement_events.sql`, `supabase/migrations/20260515120000_map_engagement_search_event.sql` |
| Client recorder | `src/lib/mapEngagement.js` |
| Instrumentation | `src/pages/EmbedMap.jsx`, `src/components/PublishedMapView.jsx` |

Rows are **not** kept in the browser beyond a session identifier (`client_session_id` in `sessionStorage`) used to group events from the same visit.

## Row schema

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` | Primary key |
| `occurred_at` | `timestamptz` | When the event happened (default `now()`) |
| `map_id` | `text` | Map FK |
| `listing_id` | `text` (nullable) | Listing FK when the action relates to a listing |
| `event_type` | `text` | See [Event types](#event-types) |
| `surface` | `text` | `embed` (default), or `client_preview` / `admin_preview` for future use |
| `client_session_id` | `text` (nullable) | Stable id per browser tab session |
| `meta` | `jsonb` (nullable) | Event-specific payload (see below) |

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

| `event_type` | When it fires | `listing_id` | Typical `meta` |
|--------------|---------------|--------------|----------------|
| `session_start` | Embed loads with a valid published config | — | — |
| `directory_group_expand` | User expands a group in the side panel | — | `group_id` (`"ungrouped"` for ungrouped) |
| `listing_panel_open` | Listing detail panel opens | set | `source`: `marker`, `list_panel`, or `search` |
| `website_click` | “Visit website” clicked | set | — |
| `email_click` | Listing email `mailto:` clicked | set | — |
| `message_compose_open` | “Send message” opened on listing card | set | — |
| `message_sent` | Contact form submitted successfully | set | — |
| `search` | Search used (see [Search events](#search-events)) | — | `query`, `action`, plus action-specific fields |

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

- **Anonymous (`anon`):** `INSERT` only, and only if the map is published and any `listing_id` belongs to that map.
- **Authenticated:** `SELECT` for admins (`profiles.role = 'admin'`) or client contacts who can access that map (owner/manager for the org, or explicit `contact_map_permissions` for members).
- **No client `INSERT` for authenticated users** — embed traffic uses anon inserts.

## Code flow

1. `EmbedMap` creates a recorder: `createMapEngagementRecorder({ supabase, mapId, surface: "embed" })`.
2. On successful load of a published map, it records `session_start`.
3. The recorder is passed to `PublishedMapView` as `recordEngagement`.
4. UI handlers call `recordEngagement(eventType, { listingId, meta })` or `recordSearchEngagement(...)` (search wrapper).
5. `mapEngagement.js` inserts into `map_engagement_events` fire-and-forget; failures log a console warning only.

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

- Events are **anonymous** at the database level (no user accounts on the embed).
- **Search text** is stored in `meta.query` for analytics; treat this as potentially sensitive in exports and UI.
- Recording is **best-effort** (failed inserts do not block the UI).
- Client/admin previews do not record events today, avoiding noise from editors testing maps.

## Client portal dashboards

| Route | Component | Contents |
|-------|-----------|----------|
| `/#/client/maps/:mapId/stats` | `MapStats.jsx` | Date range, metric cards, daily events chart, funnel, search terms table, listing picker |
| `/#/client/maps/:mapId/stats/listings/:listingId` | `ListingStats.jsx` | Per-listing engagement breakdown |

Hooks and charts: `src/hooks/useListingEngagement.js`, `src/components/engagement/*`.

| `/#/admin/clients/:clientId/maps/:mapId/stats` | `AdminMapStats` → shared `MapStats` |
| `/#/admin/clients/:clientId/maps/:mapId/stats/listings/:listingId` | `AdminListingStats` → shared `ListingStats` |

Admin map routes include the same **Stats** tab and dashboards as the client portal (admins read engagement via `is_admin()` RLS).

## Future work

- Optional `client_preview` / `admin_preview` recording with a flag.
- Aggregations (materialized views or scheduled rollups) if event volume grows.
- CSV export of engagement data from the portal.

## Related files

| File | Role |
|------|------|
| `src/lib/mapEngagement.js` | Session id + Supabase insert helper |
| `src/pages/EmbedMap.jsx` | Recorder setup, `session_start`, `message_sent` |
| `src/components/PublishedMapView.jsx` | UI event hooks (panel, links, search, groups) |
| `supabase/migrations/20260514120000_map_engagement_events.sql` | Table + RLS |
| `supabase/migrations/20260515120000_map_engagement_search_event.sql` | Adds `search` to event type constraint |

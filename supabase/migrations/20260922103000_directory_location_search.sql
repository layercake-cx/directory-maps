-- ============================================================
-- Migration: 20260922103000_directory_location_search
-- Description: Opt-in location search for a published directory.
--              directories.location_search_enabled (default false) is the
--              Settings-tab switch. When on, the next publish adds a
--              Distance from filter. place_geocode_cache stores resolved
--              place names so Google Geocoding is called once per place.
--              directory_place_resolve_requests rate-limits those Google
--              calls. directory_distance_filter is added to the visitor
--              engagement event check.
-- Affected tables: directories (1 new column); new tables
--                  place_geocode_cache, directory_place_resolve_requests;
--                  map_engagement_events (check constraint only)
-- Rollback: _20260922103000_directory_location_search.rollback.sql
-- Author: Cursor Grok
-- Date: 2026-09-22
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- RUN ORDER: dry-run (BEGIN/ROLLBACK) -> apply on STAGING (beqejxneehilplrtpntn)
-- -> run POST-MIGRATION VERIFICATION -> only then apply on PRODUCTION
-- (gxixwdjfmegxcxfeflro) after explicit sign-off.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directories') then
    raise exception 'ABORT: table public.directories does not exist';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directories' and column_name = 'location_search_enabled'
  ) then
    raise exception 'ABORT: directories.location_search_enabled already exists — migration may have already run';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'place_geocode_cache') then
    raise exception 'ABORT: public.place_geocode_cache already exists — migration may have already run';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_place_resolve_requests') then
    raise exception 'ABORT: public.directory_place_resolve_requests already exists — migration may have already run';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'map_engagement_event_type'
      and conrelid = 'public.map_engagement_events'::regclass
  ) then
    raise exception 'ABORT: map_engagement_event_type constraint is missing';
  end if;
end $$;

select
  'directories' as tbl, count(*) as rows from public.directories
union all
  select 'map_engagement_events', count(*) from public.map_engagement_events
order by tbl;
-- Save this output. Both counts must be UNCHANGED after (additive only).


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

alter table public.directories
  add column location_search_enabled boolean not null default false;

comment on column public.directories.location_search_enabled is
  'Per-directory opt-in (default false) for location search on the published homepage. When true, the next generate_directory_site publish adds a Distance from filter and may call resolve_directory_place. Keyword search is unchanged while this is false.';

-- Resolved place names. Shared across directories. Service role only.
create table public.place_geocode_cache (
  cache_key    text primary key,
  label        text not null,
  lat          double precision not null,
  lng          double precision not null,
  created_at   timestamptz not null default now()
);

comment on table public.place_geocode_cache is
  'One row per normalised place name (plus country bias) successfully resolved by resolve_directory_place. Avoids repeat Google Geocoding calls. No visitor coordinates. Service-role only.';

-- One row per real Google Geocoding call (cache misses only), for rate limiting.
create table public.directory_place_resolve_requests (
  id           uuid primary key default gen_random_uuid(),
  directory_id text not null references public.directories(id) on delete cascade,
  occurred_at  timestamptz not null default now()
);

create index idx_directory_place_resolve_requests_directory_time
  on public.directory_place_resolve_requests(directory_id, occurred_at);

comment on table public.directory_place_resolve_requests is
  'One row per Google Geocoding call made by resolve_directory_place (not cache hits). Used solely to rate-limit that public function per directory. Not an analytics table.';

alter table public.place_geocode_cache enable row level security;
alter table public.directory_place_resolve_requests enable row level security;
-- No policies: both tables are read and written only by resolve_directory_place
-- via the service-role client, which bypasses RLS.

grant select, insert on table public.place_geocode_cache to service_role;
grant select, insert on table public.directory_place_resolve_requests to service_role;

-- Superset of 20260922093000_directory_enquiry.sql, plus directory_distance_filter.
-- Existing rows stay valid because nothing is removed.
alter table public.map_engagement_events drop constraint if exists map_engagement_event_type;

alter table public.map_engagement_events add constraint map_engagement_event_type check (
  event_type in (
    'session_start',
    'directory_group_expand',
    'directory_group_filter',
    'directory_continent_filter',
    'directory_custom_filter',
    'listing_panel_open',
    'website_click',
    'email_click',
    'message_compose_open',
    'message_sent',
    'search',
    'directory_view',
    'directory_search',
    'directory_filter',
    'listing_view',
    'map_marker_click',
    'listing_website_click',
    'listing_contact_click',
    'listing_cta_click',
    'listing_claim_start',
    'listing_claim_complete',
    'listing_upgrade_start',
    'listing_upgrade_complete',
    'listing_enquiry_open',
    'listing_enquiry_sent',
    'directory_distance_filter'
  )
);


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'directories'
      and column_name = 'location_search_enabled'
      and data_type = 'boolean'
      and is_nullable = 'NO'
  ) then
    raise exception 'VERIFY FAILED: directories.location_search_enabled was not created as boolean not null';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'place_geocode_cache') then
    raise exception 'VERIFY FAILED: place_geocode_cache was not created';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_place_resolve_requests') then
    raise exception 'VERIFY FAILED: directory_place_resolve_requests was not created';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'map_engagement_event_type'
      and conrelid = 'public.map_engagement_events'::regclass
      and pg_get_constraintdef(oid) like '%directory_distance_filter%'
  ) then
    raise exception 'VERIFY FAILED: directory_distance_filter is missing from map_engagement_event_type';
  end if;
  if exists (select 1 from public.directories where location_search_enabled = true) then
    raise exception 'VERIFY FAILED: a directory has location search on immediately after migration';
  end if;
  raise notice 'VERIFY PASSED: directory location search schema created';
end $$;

select
  'directories' as tbl, count(*) as rows from public.directories
union all
  select 'map_engagement_events', count(*) from public.map_engagement_events
order by tbl;

select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('place_geocode_cache', 'directory_place_resolve_requests');
-- Both must show rowsecurity = true

select count(*) as orphaned_place_requests
  from public.directory_place_resolve_requests r
  where not exists (select 1 from public.directories d where d.id = r.directory_id);
-- Expected 0

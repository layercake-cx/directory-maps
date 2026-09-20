-- ============================================================
-- Migration: 20260920090000_directory_engagement_analytics
-- Description: Extend map_engagement_events (the existing engagement store)
--              so public directory sites can record first-party events on
--              the same table as map embeds. Adds directories.analytics_json
--              for per-directory GA4/GTM destinations. Relaxes listing_id
--              so directory-sourced map pins (directory entry ids) can insert.
-- Affected tables: map_engagement_events, directories
-- Rollback: _20260920090000_directory_engagement_analytics.rollback.sql
-- Author: Cursor Grok
-- Date: 2026-09-20
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste THE MIGRATION body below here>
--   ROLLBACK;
--
-- RUN ORDER: dry-run (BEGIN/ROLLBACK) -> apply on STAGING (beqejxneehilplrtpntn)
-- -> run POST-MIGRATION VERIFICATION -> only then apply on PRODUCTION
-- (gxixwdjfmegxcxfeflro) after explicit sign-off.
--
-- Forbidden operations: none (additive columns; drop listing_id FK only —
-- column remains). Restoring the FK is in the rollback.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'map_engagement_events'
  ) then
    raise exception 'ABORT: table public.map_engagement_events does not exist';
  end if;
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'directories'
  ) then
    raise exception 'ABORT: table public.directories does not exist';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'map_engagement_events' and column_name = 'directory_id'
  ) then
    raise exception 'ABORT: map_engagement_events.directory_id already exists — migration may have already run';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directories' and column_name = 'analytics_json'
  ) then
    raise exception 'ABORT: directories.analytics_json already exists — migration may have already run';
  end if;
end $$;

select 'map_engagement_events' as tbl, count(*) as rows from public.map_engagement_events
union all
select 'directories', count(*) from public.directories
order by tbl;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- 1) directories.analytics_json — provider-agnostic destinations list
alter table public.directories
  add column analytics_json jsonb null;

alter table public.directories
  add constraint directories_analytics_json_object check (
    analytics_json is null
    or (
      jsonb_typeof(analytics_json) = 'object'
      and (
        analytics_json->'destinations' is null
        or jsonb_typeof(analytics_json->'destinations') = 'array'
      )
    )
  );

comment on column public.directories.analytics_json is
  'Per-directory tracking destinations, e.g. {"destinations":[{"provider":"ga4","enabled":true,"measurement_id":"G-XXXXXXXXXX"},{"provider":"gtm","enabled":true,"container_id":"GTM-XXXXXXX"}]}. Takes effect on next site generate.';

-- 2) map_engagement_events: directory_id + nullable map_id
alter table public.map_engagement_events
  alter column map_id drop not null;

alter table public.map_engagement_events
  add column directory_id text null references public.directories(id) on delete cascade;

alter table public.map_engagement_events
  add constraint map_engagement_map_or_directory check (
    map_id is not null or directory_id is not null
  );

create index idx_map_engagement_directory_time
  on public.map_engagement_events(directory_id, occurred_at desc)
  where directory_id is not null;

-- listing_id is the subject (map listing OR directory entry). Directory-sourced
-- embeds already send directory_entries.id here; the listings FK rejected those.
alter table public.map_engagement_events
  drop constraint if exists map_engagement_events_listing_id_fkey;

comment on table public.map_engagement_events is
  'Public engagement for published maps and directories. map_id and/or directory_id; listing_id is a map listing or directory entry id. Anon insert only.';

comment on column public.map_engagement_events.directory_id is
  'Directory this event belongs to (published directory site, or a directory-sourced map embed).';

comment on column public.map_engagement_events.listing_id is
  'Subject id: public.listings.id for map-authored pins, or public.directory_entries.id for directory entries / directory-sourced pins. Validated by RLS, not a single FK.';

-- 3) Event types + surface
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
    'listing_upgrade_complete'
  )
);

alter table public.map_engagement_events drop constraint if exists map_engagement_surface;

alter table public.map_engagement_events add constraint map_engagement_surface check (
  surface in ('embed', 'client_preview', 'admin_preview', 'directory_site')
);

-- 4) RLS
drop policy if exists "map_engagement_anon_insert" on public.map_engagement_events;
create policy "map_engagement_anon_insert"
  on public.map_engagement_events for insert
  to anon
  with check (
    (map_engagement_events.map_id is not null or map_engagement_events.directory_id is not null)
    and (
      map_engagement_events.map_id is null
      or exists (
        select 1 from public.maps m
        where m.id = map_engagement_events.map_id
          and m.published_at is not null
      )
    )
    and (
      map_engagement_events.directory_id is null
      or exists (
        select 1 from public.directories d
        where d.id = map_engagement_events.directory_id
          and (d.published_at is not null or d.current_publication_id is not null)
      )
    )
    and (
      map_engagement_events.listing_id is null
      or (
        map_engagement_events.map_id is not null
        and exists (
          select 1 from public.listings l
          where l.id = map_engagement_events.listing_id
            and l.map_id = map_engagement_events.map_id
        )
      )
      or (
        map_engagement_events.directory_id is not null
        and exists (
          select 1 from public.directory_entries e
          where e.id = map_engagement_events.listing_id
            and e.directory_id = map_engagement_events.directory_id
        )
      )
      or (
        map_engagement_events.map_id is not null
        and exists (
          select 1
          from public.directory_map_associations a
          join public.directory_entries e on e.directory_id = a.directory_id
          where a.map_id = map_engagement_events.map_id
            and e.id = map_engagement_events.listing_id
        )
      )
    )
  );

drop policy if exists "map_engagement_authenticated_select" on public.map_engagement_events;
create policy "map_engagement_authenticated_select"
  on public.map_engagement_events for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.maps m
      join public.contacts c on c.client_id = m.client_id and c.user_id = auth.uid()
      where m.id = map_engagement_events.map_id
        and (
          c.role in ('owner', 'manager')
          or exists (
            select 1 from public.contact_map_permissions cmp
            where cmp.contact_id = c.id and cmp.map_id = m.id
          )
        )
    )
    or exists (
      select 1
      from public.directories d
      join public.contacts c on c.client_id = d.client_id and c.user_id = auth.uid()
      where d.id = map_engagement_events.directory_id
        and (
          c.role in ('owner', 'manager')
          or exists (
            select 1 from public.contact_directory_permissions cdp
            where cdp.contact_id = c.id and cdp.directory_id = d.id
          )
        )
    )
  );


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
declare
  def text;
  map_null text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'map_engagement_events' and column_name = 'directory_id'
  ) then
    raise exception 'VERIFY FAILED: directory_id was not added';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directories' and column_name = 'analytics_json'
  ) then
    raise exception 'VERIFY FAILED: analytics_json was not added';
  end if;

  select is_nullable into map_null
  from information_schema.columns
  where table_schema = 'public' and table_name = 'map_engagement_events' and column_name = 'map_id';
  if map_null <> 'YES' then
    raise exception 'VERIFY FAILED: map_id is still NOT NULL';
  end if;

  if exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'map_engagement_events'
      and constraint_name = 'map_engagement_events_listing_id_fkey'
  ) then
    raise exception 'VERIFY FAILED: listing_id FK still present';
  end if;

  select pg_get_constraintdef(oid) into def
  from pg_constraint
  where conname = 'map_engagement_event_type'
    and conrelid = 'public.map_engagement_events'::regclass;
  if def is null or position('directory_view' in def) = 0 then
    raise exception 'VERIFY FAILED: directory event types missing from CHECK';
  end if;

  select pg_get_constraintdef(oid) into def
  from pg_constraint
  where conname = 'map_engagement_surface'
    and conrelid = 'public.map_engagement_events'::regclass;
  if def is null or position('directory_site' in def) = 0 then
    raise exception 'VERIFY FAILED: directory_site surface missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'map_engagement_events' and policyname = 'map_engagement_anon_insert'
  ) then
    raise exception 'VERIFY FAILED: anon insert policy missing';
  end if;

  raise notice 'VERIFY PASSED: directory engagement analytics schema';
end $$;

select 'map_engagement_events' as tbl, count(*) as rows from public.map_engagement_events
union all
select 'directories', count(*) from public.directories
order by tbl;
-- Must equal pre-migration counts.

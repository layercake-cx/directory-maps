-- ============================================================
-- Migration: 20260713120000_create_map_filter_fields
-- Description: Adds the configurable "filter fields" system — a second,
--              client-configurable layer of per-map metadata that sits
--              alongside (never replaces) groups/continent filtering.
--              Creates three EAV-style tables:
--                - map_filter_fields          (field definitions per map)
--                - map_filter_field_options   (option lists for select fields)
--                - listing_filter_values      (per-listing tagged values)
--              Tenant-scoped RLS mirrors groups/listings; anon reads are
--              gated to published maps only (stricter than listings today).
-- Affected tables: map_filter_fields, map_filter_field_options,
--                   listing_filter_values (all new)
-- Rollback: _20260713120000_create_map_filter_fields.rollback.sql
-- Author: Cursor agent
-- Date: 2026-07-13
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- If no error appears, the dry run passed. Then apply for real.
--
-- RUN ORDER: dry-run (BEGIN/ROLLBACK) -> apply on STAGING (beqejxneehilplrtpntn)
-- -> run POST-MIGRATION VERIFICATION -> only then apply on PRODUCTION
-- (gxixwdjfmegxcxfeflro) after explicit sign-off.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- Run these BEFORE applying. Stop if any assertion fails.
-- ------------------------------------------------------------

-- A) Confirm the tables we reference exist
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'maps'
  ) then
    raise exception 'ABORT: table public.maps does not exist';
  end if;
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'listings'
  ) then
    raise exception 'ABORT: table public.listings does not exist';
  end if;
end $$;

-- B) Row counts — inspect before proceeding
select
  'clients'   as tbl, count(*) as rows from public.clients union all
  select 'maps',      count(*) from public.maps              union all
  select 'groups',    count(*) from public.groups            union all
  select 'listings',  count(*) from public.listings
order by tbl;
-- Save this output. You will compare it to the post-migration counts.

-- C) Idempotency guard — the new tables must NOT already exist
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name in ('map_filter_fields', 'map_filter_field_options', 'listing_filter_values')
  ) then
    raise exception 'ABORT: one of the filter-field tables already exists — migration may have already run';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- 1) Field definitions (one row per configurable filter axis on a map)
create table public.map_filter_fields (
  id uuid primary key default gen_random_uuid(),
  map_id text not null references public.maps(id) on delete cascade,
  key text not null,
  label text not null,
  field_type text not null check (field_type in ('single_select', 'multi_select', 'text')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  show_in_filter_bar boolean not null default false,
  display_control text not null default 'dropdown'
    check (display_control in ('dropdown', 'multi_select', 'typeahead')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index map_filter_fields_map_key_key
  on public.map_filter_fields (map_id, key);

create index idx_map_filter_fields_map_id
  on public.map_filter_fields (map_id);

comment on table public.map_filter_fields is
  'Per-map configurable filter field definitions (additive layer alongside groups). key is a URL/import-safe slug, unique per map.';

-- 2) Option lists for single_select / multi_select fields
create table public.map_filter_field_options (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.map_filter_fields(id) on delete cascade,
  value text not null,
  label text not null,
  sort_order integer not null default 0,
  color text null
);

create unique index map_filter_field_options_field_value_key
  on public.map_filter_field_options (field_id, value);

create index idx_filter_field_options_field_id
  on public.map_filter_field_options (field_id);

comment on table public.map_filter_field_options is
  'Option lists for single_select / multi_select filter fields. value is the stable import key (matched by CSV/Sheet columns); label is display-only.';

-- 3) Per-listing values (EAV join)
create table public.listing_filter_values (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null references public.listings(id) on delete cascade,
  field_id uuid not null references public.map_filter_fields(id) on delete cascade,
  option_id uuid null references public.map_filter_field_options(id) on delete cascade,
  value_text text null,
  created_at timestamptz not null default now()
);

-- Stop duplicate tags for the same listing+field+option (only when option-backed)
create unique index listing_filter_values_unique_option
  on public.listing_filter_values (listing_id, field_id, option_id)
  where option_id is not null;

create index idx_listing_filter_values_listing_id
  on public.listing_filter_values (listing_id);

create index idx_listing_filter_values_field_id
  on public.listing_filter_values (field_id);

comment on table public.listing_filter_values is
  'Per-listing filter values. option_id for select fields; value_text only for text-type fields.';

-- ------------------------------------------------------------
-- RLS: tenant-scoped like groups/listings, plus anon read for
-- published maps only (stricter than listings_anon_select today).
-- ------------------------------------------------------------

alter table public.map_filter_fields enable row level security;
alter table public.map_filter_field_options enable row level security;
alter table public.listing_filter_values enable row level security;

-- ---- map_filter_fields ----
create policy "map_filter_fields_admin_all"
  on public.map_filter_fields for all
  to authenticated
  using (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  );

create policy "map_filter_fields_own_client"
  on public.map_filter_fields for all
  to authenticated
  using (
    map_id in (select id from public.maps where client_id = public.current_user_client_id())
  )
  with check (
    map_id in (select id from public.maps where client_id = public.current_user_client_id())
  );

create policy "map_filter_fields_anon_select"
  on public.map_filter_fields for select
  to anon
  using (
    exists (
      select 1 from public.maps m
      where m.id = map_filter_fields.map_id
        and m.published_at is not null
    )
  );

-- ---- map_filter_field_options ----
create policy "map_filter_field_options_admin_all"
  on public.map_filter_field_options for all
  to authenticated
  using (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  );

create policy "map_filter_field_options_own_client"
  on public.map_filter_field_options for all
  to authenticated
  using (
    field_id in (
      select f.id from public.map_filter_fields f
      join public.maps m on m.id = f.map_id
      where m.client_id = public.current_user_client_id()
    )
  )
  with check (
    field_id in (
      select f.id from public.map_filter_fields f
      join public.maps m on m.id = f.map_id
      where m.client_id = public.current_user_client_id()
    )
  );

create policy "map_filter_field_options_anon_select"
  on public.map_filter_field_options for select
  to anon
  using (
    exists (
      select 1
      from public.map_filter_fields f
      join public.maps m on m.id = f.map_id
      where f.id = map_filter_field_options.field_id
        and m.published_at is not null
    )
  );

-- ---- listing_filter_values ----
create policy "listing_filter_values_admin_all"
  on public.listing_filter_values for all
  to authenticated
  using (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  );

create policy "listing_filter_values_own_client"
  on public.listing_filter_values for all
  to authenticated
  using (
    listing_id in (
      select l.id from public.listings l
      join public.maps m on m.id = l.map_id
      where m.client_id = public.current_user_client_id()
    )
  )
  with check (
    listing_id in (
      select l.id from public.listings l
      join public.maps m on m.id = l.map_id
      where m.client_id = public.current_user_client_id()
    )
  );

create policy "listing_filter_values_anon_select"
  on public.listing_filter_values for select
  to anon
  using (
    exists (
      select 1
      from public.listings l
      join public.maps m on m.id = l.map_id
      where l.id = listing_filter_values.listing_id
        and m.published_at is not null
    )
  );

-- ------------------------------------------------------------
-- Data API grants (RLS still governs; these just let PostgREST reach the tables)
-- ------------------------------------------------------------
grant select, insert, update, delete on table public.map_filter_fields to anon, authenticated, service_role;
grant select, insert, update, delete on table public.map_filter_field_options to anon, authenticated, service_role;
grant select, insert, update, delete on table public.listing_filter_values to anon, authenticated, service_role;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- Run immediately after applying. All assertions must pass.
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'map_filter_fields') then
    raise exception 'VERIFY FAILED: map_filter_fields was not created';
  end if;
  if not exists (select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'map_filter_field_options') then
    raise exception 'VERIFY FAILED: map_filter_field_options was not created';
  end if;
  if not exists (select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'listing_filter_values') then
    raise exception 'VERIFY FAILED: listing_filter_values was not created';
  end if;
  raise notice 'VERIFY PASSED: filter field tables created';
end $$;

-- Row counts — clients/maps/groups/listings must be UNCHANGED from pre-migration.
select
  'clients'   as tbl, count(*) as rows from public.clients union all
  select 'maps',      count(*) from public.maps              union all
  select 'groups',    count(*) from public.groups            union all
  select 'listings',  count(*) from public.listings
order by tbl;

-- New tables must start empty
select
  'map_filter_fields'        as tbl, count(*) as rows from public.map_filter_fields union all
  select 'map_filter_field_options', count(*) from public.map_filter_field_options   union all
  select 'listing_filter_values',    count(*) from public.listing_filter_values
order by tbl;

-- RLS enabled on core + new tables
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'clients','maps','groups','listings','profiles','contacts',
    'map_filter_fields','map_filter_field_options','listing_filter_values'
  )
order by tablename;
-- All rows must show rowsecurity = true

-- Orphan checks (existing)
select count(*) as orphaned_maps      from public.maps     m where not exists (select 1 from public.clients c where c.id = m.client_id);
select count(*) as orphaned_listings  from public.listings l where not exists (select 1 from public.maps    m where m.id = l.map_id);
select count(*) as orphaned_groups    from public.groups   g where not exists (select 1 from public.maps    m where m.id = g.map_id);

-- Orphan checks (new filter-field tables) — all must return 0
select count(*) as orphaned_filter_fields
  from public.map_filter_fields f where not exists (select 1 from public.maps m where m.id = f.map_id);
select count(*) as orphaned_filter_options
  from public.map_filter_field_options o where not exists (select 1 from public.map_filter_fields f where f.id = o.field_id);
select count(*) as orphaned_filter_values_listing
  from public.listing_filter_values v where not exists (select 1 from public.listings l where l.id = v.listing_id);
select count(*) as orphaned_filter_values_field
  from public.listing_filter_values v where not exists (select 1 from public.map_filter_fields f where f.id = v.field_id);
-- All must return 0

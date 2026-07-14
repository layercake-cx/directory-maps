-- ============================================================
-- Migration: 20260714130000_create_categorisations
-- Description: Reusable, client-wide taxonomies (docs/DIRECTORIES.md,
--              epic DIR-E5) that can be applied to directories and/or
--              directory entries — additive alongside directory_groups
--              (the simple, per-directory, single-value grouping added
--              in 20260714120000), never replacing it. Mirrors the
--              map_filter_fields / options / values EAV shape, but
--              scoped to a client (not a single map/directory) so one
--              taxonomy (e.g. "Sector") can tag entries across every
--              directory a client owns.
--              Creates four tables:
--                - categorisations           (taxonomy definitions, per client)
--                - category_terms            (term list per categorisation)
--                - directory_category_terms  (tag a whole directory)
--                - entry_category_terms      (tag a directory entry)
-- Affected tables: categorisations, category_terms,
--                   directory_category_terms, entry_category_terms (all new)
-- Rollback: _20260714130000_create_categorisations.rollback.sql
-- Author: Claude Code
-- Date: 2026-07-14
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
    where table_schema = 'public' and table_name = 'clients'
  ) then
    raise exception 'ABORT: table public.clients does not exist';
  end if;
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'directories'
  ) then
    raise exception 'ABORT: table public.directories does not exist (run 20260714120000_create_directories.sql first)';
  end if;
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'directory_entries'
  ) then
    raise exception 'ABORT: table public.directory_entries does not exist (run 20260714120000_create_directories.sql first)';
  end if;
end $$;

-- B) Row counts — inspect before proceeding
select
  'clients'            as tbl, count(*) as rows from public.clients            union all
  select 'directories',        count(*) from public.directories                union all
  select 'directory_entries',  count(*) from public.directory_entries
order by tbl;
-- Save this output. You will compare it to the post-migration counts.

-- C) Idempotency guard — the new tables must NOT already exist
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name in ('categorisations', 'category_terms', 'directory_category_terms', 'entry_category_terms')
  ) then
    raise exception 'ABORT: one of the categorisation tables already exists — migration may have already run';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- 1) Taxonomy definitions — client-scoped, not per-directory (docs/DIRECTORIES.md §4.3)
create table public.categorisations (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete cascade,
  key text not null,
  label text not null,
  applies_to text not null check (applies_to in ('directory', 'entry', 'both')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index categorisations_client_key_key
  on public.categorisations (client_id, key);

create index idx_categorisations_client_id on public.categorisations(client_id);

comment on table public.categorisations is
  'Reusable, client-wide taxonomy definitions (docs/DIRECTORIES.md DIR-E5) — additive alongside directory_groups, not a replacement.';

-- 2) Terms per taxonomy
create table public.category_terms (
  id uuid primary key default gen_random_uuid(),
  categorisation_id uuid not null references public.categorisations(id) on delete cascade,
  label text not null,
  slug text not null,
  sort_order integer not null default 0,
  color text null
);

create unique index category_terms_categorisation_slug_key
  on public.category_terms (categorisation_id, slug);

create index idx_category_terms_categorisation_id on public.category_terms(categorisation_id);

comment on table public.category_terms is
  'Term list for a categorisation (peer of map_filter_field_options).';

-- 3) Tag a whole directory with a term (only for categorisations with applies_to in ('directory','both'))
create table public.directory_category_terms (
  directory_id text not null references public.directories(id) on delete cascade,
  term_id uuid not null references public.category_terms(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (directory_id, term_id)
);

create index idx_dct_directory on public.directory_category_terms(directory_id);
create index idx_dct_term on public.directory_category_terms(term_id);

comment on table public.directory_category_terms is
  'Tags a whole directory with a categorisation term (docs/DIRECTORIES.md DIR-E5-S2).';

-- 4) Tag a directory entry with a term (only for categorisations with applies_to in ('entry','both'))
create table public.entry_category_terms (
  entry_id text not null references public.directory_entries(id) on delete cascade,
  term_id uuid not null references public.category_terms(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, term_id)
);

create index idx_ect_entry on public.entry_category_terms(entry_id);
create index idx_ect_term on public.entry_category_terms(term_id);

comment on table public.entry_category_terms is
  'Tags a directory entry with a categorisation term (peer of listing_filter_values, but pure many-to-many — no free-text value variant; notes_html already covers free text).';

-- ------------------------------------------------------------
-- RLS: tenant-scoped like directories/directory_entries today.
-- No anon_select policies yet (no publish concept until DIR-E2).
-- ------------------------------------------------------------

alter table public.categorisations enable row level security;
alter table public.category_terms enable row level security;
alter table public.directory_category_terms enable row level security;
alter table public.entry_category_terms enable row level security;

-- ---- categorisations ----
create policy "categorisations_admin_all"
  on public.categorisations for all
  to authenticated
  using (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  );

create policy "categorisations_own_client"
  on public.categorisations for all
  to authenticated
  using (client_id = public.current_user_client_id())
  with check (client_id = public.current_user_client_id());

-- ---- category_terms ----
create policy "category_terms_admin_all"
  on public.category_terms for all
  to authenticated
  using (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  );

create policy "category_terms_own_client"
  on public.category_terms for all
  to authenticated
  using (
    categorisation_id in (
      select id from public.categorisations where client_id = public.current_user_client_id()
    )
  )
  with check (
    categorisation_id in (
      select id from public.categorisations where client_id = public.current_user_client_id()
    )
  );

-- ---- directory_category_terms ----
create policy "dct_admin_all"
  on public.directory_category_terms for all
  to authenticated
  using (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  );

create policy "dct_own_client"
  on public.directory_category_terms for all
  to authenticated
  using (
    directory_id in (select id from public.directories where client_id = public.current_user_client_id())
  )
  with check (
    directory_id in (select id from public.directories where client_id = public.current_user_client_id())
  );

-- ---- entry_category_terms ----
create policy "ect_admin_all"
  on public.entry_category_terms for all
  to authenticated
  using (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  );

create policy "ect_own_client"
  on public.entry_category_terms for all
  to authenticated
  using (
    entry_id in (
      select e.id from public.directory_entries e
      join public.directories d on d.id = e.directory_id
      where d.client_id = public.current_user_client_id()
    )
  )
  with check (
    entry_id in (
      select e.id from public.directory_entries e
      join public.directories d on d.id = e.directory_id
      where d.client_id = public.current_user_client_id()
    )
  );

-- ------------------------------------------------------------
-- Data API grants (RLS still governs; these just let PostgREST reach the tables)
-- ------------------------------------------------------------
grant select, insert, update, delete on table public.categorisations to authenticated, service_role;
grant select, insert, update, delete on table public.category_terms to authenticated, service_role;
grant select, insert, update, delete on table public.directory_category_terms to authenticated, service_role;
grant select, insert, update, delete on table public.entry_category_terms to authenticated, service_role;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- Run immediately after applying. All assertions must pass.
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'categorisations') then
    raise exception 'VERIFY FAILED: categorisations was not created';
  end if;
  if not exists (select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'category_terms') then
    raise exception 'VERIFY FAILED: category_terms was not created';
  end if;
  if not exists (select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'directory_category_terms') then
    raise exception 'VERIFY FAILED: directory_category_terms was not created';
  end if;
  if not exists (select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'entry_category_terms') then
    raise exception 'VERIFY FAILED: entry_category_terms was not created';
  end if;
  raise notice 'VERIFY PASSED: categorisation tables created';
end $$;

-- Row counts — clients/directories/directory_entries must be UNCHANGED from pre-migration.
select
  'clients'            as tbl, count(*) as rows from public.clients            union all
  select 'directories',        count(*) from public.directories                union all
  select 'directory_entries',  count(*) from public.directory_entries
order by tbl;

-- New tables must start empty
select
  'categorisations'            as tbl, count(*) as rows from public.categorisations            union all
  select 'category_terms',             count(*) from public.category_terms                     union all
  select 'directory_category_terms',   count(*) from public.directory_category_terms           union all
  select 'entry_category_terms',       count(*) from public.entry_category_terms
order by tbl;

-- RLS enabled on core + new tables
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'clients','directories','directory_entries',
    'categorisations','category_terms','directory_category_terms','entry_category_terms'
  )
order by tablename;
-- All rows must show rowsecurity = true

-- Orphan checks (new categorisation tables) — all must return 0
select count(*) as orphaned_categorisations
  from public.categorisations c where not exists (select 1 from public.clients cl where cl.id = c.client_id);
select count(*) as orphaned_category_terms
  from public.category_terms t where not exists (select 1 from public.categorisations c where c.id = t.categorisation_id);
select count(*) as orphaned_dct_directory
  from public.directory_category_terms x where not exists (select 1 from public.directories d where d.id = x.directory_id);
select count(*) as orphaned_dct_term
  from public.directory_category_terms x where not exists (select 1 from public.category_terms t where t.id = x.term_id);
select count(*) as orphaned_ect_entry
  from public.entry_category_terms x where not exists (select 1 from public.directory_entries e where e.id = x.entry_id);
select count(*) as orphaned_ect_term
  from public.entry_category_terms x where not exists (select 1 from public.category_terms t where t.id = x.term_id);
-- All must return 0

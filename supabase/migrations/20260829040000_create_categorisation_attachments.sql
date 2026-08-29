-- ============================================================
-- Migration: 20260829040000_create_categorisation_attachments
-- Description: Replaces the automatic-everywhere gating a categorisation
--              had via applies_to (directory/entry/both — every directory a
--              client owns automatically got every applicable categorisation,
--              with no per-directory or per-map opt-in) with an explicit
--              attachment model: a categorisation is only usable on a
--              specific map or directory once deliberately attached to it.
--              The same categorisation can be attached to any number of
--              maps and directories independently — this is the actual
--              mechanism behind "a map and a directory can be filtered by
--              the same categories" (they're both just consuming the same
--              attached categorisation's terms on their own records).
--              Also re-creates listing_category_terms (previously added in
--              20260829020000, reverted in 20260829030000 because the
--              gating model around it was wrong) — the peer of
--              entry_category_terms, now correctly gated by attachment to a
--              specific map rather than a client-wide flag.
--              categorisations.applies_to is NOT dropped here — it becomes
--              unused by app code going forward, but removing a column is a
--              separate, standalone, explicitly-flagged migration per
--              docs/DATABASE_MIGRATIONS.md's "Forbidden operations" rule
--              (never bundle a DROP COLUMN with additive changes).
--              Backfills attachment rows for every EXISTING categorisation
--              against every directory of its own client, so nothing
--              currently relying on the old "every directory gets every
--              applicable categorisation" behaviour regresses. No map
--              attachments existed before this migration (the concept is
--              new), so nothing to backfill there.
-- Affected tables: categorisation_attachments (new), listing_category_terms
--                   (new), categorisations (data backfill only, no schema
--                   change — applies_to column untouched)
-- Rollback: _20260829040000_create_categorisation_attachments.rollback.sql
-- Author: Claude Code
-- Date: 2026-08-29
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
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'categorisations') then
    raise exception 'ABORT: table public.categorisations does not exist';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'maps') then
    raise exception 'ABORT: table public.maps does not exist';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'listings') then
    raise exception 'ABORT: table public.listings does not exist';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'categorisation_attachments') then
    raise exception 'ABORT: categorisation_attachments already exists — migration may have already run';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'listing_category_terms') then
    raise exception 'ABORT: listing_category_terms already exists — migration may have already run';
  end if;
end $$;

select
  'categorisations'  as tbl, count(*) as rows from public.categorisations  union all
  select 'directories',      count(*) from public.directories             union all
  select 'maps',             count(*) from public.maps                    union all
  select 'listings',         count(*) from public.listings
order by tbl;
-- Save this output. categorisations/directories/maps/listings row counts
-- must be unchanged after (new tables + backfill rows only, no existing
-- row is modified or deleted).


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

create table public.categorisation_attachments (
  id uuid primary key default gen_random_uuid(),
  categorisation_id uuid not null references public.categorisations(id) on delete cascade,
  target_type text not null check (target_type in ('map', 'directory')),
  target_id text not null,
  created_at timestamptz not null default now(),
  unique (categorisation_id, target_type, target_id)
);

create index idx_categorisation_attachments_categorisation on public.categorisation_attachments(categorisation_id);
create index idx_categorisation_attachments_target on public.categorisation_attachments(target_type, target_id);

comment on table public.categorisation_attachments is
  'Explicit opt-in: a categorisation is only usable as a filter on a specific map or directory once attached here. Replaces the old applies_to-driven "every directory a client owns gets every applicable categorisation automatically" behaviour. The same categorisation can be attached to any number of maps and directories independently.';

create table public.listing_category_terms (
  listing_id text not null references public.listings(id) on delete cascade,
  term_id uuid not null references public.category_terms(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (listing_id, term_id)
);

create index idx_lct_listing on public.listing_category_terms(listing_id);
create index idx_lct_term on public.listing_category_terms(term_id);

comment on table public.listing_category_terms is
  'Tags a map listing with a categorisation term (peer of entry_category_terms). Only meaningful for a categorisation attached to that listing''s map (categorisation_attachments, target_type = ''map'').';

-- Backfill: every EXISTING categorisation, attached to every directory of
-- its own client — preserves current behaviour (applies_to's old
-- automatic-everywhere gating) for anything already relying on it. No map
-- attachments to backfill; the map-attachment concept is new.
insert into public.categorisation_attachments (categorisation_id, target_type, target_id)
select c.id, 'directory', d.id
from public.categorisations c
join public.directories d on d.client_id = c.client_id
on conflict (categorisation_id, target_type, target_id) do nothing;

-- ------------------------------------------------------------
-- RLS: tenant-scoped (both the categorisation AND the target must belong
-- to the acting client), plus anon read for published targets only.
-- ------------------------------------------------------------

alter table public.categorisation_attachments enable row level security;
alter table public.listing_category_terms enable row level security;

-- ---- categorisation_attachments ----
create policy "categorisation_attachments_admin_all"
  on public.categorisation_attachments for all
  to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

create policy "categorisation_attachments_own_client"
  on public.categorisation_attachments for all
  to authenticated
  using (
    exists (
      select 1 from public.categorisations c
      where c.id = categorisation_attachments.categorisation_id
        and c.client_id = public.current_user_client_id()
    )
    and (
      (categorisation_attachments.target_type = 'map' and exists (
        select 1 from public.maps m where m.id = categorisation_attachments.target_id and m.client_id = public.current_user_client_id()
      ))
      or
      (categorisation_attachments.target_type = 'directory' and exists (
        select 1 from public.directories d where d.id = categorisation_attachments.target_id and d.client_id = public.current_user_client_id()
      ))
    )
  )
  with check (
    exists (
      select 1 from public.categorisations c
      where c.id = categorisation_attachments.categorisation_id
        and c.client_id = public.current_user_client_id()
    )
    and (
      (categorisation_attachments.target_type = 'map' and exists (
        select 1 from public.maps m where m.id = categorisation_attachments.target_id and m.client_id = public.current_user_client_id()
      ))
      or
      (categorisation_attachments.target_type = 'directory' and exists (
        select 1 from public.directories d where d.id = categorisation_attachments.target_id and d.client_id = public.current_user_client_id()
      ))
    )
  );

create policy "categorisation_attachments_anon_select"
  on public.categorisation_attachments for select
  to anon
  using (
    (target_type = 'map' and exists (select 1 from public.maps m where m.id = categorisation_attachments.target_id and m.published_at is not null))
    or
    (target_type = 'directory' and exists (select 1 from public.directories d where d.id = categorisation_attachments.target_id and d.published_at is not null))
  );

-- ---- listing_category_terms ----
create policy "listing_category_terms_admin_all"
  on public.listing_category_terms for all
  to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

create policy "listing_category_terms_own_client"
  on public.listing_category_terms for all
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

create policy "listing_category_terms_anon_select"
  on public.listing_category_terms for select
  to anon
  using (
    exists (
      select 1
      from public.listings l
      join public.maps m on m.id = l.map_id
      where l.id = listing_category_terms.listing_id
        and m.published_at is not null
    )
  );

grant select, insert, update, delete on table public.categorisation_attachments to authenticated, service_role;
grant select on table public.categorisation_attachments to anon;
grant select, insert, update, delete on table public.listing_category_terms to authenticated, service_role;
grant select on table public.listing_category_terms to anon;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'categorisation_attachments') then
    raise exception 'VERIFY FAILED: categorisation_attachments was not created';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'listing_category_terms') then
    raise exception 'VERIFY FAILED: listing_category_terms was not created';
  end if;
  raise notice 'VERIFY PASSED: categorisation_attachments + listing_category_terms created';
end $$;

-- Row counts — categorisations/directories/maps/listings must be UNCHANGED.
select
  'categorisations'  as tbl, count(*) as rows from public.categorisations  union all
  select 'directories',      count(*) from public.directories             union all
  select 'maps',             count(*) from public.maps                    union all
  select 'listings',         count(*) from public.listings
order by tbl;

-- New tables' row counts — listing_category_terms must start empty;
-- categorisation_attachments should equal (categorisations x their own
-- client's directories) from the backfill.
select 'categorisation_attachments' as tbl, count(*) as rows from public.categorisation_attachments
union all
select 'listing_category_terms', count(*) from public.listing_category_terms;

-- RLS enabled
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename in ('categorisation_attachments', 'listing_category_terms');
-- Must show rowsecurity = true for both

-- Orphan checks — must return 0
select count(*) as orphaned_attachment_categorisation
  from public.categorisation_attachments a where not exists (select 1 from public.categorisations c where c.id = a.categorisation_id);
select count(*) as orphaned_attachment_map_target
  from public.categorisation_attachments a where a.target_type = 'map' and not exists (select 1 from public.maps m where m.id = a.target_id);
select count(*) as orphaned_attachment_directory_target
  from public.categorisation_attachments a where a.target_type = 'directory' and not exists (select 1 from public.directories d where d.id = a.target_id);
select count(*) as orphaned_lct_listing
  from public.listing_category_terms x where not exists (select 1 from public.listings l where l.id = x.listing_id);
select count(*) as orphaned_lct_term
  from public.listing_category_terms x where not exists (select 1 from public.category_terms t where t.id = x.term_id);
-- All must return 0

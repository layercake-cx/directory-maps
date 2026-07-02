-- ============================================================
-- Migration: 20260702120000_beta_signups
-- Description: Creates beta_signups table to capture "Become a founding
--              partner" enquiries from the new public maps.layercake-cx.biz
--              landing page. Distinct from map_contact_submissions, which
--              is map-scoped (requires map_id) and unsuitable for a
--              pre-account marketing enquiry.
-- Affected tables: beta_signups (new)
-- Rollback: _20260702120000_beta_signups.rollback.sql
-- Author: Claude Code
-- Date: 2026-07-02
-- ============================================================

-- PRE-MIGRATION INTEGRITY CHECK
-- Run these assertions BEFORE applying. If any fail, stop.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'beta_signups'
  ) then
    raise exception 'ABORT: table public.beta_signups already exists — migration may have already run';
  end if;
end $$;

-- CAPTURE PRE-STATE
-- Nothing to capture: this is a new table with no prior rows.

-- ============================================================
-- THE MIGRATION
-- ============================================================
--
-- DRY-RUN PROCEDURE (per docs/DATABASE_MIGRATIONS.md):
--   begin;
--   -- paste the block between here and POST-MIGRATION VERIFICATION --
--   rollback;
-- Run this in the Supabase SQL editor against the STAGING project first.
-- Apply to production only after staging is verified and the user confirms.

create table public.beta_signups (
  id uuid primary key default gen_random_uuid(),
  submitted_at timestamptz not null default now(),
  first_name text not null,
  last_name text not null,
  organisation text not null,
  work_email text not null,
  message text null,
  source text not null default 'maps_landing'
);

create index idx_beta_signups_submitted_at
  on public.beta_signups(submitted_at desc);

comment on table public.beta_signups is
  'Founding-partner beta enquiries submitted from the public maps.layercake-cx.biz landing page signup form. Not tied to an existing client/map — these are pre-account leads.';

alter table public.beta_signups enable row level security;

-- Public landing page (anon, unauthenticated): insert-only.
create policy "beta_signups_anon_insert"
  on public.beta_signups for insert
  to anon
  with check (true);

-- Signed-in users can also submit (e.g. testing while logged in as admin).
create policy "beta_signups_authenticated_insert"
  on public.beta_signups for insert
  to authenticated
  with check (true);

-- Platform admins only: review submitted enquiries.
create policy "beta_signups_admin_select"
  on public.beta_signups for select
  to authenticated
  using (public.is_admin());

-- ============================================================
-- POST-MIGRATION VERIFICATION
-- Run these after applying. All assertions must pass.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'beta_signups'
  ) then
    raise exception 'VERIFY FAILED: table beta_signups was not created';
  end if;

  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'beta_signups' and rowsecurity = true
  ) then
    raise exception 'VERIFY FAILED: row level security is not enabled on beta_signups';
  end if;

  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'beta_signups') <> 3 then
    raise exception 'VERIFY FAILED: expected 3 policies on beta_signups';
  end if;

  raise notice 'VERIFY PASSED: beta_signups exists, RLS enabled, 3 policies present';
end $$;

select count(*) as total_beta_signups from public.beta_signups;
-- Expected: 0 (new table, no rows yet)

-- ============================================================
-- INTEGRITY VERIFICATION CHECKLIST (run before and after, per
-- docs/DATABASE_MIGRATIONS.md) — this migration only adds a new,
-- independent table, so existing tables are not expected to change.
-- ============================================================
--
-- select
--   'clients'   as tbl, count(*) as rows from public.clients union all
--   select 'maps',      count(*) from public.maps              union all
--   select 'groups',    count(*) from public.groups            union all
--   select 'listings',  count(*) from public.listings          union all
--   select 'profiles',  count(*) from public.profiles
-- order by tbl;
--
-- select tablename, rowsecurity
-- from pg_tables
-- where schemaname = 'public'
--   and tablename in ('clients','maps','groups','listings','profiles','contacts','beta_signups')
-- order by tablename;
-- Expected: rowsecurity = true for all rows, including beta_signups.

-- ============================================================
-- Migration: 20260702130000_beta_signups_status
-- Description: Adds a status column to beta_signups so platform admins
--              can track founding-partner leads through a simple pipeline
--              (To be actioned / In progress / Successful / Lost) from
--              the new admin Leads page. Also adds an admin-only update
--              policy so admins can change status (existing policies only
--              allowed insert + admin select).
-- Affected tables: beta_signups
-- Rollback: _20260702130000_beta_signups_status.rollback.sql
-- Author: Claude Code
-- Date: 2026-07-02
-- ============================================================

-- PRE-MIGRATION INTEGRITY CHECK
-- Run these assertions BEFORE applying. If any fail, stop.
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'beta_signups'
  ) then
    raise exception 'ABORT: table public.beta_signups does not exist';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'beta_signups'
      and column_name = 'status'
  ) then
    raise exception 'ABORT: column status already exists — migration may have already run';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'beta_signups'
      and policyname = 'beta_signups_admin_update'
  ) then
    raise exception 'ABORT: policy beta_signups_admin_update already exists — migration may have already run';
  end if;
end $$;

-- CAPTURE PRE-STATE
select count(*) as total_beta_signups from public.beta_signups;

-- ============================================================
-- THE MIGRATION
--
-- DRY-RUN PROCEDURE (per docs/DATABASE_MIGRATIONS.md):
--   begin;
--   -- paste the block between here and POST-MIGRATION VERIFICATION --
--   rollback;
-- Run this in the Supabase SQL editor against STAGING first.
-- Apply to production only after staging is verified and the user confirms.
-- ============================================================

alter table public.beta_signups
  add column if not exists status text not null default 'To be actioned'
  check (status in ('To be actioned', 'In progress', 'Successful', 'Lost'));

comment on column public.beta_signups.status is
  'Lead pipeline status set by platform admins reviewing founding-partner enquiries.';

-- Platform admins only: update lead status (all other columns are set on
-- insert by the public form and should not be admin-editable via this policy).
create policy "beta_signups_admin_update"
  on public.beta_signups for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- POST-MIGRATION VERIFICATION
-- Run these after applying. All assertions must pass.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'beta_signups'
      and column_name = 'status'
  ) then
    raise exception 'VERIFY FAILED: column status was not created';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'beta_signups'
      and column_name = 'status'
      and is_nullable = 'YES'
  ) then
    raise exception 'VERIFY FAILED: status should be NOT NULL';
  end if;

  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'beta_signups') <> 4 then
    raise exception 'VERIFY FAILED: expected 4 policies on beta_signups';
  end if;

  raise notice 'VERIFY PASSED: status column exists (NOT NULL, defaulted), 4 policies present';
end $$;

-- Confirm row count and default backfill
select
  count(*) as total_beta_signups,
  count(*) filter (where status = 'To be actioned') as to_be_actioned
from public.beta_signups;
-- Expected: total_beta_signups unchanged; to_be_actioned = total_beta_signups (all existing rows defaulted)

-- ============================================================
-- INTEGRITY VERIFICATION CHECKLIST (run before and after, per
-- docs/DATABASE_MIGRATIONS.md)
-- ============================================================
--
-- select
--   'clients'      as tbl, count(*) as rows from public.clients      union all
--   select 'maps',         count(*) from public.maps                union all
--   select 'groups',       count(*) from public.groups               union all
--   select 'listings',     count(*) from public.listings             union all
--   select 'profiles',     count(*) from public.profiles             union all
--   select 'beta_signups', count(*) from public.beta_signups
-- order by tbl;
--
-- select tablename, rowsecurity
-- from pg_tables
-- where schemaname = 'public'
--   and tablename in ('clients','maps','groups','listings','profiles','contacts','beta_signups')
-- order by tablename;
-- Expected: rowsecurity = true for all rows, including beta_signups.

-- ============================================================
-- Migration: 20260616140000_add_email_message_intro
-- Description: Adds email_message_intro (plain-text opening line for
--              outbound map contact emails). Nullable — when empty the
--              platform default template is used.
-- Affected tables: clients
-- Rollback: _20260616140000_add_email_message_intro.rollback.sql
-- Date: 2026-06-16
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — makes NO persistent changes):
--
--   BEGIN;
--   <paste migration body below>
--   ROLLBACK;
--
-- ============================================================

-- PRE-MIGRATION INTEGRITY CHECKS
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'clients'
  ) then
    raise exception 'ABORT: table public.clients does not exist';
  end if;
end $$;

select
  'clients'  as tbl, count(*) as rows from public.clients union all
  select 'maps',     count(*) from public.maps             union all
  select 'groups',   count(*) from public.groups           union all
  select 'listings', count(*) from public.listings
order by tbl;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'clients'
      and column_name  = 'email_message_intro'
  ) then
    raise exception 'ABORT: email_message_intro already exists — migration may have already run';
  end if;
end $$;

-- THE MIGRATION
alter table public.clients
  add column if not exists email_message_intro text;

comment on column public.clients.email_message_intro is
  'Plain-text opening line in outbound map contact emails. Use {listing} for the listing name. '
  'When null or blank, the platform default intro is used.';

-- POST-MIGRATION VERIFICATION
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'clients'
      and column_name  = 'email_message_intro'
  ) then
    raise exception 'VERIFY FAILED: email_message_intro was not created';
  end if;

  raise notice 'VERIFY PASSED: email_message_intro column created';
end $$;

select
  'clients'  as tbl, count(*) as rows from public.clients union all
  select 'maps',     count(*) from public.maps             union all
  select 'groups',   count(*) from public.groups           union all
  select 'listings', count(*) from public.listings
order by tbl;

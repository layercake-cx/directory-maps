-- ============================================================
-- Migration: 20260616150000_add_email_message_subject
-- Description: Adds email_message_subject (plain-text subject line for
--              outbound map contact emails). Nullable — when empty the
--              platform default template is used.
-- Affected tables: clients
-- Rollback: _20260616150000_add_email_message_subject.rollback.sql
-- Date: 2026-06-16
-- ============================================================

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
      and column_name  = 'email_message_subject'
  ) then
    raise exception 'ABORT: email_message_subject already exists — migration may have already run';
  end if;
end $$;

alter table public.clients
  add column if not exists email_message_subject text;

comment on column public.clients.email_message_subject is
  'Plain-text subject for outbound map contact emails. Use {listing} for the listing name. '
  'When null or blank, the platform default subject is used.';

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'clients'
      and column_name  = 'email_message_subject'
  ) then
    raise exception 'VERIFY FAILED: email_message_subject was not created';
  end if;

  raise notice 'VERIFY PASSED: email_message_subject column created';
end $$;

select
  'clients'  as tbl, count(*) as rows from public.clients union all
  select 'maps',     count(*) from public.maps             union all
  select 'groups',   count(*) from public.groups           union all
  select 'listings', count(*) from public.listings
order by tbl;

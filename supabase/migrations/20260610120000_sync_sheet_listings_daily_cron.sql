-- ============================================================
-- Migration: 20260610120000_sync_sheet_listings_daily_cron
-- Description: Make daily auto-sync actually fire. Normalises
--              sync_schedule values to 'daily:HH:00' (legacy
--              'nightly'/'hourly' become 'daily:02:00') and
--              registers a pg_cron dispatch job that runs at the
--              top of every hour, invoking sync_sheet_listings
--              with {"schedule": "daily"}. The Edge Function
--              syncs only sources whose stored hour matches the
--              current UTC hour.
-- Affected tables: map_data_sources, cron.job (pg_cron)
-- Rollback: _20260610120000_sync_sheet_listings_daily_cron.rollback.sql
-- Author: Cursor agent
-- Date: 2026-06-10
-- ============================================================
--
-- PREREQUISITES (must exist before the cron job can succeed):
--   select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'project_url');
--   select vault.create_secret('<SUPABASE_ANON_KEY>', 'anon_key');
-- See docs/GOOGLE_SHEETS_SYNC.md section 5.
--
-- NOTE: requires the updated sync_sheet_listings Edge Function
-- (handles {"schedule": "daily"} hour matching) to be deployed
-- to the same project BEFORE the first hourly dispatch fires.
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--
--   BEGIN;
--   <paste migration body below, from PRE-MIGRATION through POST-MIGRATION>
--   ROLLBACK;
--
-- ============================================================

-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'map_data_sources'
  ) then
    raise exception 'ABORT: table public.map_data_sources does not exist';
  end if;
end $$;

select
  'clients'   as tbl, count(*) as rows from public.clients union all
  select 'maps',      count(*) from public.maps              union all
  select 'groups',    count(*) from public.groups            union all
  select 'listings',  count(*) from public.listings
order by tbl;

-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- Legacy values: 'nightly' (old daily-at-midnight) and 'hourly'
-- (option removed from UI) both become daily at 02:00 UTC.
update public.map_data_sources
set sync_schedule = 'daily:02:00',
    updated_at = now()
where sync_schedule in ('nightly', 'hourly');

-- Snap any daily:HH:MM values to the top of the hour, since the
-- cron dispatch matches on whole UTC hours.
update public.map_data_sources
set sync_schedule = 'daily:' || lpad(split_part(substring(sync_schedule from 7), ':', 1), 2, '0') || ':00',
    updated_at = now()
where sync_schedule like 'daily:%'
  and sync_schedule !~ '^daily:\d{2}:00$';

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

-- Remove superseded jobs (the old nightly job synced ALL enabled
-- sources regardless of schedule).
select cron.unschedule(jobid)
from cron.job
where jobname in ('sync-sheet-listings-nightly', 'sync-sheet-listings-hourly', 'sync-sheet-listings-daily-dispatch');

-- Dispatch at the top of every hour; the Edge Function matches
-- sources scheduled for the current UTC hour.
select cron.schedule(
  'sync-sheet-listings-daily-dispatch',
  '0 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1)
           || '/functions/v1/sync_sheet_listings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key' limit 1)
    ),
    body := '{"schedule": "daily"}'::jsonb
  );
  $$
);

-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from public.map_data_sources
    where sync_schedule is not null
      and sync_schedule !~ '^daily:\d{2}:00$'
  ) then
    raise exception 'VERIFY FAILED: non-normalised sync_schedule values remain';
  end if;

  if not exists (
    select 1 from cron.job where jobname = 'sync-sheet-listings-daily-dispatch'
  ) then
    raise exception 'VERIFY FAILED: sync-sheet-listings-daily-dispatch cron job was not created';
  end if;

  raise notice 'VERIFY PASSED: daily dispatch cron registered, schedules normalised';
end $$;

select
  'clients'   as tbl, count(*) as rows from public.clients union all
  select 'maps',      count(*) from public.maps              union all
  select 'groups',    count(*) from public.groups            union all
  select 'listings',  count(*) from public.listings
order by tbl;

select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('clients','maps','groups','listings','profiles','contacts')
order by tablename;

select count(*) as orphaned_maps     from public.maps     m where not exists (select 1 from public.clients c where c.id = m.client_id);
select count(*) as orphaned_listings from public.listings l where not exists (select 1 from public.maps    m where m.id = l.map_id);
select count(*) as orphaned_groups   from public.groups   g where not exists (select 1 from public.maps    m where m.id = g.map_id);

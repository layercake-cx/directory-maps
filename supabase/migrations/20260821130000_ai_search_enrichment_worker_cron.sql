-- ============================================================
-- Migration: 20260821130000_ai_search_enrichment_worker_cron
-- Description: Wires up the async worker side of the AI search enrichment
--              queue created in 20260821120000_create_ai_search_enrichment.
--
--              Adds:
--                - claim_pending_listing_enrichment_jobs(p_batch_size) — an
--                  atomic "claim a batch of pending jobs" RPC using
--                  FOR UPDATE SKIP LOCKED, so overlapping cron ticks can
--                  never double-process the same job. service_role only —
--                  not callable by authenticated/anon.
--                - A pg_cron job dispatching to the process_listing_enrichment
--                  Edge Function every 2 minutes. The function itself claims
--                  a small batch, calls Claude Haiku 4.5, and writes results.
--                  The 2-minute + small-batch combination is the throttle
--                  that protects against a bulk CSV import enqueueing
--                  hundreds of jobs at once.
--
-- PREREQUISITES (must already exist — created by
-- 20260610120000_sync_sheet_listings_daily_cron.sql):
--   select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'project_url');
--   select vault.create_secret('<SUPABASE_ANON_KEY>', 'anon_key');
-- This migration reuses those same two vault secrets rather than creating
-- new ones.
--
-- NOTE: requires the process_listing_enrichment Edge Function (and the
-- ANTHROPIC_API_KEY secret it needs) to be deployed to the same project
-- BEFORE the first dispatch tick fires, or every tick will just log a
-- fetch failure with nothing to process yet.
--
-- Affected tables: none (function + cron.job only)
-- Rollback: _20260821130000_ai_search_enrichment_worker_cron.rollback.sql
-- Author: Claude Code
-- Date: 2026-08-21
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- RUN ORDER: dry-run (BEGIN/ROLLBACK) -> apply on STAGING (beqejxneehilplrtpntn)
-- -> deploy process_listing_enrichment + set ANTHROPIC_API_KEY on staging
-- -> run POST-MIGRATION VERIFICATION -> only then apply on PRODUCTION
-- (gxixwdjfmegxcxfeflro) after explicit sign-off.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'listing_enrichment_jobs'
  ) then
    raise exception 'ABORT: table public.listing_enrichment_jobs does not exist — apply 20260821120000_create_ai_search_enrichment.sql first';
  end if;
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'project_url'
  ) then
    raise exception 'ABORT: vault secret "project_url" does not exist — see prerequisites above';
  end if;
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'anon_key'
  ) then
    raise exception 'ABORT: vault secret "anon_key" does not exist — see prerequisites above';
  end if;
end $$;

-- Idempotency guard
do $$
begin
  if exists (
    select 1 from pg_proc where proname = 'claim_pending_listing_enrichment_jobs'
  ) then
    raise exception 'ABORT: claim_pending_listing_enrichment_jobs already exists — migration may have already run';
  end if;
  if exists (
    select 1 from cron.job where jobname = 'process-listing-enrichment-dispatch'
  ) then
    raise exception 'ABORT: process-listing-enrichment-dispatch cron job already exists — migration may have already run';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

-- 1) Atomic batch claim — SKIP LOCKED means two overlapping invocations
-- (e.g. a slow tick still running when the next one fires) can never claim
-- the same row.
create or replace function public.claim_pending_listing_enrichment_jobs(p_batch_size integer default 5)
returns setof public.listing_enrichment_jobs
language sql
security definer
set search_path = public
as $$
  update public.listing_enrichment_jobs
  set status = 'processing', started_at = now()
  where id in (
    select id from public.listing_enrichment_jobs
    where status = 'pending'
    order by created_at
    limit greatest(p_batch_size, 0)
    for update skip locked
  )
  returning *;
$$;

comment on function public.claim_pending_listing_enrichment_jobs(integer) is
  'Atomically claims up to p_batch_size pending listing_enrichment_jobs rows (FOR UPDATE SKIP LOCKED), marking them processing. Called by the process_listing_enrichment Edge Function via the service-role client. Not exposed to authenticated/anon.';

revoke all on function public.claim_pending_listing_enrichment_jobs(integer) from public, authenticated, anon;
grant execute on function public.claim_pending_listing_enrichment_jobs(integer) to service_role;

-- 2) Dispatch tick — every 2 minutes, invoke the worker Edge Function.
-- The function itself decides batch size and does nothing if the queue is empty.
select cron.schedule(
  'process-listing-enrichment-dispatch',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1)
           || '/functions/v1/process_listing_enrichment',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_proc where proname = 'claim_pending_listing_enrichment_jobs'
  ) then
    raise exception 'VERIFY FAILED: claim_pending_listing_enrichment_jobs was not created';
  end if;
  if not exists (
    select 1 from cron.job where jobname = 'process-listing-enrichment-dispatch'
  ) then
    raise exception 'VERIFY FAILED: process-listing-enrichment-dispatch cron job was not created';
  end if;
  raise notice 'VERIFY PASSED: claim RPC + dispatch cron registered';
end $$;

-- Manual smoke test (safe — rolls back its own claim since jobs table was
-- empty or this is running inside the dry-run transaction):
-- select * from public.claim_pending_listing_enrichment_jobs(5);

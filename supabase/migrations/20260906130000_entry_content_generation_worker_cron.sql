-- ============================================================
-- Migration: 20260906130000_entry_content_generation_worker_cron
-- Description: Wires up the async worker side of the directory AI content
--              generation queue created in
--              20260906120000_create_directory_ai_content_generation, plus
--              the client-callable bulk-enqueue RPC that drives the
--              directory dashboard's "Generate all entry content" action.
--
--              Adds:
--                - claim_pending_entry_content_jobs(p_batch_size) — atomic
--                  batch claim using FOR UPDATE SKIP LOCKED, mirrors
--                  claim_pending_listing_enrichment_jobs. service_role only.
--                - A pg_cron job dispatching to the process_entry_content_jobs
--                  Edge Function every 2 minutes, same cadence as the
--                  removed map-level feature's dispatch.
--                - enqueue_directory_entry_content_jobs(p_directory_id) —
--                  client-callable (security definer, admin-or-own-client
--                  checked explicitly, same pattern as publish_directory/
--                  attach_directory_to_map). Inserts a 'bulk' job for every
--                  entry in the directory that doesn't already have one
--                  in flight — deliberately EVERY entry, not just ones
--                  missing content, since this backs the type-to-confirm
--                  "regenerate all" admin action, not the quiet auto-fill
--                  path. Sets directories.ai_content_generation_status to
--                  'running' and records the total for a progress readout.
--
-- PREREQUISITES (must already exist — created by
-- 20260610120000_sync_sheet_listings_daily_cron.sql):
--   select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'project_url');
--   select vault.create_secret('<SUPABASE_ANON_KEY>', 'anon_key');
-- This migration reuses those same two vault secrets rather than creating
-- new ones.
--
-- NOTE: requires the process_entry_content_jobs Edge Function (and the
-- ANTHROPIC_API_KEY secret it needs) to be deployed to the same project
-- BEFORE the first dispatch tick fires, or every tick will just log a
-- fetch failure with nothing to process yet.
--
-- Affected tables: none (functions + cron.job only)
-- Rollback: _20260906130000_entry_content_generation_worker_cron.rollback.sql
-- Author: Claude Code
-- Date: 2026-09-06
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- RUN ORDER: dry-run (BEGIN/ROLLBACK) -> apply on STAGING (beqejxneehilplrtpntn)
-- -> deploy process_entry_content_jobs + generate_entry_content +
-- ANTHROPIC_API_KEY on staging -> run POST-MIGRATION VERIFICATION -> only
-- then apply on PRODUCTION (gxixwdjfmegxcxfeflro) after explicit sign-off.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'entry_content_jobs'
  ) then
    raise exception 'ABORT: table public.entry_content_jobs does not exist — apply 20260906120000_create_directory_ai_content_generation.sql first';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'project_url') then
    raise exception 'ABORT: vault secret "project_url" does not exist — see prerequisites above';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'anon_key') then
    raise exception 'ABORT: vault secret "anon_key" does not exist — see prerequisites above';
  end if;
end $$;

-- Idempotency guard
do $$
begin
  if exists (select 1 from pg_proc where proname = 'claim_pending_entry_content_jobs') then
    raise exception 'ABORT: claim_pending_entry_content_jobs already exists — migration may have already run';
  end if;
  if exists (select 1 from pg_proc where proname = 'enqueue_directory_entry_content_jobs') then
    raise exception 'ABORT: enqueue_directory_entry_content_jobs already exists — migration may have already run';
  end if;
  if exists (select 1 from cron.job where jobname = 'process-entry-content-dispatch') then
    raise exception 'ABORT: process-entry-content-dispatch cron job already exists — migration may have already run';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

-- 1) Atomic batch claim — SKIP LOCKED means two overlapping invocations
-- can never claim the same row.
create or replace function public.claim_pending_entry_content_jobs(p_batch_size integer default 5)
returns setof public.entry_content_jobs
language sql
security definer
set search_path = public
as $$
  update public.entry_content_jobs
  set status = 'processing', started_at = now()
  where id in (
    select id from public.entry_content_jobs
    where status = 'pending'
    order by created_at
    limit greatest(p_batch_size, 0)
    for update skip locked
  )
  returning *;
$$;

comment on function public.claim_pending_entry_content_jobs(integer) is
  'Atomically claims up to p_batch_size pending entry_content_jobs rows (FOR UPDATE SKIP LOCKED), marking them processing. Called by the process_entry_content_jobs Edge Function via the service-role client. Not exposed to authenticated/anon.';

revoke all on function public.claim_pending_entry_content_jobs(integer) from public, authenticated, anon;
grant execute on function public.claim_pending_entry_content_jobs(integer) to service_role;

-- 2) Dispatch tick — every 2 minutes, invoke the worker Edge Function.
select cron.schedule(
  'process-entry-content-dispatch',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1)
           || '/functions/v1/process_entry_content_jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 3) Client-callable bulk enqueue — backs the directory dashboard's
-- type-to-confirm "Generate all entry content" action. Deliberately queues
-- EVERY entry (not just ones missing content) — that's the whole point of
-- the type-to-confirm friction on the caller side; every prior write is
-- still recoverable via directory_entry_versions.
create or replace function public.enqueue_directory_entry_content_jobs(p_directory_id text)
returns table (queued_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client text;
  v_total  integer;
begin
  select client_id into v_client from public.directories where id = p_directory_id;
  if not found then
    raise exception 'Directory not found';
  end if;

  if not (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
    or exists (select 1 from public.contacts where user_id = auth.uid() and client_id = v_client)
  ) then
    raise exception 'Access denied';
  end if;

  insert into public.entry_content_jobs (entry_id, directory_id, status, requested_by)
  select e.id, e.directory_id, 'pending', 'bulk'
  from public.directory_entries e
  where e.directory_id = p_directory_id
    and e.is_active = true
    and not exists (
      select 1 from public.entry_content_jobs j
      where j.entry_id = e.id and j.status in ('pending', 'processing')
    );

  get diagnostics v_total = row_count;

  update public.directories
  set ai_content_generation_status = 'running',
      ai_content_generation_started_at = now(),
      ai_content_generation_error = null,
      ai_content_generation_total = v_total,
      ai_content_generation_processed = 0
  where id = p_directory_id;

  return query select v_total;
end;
$$;

comment on function public.enqueue_directory_entry_content_jobs(text) is
  'Client-callable (admin or own-client contact). Queues a ''bulk'' entry_content_jobs row for every active entry in the directory not already queued/in-flight, and marks directories.ai_content_generation_status running with a total for the progress readout. Backs the "Generate all entry content" type-to-confirm admin action.';

revoke all on function public.enqueue_directory_entry_content_jobs(text) from public, anon;
grant execute on function public.enqueue_directory_entry_content_jobs(text) to authenticated, service_role;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'claim_pending_entry_content_jobs') then
    raise exception 'VERIFY FAILED: claim_pending_entry_content_jobs was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'enqueue_directory_entry_content_jobs') then
    raise exception 'VERIFY FAILED: enqueue_directory_entry_content_jobs was not created';
  end if;
  if not exists (select 1 from cron.job where jobname = 'process-entry-content-dispatch') then
    raise exception 'VERIFY FAILED: process-entry-content-dispatch cron job was not created';
  end if;
  raise notice 'VERIFY PASSED: claim RPC + bulk enqueue RPC + dispatch cron registered';
end $$;

-- Manual smoke test (safe — rolls back its own claim inside a dry-run transaction):
-- select * from public.claim_pending_entry_content_jobs(5);

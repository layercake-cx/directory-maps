-- ============================================================
-- Migration: 20260919130000_directory_seo_metadata_backfill_queue
-- Description: Replaces the inline, per-publish, capped-at-20 SEO metadata
--              backfill added in 20260919120000/generate_directory_site with
--              a proper async queue — the user's own feedback: "20 records
--              is a bit arbitrary... add a feature in the AI tab to backfill
--              all Search metadata... in the same way as the directory
--              content builder in the same tab" (Directory Searchability &
--              AI Metadata plan, Phase 3b). Mirrors
--              20260906120000_create_directory_ai_content_generation.sql +
--              20260906130000_entry_content_generation_worker_cron.sql
--              structurally, combined into one migration here since it's a
--              smaller surface than that pair.
--
--              Adds:
--                - entry_seo_metadata_jobs — async work queue, same shape as
--                  entry_content_jobs. An AFTER INSERT trigger
--                  (enqueue_entry_seo_metadata_job()) enqueues an 'auto' job
--                  whenever a new entry is missing any of the six drafted
--                  fields — no directory opt-in needed (unlike content
--                  generation, there's no per-directory prompt to configure
--                  for SEO metadata, so this always runs).
--                - directories.seo_metadata_backfill_status/_started_at/
--                  _completed_at/_error/_total/_processed — persistent
--                  status for the AI tab's "Backfill missing metadata"
--                  bulk action, same shape as ai_content_generation_*.
--                - claim_pending_entry_seo_metadata_jobs(p_batch_size) —
--                  service-role-only atomic batch claim.
--                - enqueue_directory_entry_seo_metadata_jobs(p_directory_id)
--                  — client-callable bulk enqueue. Deliberately different
--                  from enqueue_directory_entry_content_jobs: this queues
--                  ONLY entries actually missing a field, never entries that
--                  already have everything, since the whole point of this
--                  feature (unlike "regenerate all") is that it can never
--                  overwrite existing data — no type-to-confirm friction
--                  needed on the client side either, for the same reason.
--                - count_entries_missing_seo_metadata(p_directory_id) —
--                  plain SQL function, no elevated privilege (relies on
--                  directory_entries' own RLS), backs the AI tab's "N
--                  entries missing metadata" readout.
--                - A pg_cron job dispatching process_entry_seo_metadata_jobs
--                  every 2 minutes, same cadence as the content queue.
--
--              generate_directory_site's own inline backfill (added by the
--              previous migration, now superseded) is removed in the same
--              deploy as this migration — see that commit for the
--              Edge Function diff. That inline backfill's one column,
--              directory_entries.seo_metadata_ai_generated_at, is kept and
--              reused here (set by the new worker instead).
--
-- PREREQUISITES (must already exist — created by
-- 20260610120000_sync_sheet_listings_daily_cron.sql, already relied on by
-- 20260906130000_entry_content_generation_worker_cron.sql):
--   select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'project_url');
--   select vault.create_secret('<SUPABASE_ANON_KEY>', 'anon_key');
--
-- NOTE: requires the process_entry_seo_metadata_jobs Edge Function to be
-- deployed to the same project before the first dispatch tick fires, or
-- every tick just logs a fetch failure with nothing to process yet.
--
-- Affected tables: directories (6 new columns); new table
--                  entry_seo_metadata_jobs
-- Rollback: _20260919130000_directory_seo_metadata_backfill_queue.rollback.sql
-- Author: Claude Code
-- Date: 2026-09-19
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- RUN ORDER: dry-run (BEGIN/ROLLBACK) -> apply on STAGING (beqejxneehilplrtpntn)
-- -> deploy process_entry_seo_metadata_jobs + redeploy generate_directory_site
-- (with its inline backfill removed) on staging -> run POST-MIGRATION
-- VERIFICATION -> only then apply on PRODUCTION (gxixwdjfmegxcxfeflro) after
-- explicit sign-off.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directories') then
    raise exception 'ABORT: table public.directories does not exist';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_entries') then
    raise exception 'ABORT: table public.directory_entries does not exist';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directory_entries' and column_name = 'seo_metadata_ai_generated_at') then
    raise exception 'ABORT: directory_entries.seo_metadata_ai_generated_at does not exist — apply 20260919120000_directory_entry_seo_metadata_ai_flag.sql first';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'entry_seo_metadata_jobs') then
    raise exception 'ABORT: public.entry_seo_metadata_jobs already exists — migration may have already run';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directories' and column_name = 'seo_metadata_backfill_status') then
    raise exception 'ABORT: directories.seo_metadata_backfill_status already exists — migration may have already run';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'project_url') then
    raise exception 'ABORT: vault secret "project_url" does not exist — see prerequisites above';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'anon_key') then
    raise exception 'ABORT: vault secret "anon_key" does not exist — see prerequisites above';
  end if;
end $$;

-- Row counts — inspect before proceeding
select
  'directories' as tbl, count(*) as rows from public.directories union all
  select 'directory_entries', count(*) from public.directory_entries
order by tbl;
-- Save this output. Must be UNCHANGED after (additive only).


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

-- 1) Directory-wide bulk-run status, mirrors ai_content_generation_*
alter table public.directories
  add column seo_metadata_backfill_status text null check (seo_metadata_backfill_status is null or seo_metadata_backfill_status in ('running', 'succeeded', 'failed')),
  add column seo_metadata_backfill_started_at timestamptz null,
  add column seo_metadata_backfill_completed_at timestamptz null,
  add column seo_metadata_backfill_error text null,
  add column seo_metadata_backfill_total integer null,
  add column seo_metadata_backfill_processed integer null;

comment on column public.directories.seo_metadata_backfill_status is
  'Status of the most recent "Backfill missing metadata" bulk run from the AI tab. Null = never run. Set by process_entry_seo_metadata_jobs (service role) as its queue for this directory drains, not by any client RPC.';
comment on column public.directories.seo_metadata_backfill_total is
  'Number of entries queued in the most recent bulk run (only entries that were actually missing a field), for a processed/total progress readout while seo_metadata_backfill_status = ''running''.';

-- 2) Async work queue (mirrors entry_content_jobs)
create table public.entry_seo_metadata_jobs (
  id            uuid primary key default gen_random_uuid(),
  entry_id      text not null references public.directory_entries(id) on delete cascade,
  directory_id  text not null references public.directories(id) on delete cascade,
  status        text not null default 'pending'
                  check (status in ('pending', 'processing', 'completed', 'failed')),
  requested_by  text not null check (requested_by in ('auto', 'bulk')),
  attempt_count integer not null default 0,
  error         text null,
  created_at    timestamptz not null default now(),
  started_at    timestamptz null,
  completed_at  timestamptz null
);

create index idx_entry_seo_metadata_jobs_status on public.entry_seo_metadata_jobs(status);
create index idx_entry_seo_metadata_jobs_entry_id on public.entry_seo_metadata_jobs(entry_id);
create index idx_entry_seo_metadata_jobs_directory_id on public.entry_seo_metadata_jobs(directory_id);
create unique index idx_entry_seo_metadata_jobs_entry_inflight
  on public.entry_seo_metadata_jobs(entry_id)
  where status in ('pending', 'processing');

comment on table public.entry_seo_metadata_jobs is
  'Async work queue for entry SEO/social metadata backfill (auto-on-empty-insert, and the AI tab''s "Backfill missing metadata" bulk action). A scheduled worker polls status = ''pending'' in small batches, calls Claude, and writes only the fields that were actually empty to directory_entries. The single-entry "Generate with AI" button on the Search & Metadata tab bypasses this queue entirely (synchronous Edge Function call).';

-- 3) Trigger: enqueue an 'auto' job whenever a new entry is missing any
-- drafted field. No directory opt-in check — unlike content generation,
-- there's no per-directory prompt to gate this on.
create or replace function public.enqueue_entry_seo_metadata_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.meta_title is null or btrim(new.meta_title) = '')
    or (new.meta_description is null or btrim(new.meta_description) = '')
    or (new.keywords is null or btrim(new.keywords) = '')
    or (new.og_title is null or btrim(new.og_title) = '')
    or (new.og_description is null or btrim(new.og_description) = '')
    or (new.ai_summary is null or btrim(new.ai_summary) = '')
  then
    insert into public.entry_seo_metadata_jobs (entry_id, directory_id, status, requested_by)
    values (new.id, new.directory_id, 'pending', 'auto');
  end if;
  return new;
end;
$$;

comment on function public.enqueue_entry_seo_metadata_job() is
  'AFTER INSERT hook on public.directory_entries. Enqueues one pending entry_seo_metadata_jobs row whenever the new entry is missing any of the six drafted SEO/social fields. Never fires on UPDATE, so existing metadata is never silently regenerated.';

drop trigger if exists trg_enqueue_entry_seo_metadata_job on public.directory_entries;
create trigger trg_enqueue_entry_seo_metadata_job
  after insert on public.directory_entries
  for each row
  execute function public.enqueue_entry_seo_metadata_job();

-- 4) RLS — admin-only direct access, matching entry_content_jobs.
alter table public.entry_seo_metadata_jobs enable row level security;

create policy "entry_seo_metadata_jobs_admin_all"
  on public.entry_seo_metadata_jobs for all
  to authenticated
  using (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  );

grant select, insert, update, delete on table public.entry_seo_metadata_jobs to authenticated, service_role;

-- 5) Atomic batch claim — SKIP LOCKED, mirrors claim_pending_entry_content_jobs.
create or replace function public.claim_pending_entry_seo_metadata_jobs(p_batch_size integer default 5)
returns setof public.entry_seo_metadata_jobs
language sql
security definer
set search_path = public
as $$
  update public.entry_seo_metadata_jobs
  set status = 'processing', started_at = now()
  where id in (
    select id from public.entry_seo_metadata_jobs
    where status = 'pending'
    order by created_at
    limit greatest(p_batch_size, 0)
    for update skip locked
  )
  returning *;
$$;

comment on function public.claim_pending_entry_seo_metadata_jobs(integer) is
  'Atomically claims up to p_batch_size pending entry_seo_metadata_jobs rows, marking them processing. Called by process_entry_seo_metadata_jobs via the service-role client. Not exposed to authenticated/anon.';

revoke all on function public.claim_pending_entry_seo_metadata_jobs(integer) from public, authenticated, anon;
grant execute on function public.claim_pending_entry_seo_metadata_jobs(integer) to service_role;

-- 6) Read-only count for the AI tab's "N entries missing metadata" readout.
-- No security definer — relies entirely on directory_entries' own RLS, so
-- an admin or the entry's own client can call this and nobody else, with no
-- separate access-check logic to keep in sync with that RLS policy.
create or replace function public.count_entries_missing_seo_metadata(p_directory_id text)
returns integer
language sql
stable
as $$
  select count(*)::integer
  from public.directory_entries
  where directory_id = p_directory_id
    and is_active = true
    and (
      meta_title is null or btrim(meta_title) = ''
      or meta_description is null or btrim(meta_description) = ''
      or keywords is null or btrim(keywords) = ''
      or og_title is null or btrim(og_title) = ''
      or og_description is null or btrim(og_description) = ''
      or ai_summary is null or btrim(ai_summary) = ''
    );
$$;

comment on function public.count_entries_missing_seo_metadata(text) is
  'Count of active entries missing at least one of the six drafted SEO/social fields. No elevated privilege — relies on the caller''s own directory_entries RLS access, same rows they could already query directly.';

grant execute on function public.count_entries_missing_seo_metadata(text) to authenticated, service_role;

-- 7) Client-callable bulk enqueue — backs the AI tab's "Backfill missing
-- metadata" button. Deliberately queues ONLY entries missing a field
-- (unlike enqueue_directory_entry_content_jobs' deliberate "every entry" for
-- its type-to-confirm "regenerate all" action) — this feature can never
-- overwrite existing data, so no confirm-friction is needed on the client
-- side either.
create or replace function public.enqueue_directory_entry_seo_metadata_jobs(p_directory_id text)
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

  insert into public.entry_seo_metadata_jobs (entry_id, directory_id, status, requested_by)
  select e.id, e.directory_id, 'pending', 'bulk'
  from public.directory_entries e
  where e.directory_id = p_directory_id
    and e.is_active = true
    and (
      e.meta_title is null or btrim(e.meta_title) = ''
      or e.meta_description is null or btrim(e.meta_description) = ''
      or e.keywords is null or btrim(e.keywords) = ''
      or e.og_title is null or btrim(e.og_title) = ''
      or e.og_description is null or btrim(e.og_description) = ''
      or e.ai_summary is null or btrim(e.ai_summary) = ''
    )
    and not exists (
      select 1 from public.entry_seo_metadata_jobs j
      where j.entry_id = e.id and j.status in ('pending', 'processing')
    );

  get diagnostics v_total = row_count;

  update public.directories
  set seo_metadata_backfill_status = 'running',
      seo_metadata_backfill_started_at = now(),
      seo_metadata_backfill_completed_at = null,
      seo_metadata_backfill_error = null,
      seo_metadata_backfill_total = v_total,
      seo_metadata_backfill_processed = 0
  where id = p_directory_id;

  return query select v_total;
end;
$$;

comment on function public.enqueue_directory_entry_seo_metadata_jobs(text) is
  'Client-callable (admin or own-client contact). Queues a ''bulk'' entry_seo_metadata_jobs row for every active entry in the directory that is missing at least one drafted field and not already queued/in-flight, and marks directories.seo_metadata_backfill_status running with a total for the progress readout. Backs the AI tab''s "Backfill missing metadata" action — no type-to-confirm needed since it can never overwrite existing data.';

revoke all on function public.enqueue_directory_entry_seo_metadata_jobs(text) from public, anon;
grant execute on function public.enqueue_directory_entry_seo_metadata_jobs(text) to authenticated, service_role;

-- 8) Dispatch tick — every 2 minutes, invoke the worker Edge Function.
select cron.schedule(
  'process-entry-seo-metadata-dispatch',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1)
           || '/functions/v1/process_entry_seo_metadata_jobs',
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
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directories' and column_name = 'seo_metadata_backfill_status') then
    raise exception 'VERIFY FAILED: directories.seo_metadata_backfill_status was not created';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'entry_seo_metadata_jobs') then
    raise exception 'VERIFY FAILED: entry_seo_metadata_jobs was not created';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_enqueue_entry_seo_metadata_job') then
    raise exception 'VERIFY FAILED: trg_enqueue_entry_seo_metadata_job was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'claim_pending_entry_seo_metadata_jobs') then
    raise exception 'VERIFY FAILED: claim_pending_entry_seo_metadata_jobs was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'count_entries_missing_seo_metadata') then
    raise exception 'VERIFY FAILED: count_entries_missing_seo_metadata was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'enqueue_directory_entry_seo_metadata_jobs') then
    raise exception 'VERIFY FAILED: enqueue_directory_entry_seo_metadata_jobs was not created';
  end if;
  if not exists (select 1 from cron.job where jobname = 'process-entry-seo-metadata-dispatch') then
    raise exception 'VERIFY FAILED: process-entry-seo-metadata-dispatch cron job was not created';
  end if;
  raise notice 'VERIFY PASSED: SEO metadata backfill queue schema + worker cron created';
end $$;

-- Row counts — must be UNCHANGED (additive only)
select
  'directories' as tbl, count(*) as rows from public.directories union all
  select 'directory_entries', count(*) from public.directory_entries
order by tbl;

-- RLS enabled on the new table
select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = 'entry_seo_metadata_jobs';
-- Must show rowsecurity = true

-- Orphan check — must return 0
select count(*) as orphaned_jobs
  from public.entry_seo_metadata_jobs j
  where not exists (select 1 from public.directory_entries e where e.id = j.entry_id)
     or not exists (select 1 from public.directories d where d.id = j.directory_id);

-- Manual smoke test (safe — rolls back its own claim inside a dry-run transaction):
-- select * from public.claim_pending_entry_seo_metadata_jobs(5);
-- select public.count_entries_missing_seo_metadata('<some-directory-id>');

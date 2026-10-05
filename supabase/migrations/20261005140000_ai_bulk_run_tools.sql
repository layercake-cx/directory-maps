-- ============================================================
-- Migration: 20261005140000_ai_bulk_run_tools
-- Description: Stage 3 of the Integrations / AI Gateway work -- bulk run tooling.
--   1. Stale-job reclaim: both queue claim functions now also re-claim a job
--      stuck in 'processing' for 15+ minutes (a worker crashed mid-job), up to
--      3 attempts, instead of leaving it in flight forever.
--   2. retry_failed_entry_content_jobs / retry_failed_entry_seo_metadata_jobs:
--      re-queue the failed jobs from the directory's latest bulk run (client-callable,
--      admin or own-client contact -- same rule as the enqueue functions).
--   3. get_ai_bulk_run_summary: failed count, first failure reason, and AI usage
--      (requests, tokens, estimated cost) for the directory's latest bulk run, read
--      from the admin-only job tables and ai_usage_events behind an access check.
-- Affected tables: none (functions only; entry_content_jobs / entry_seo_metadata_jobs rows
--   change only when retry is called)
-- Rollback: _20261005140000_ai_bulk_run_tools.rollback.sql
-- Author: Claude Code
-- Date: 2026-10-05
-- ============================================================
--
-- DRY-RUN BLOCK (run this first -- it makes NO persistent changes):
--
--   BEGIN;
--   <paste THE MIGRATION section below>
--   ROLLBACK;
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'entry_content_jobs') then
    raise exception 'ABORT: entry_content_jobs does not exist';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'entry_seo_metadata_jobs') then
    raise exception 'ABORT: entry_seo_metadata_jobs does not exist';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'ai_usage_events') then
    raise exception 'ABORT: ai_usage_events does not exist -- apply 20261005120000_integrations_ai_gateway first';
  end if;
  if exists (select 1 from pg_proc where proname in ('retry_failed_entry_content_jobs', 'retry_failed_entry_seo_metadata_jobs', 'get_ai_bulk_run_summary')) then
    raise exception 'ABORT: one of the new functions already exists -- migration may have already run';
  end if;
end $$;

select 'entry_content_jobs' as tbl, count(*) as rows from public.entry_content_jobs union all
select 'entry_seo_metadata_jobs', count(*) from public.entry_seo_metadata_jobs
order by tbl;
-- Must be UNCHANGED after (functions only).


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- 1) Claim functions: also reclaim jobs stuck in 'processing' ------------------
create or replace function public.claim_pending_entry_content_jobs(p_batch_size integer default 5)
returns setof public.entry_content_jobs
language sql
security definer
set search_path = public
as $$
  update public.entry_content_jobs
  set status = 'processing',
      started_at = now(),
      attempt_count = attempt_count + case when status = 'processing' then 1 else 0 end
  where id in (
    select id from public.entry_content_jobs
    where status = 'pending'
       or (status = 'processing' and started_at < now() - interval '15 minutes' and attempt_count < 3)
    order by created_at
    limit greatest(p_batch_size, 0)
    for update skip locked
  )
  returning *;
$$;

create or replace function public.claim_pending_entry_seo_metadata_jobs(p_batch_size integer default 5)
returns setof public.entry_seo_metadata_jobs
language sql
security definer
set search_path = public
as $$
  update public.entry_seo_metadata_jobs
  set status = 'processing',
      started_at = now(),
      attempt_count = attempt_count + case when status = 'processing' then 1 else 0 end
  where id in (
    select id from public.entry_seo_metadata_jobs
    where status = 'pending'
       or (status = 'processing' and started_at < now() - interval '15 minutes' and attempt_count < 3)
    order by created_at
    limit greatest(p_batch_size, 0)
    for update skip locked
  )
  returning *;
$$;

comment on function public.claim_pending_entry_content_jobs(integer) is
  'Atomically claims up to p_batch_size pending entry_content_jobs rows (FOR UPDATE SKIP LOCKED), marking them processing. Also reclaims jobs stuck in processing for 15+ minutes (crashed worker), up to 3 attempts. Service role only.';
comment on function public.claim_pending_entry_seo_metadata_jobs(integer) is
  'Atomically claims up to p_batch_size pending entry_seo_metadata_jobs rows, marking them processing. Also reclaims jobs stuck in processing for 15+ minutes (crashed worker), up to 3 attempts. Service role only.';

-- Grants are unchanged by CREATE OR REPLACE; restate for clarity.
revoke all on function public.claim_pending_entry_content_jobs(integer) from public, authenticated, anon;
revoke all on function public.claim_pending_entry_seo_metadata_jobs(integer) from public, authenticated, anon;
grant execute on function public.claim_pending_entry_content_jobs(integer) to service_role;
grant execute on function public.claim_pending_entry_seo_metadata_jobs(integer) to service_role;


-- 2) Retry failed jobs from the latest bulk run --------------------------------
create or replace function public.retry_failed_entry_content_jobs(p_directory_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client  text;
  v_started timestamptz;
  v_n       integer;
begin
  select client_id, ai_content_generation_started_at into v_client, v_started
  from public.directories where id = p_directory_id;
  if not found then
    raise exception 'Directory not found';
  end if;

  if not (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
    or exists (select 1 from public.contacts where user_id = auth.uid() and client_id = v_client)
  ) then
    raise exception 'Access denied';
  end if;

  if v_started is null then
    return 0;
  end if;

  update public.entry_content_jobs j
  set status = 'pending', error = null, started_at = null, completed_at = null
  where j.directory_id = p_directory_id
    and j.requested_by = 'bulk'
    and j.status = 'failed'
    and j.created_at >= v_started
    and not exists (
      select 1 from public.entry_content_jobs o
      where o.entry_id = j.entry_id and o.status in ('pending', 'processing')
    );
  get diagnostics v_n = row_count;

  if v_n > 0 then
    update public.directories
    set ai_content_generation_status = 'running',
        ai_content_generation_error = null,
        ai_content_generation_processed = greatest(coalesce(ai_content_generation_processed, 0) - v_n, 0)
    where id = p_directory_id;
  end if;

  return v_n;
end;
$$;

create or replace function public.retry_failed_entry_seo_metadata_jobs(p_directory_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client  text;
  v_started timestamptz;
  v_n       integer;
begin
  select client_id, seo_metadata_backfill_started_at into v_client, v_started
  from public.directories where id = p_directory_id;
  if not found then
    raise exception 'Directory not found';
  end if;

  if not (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
    or exists (select 1 from public.contacts where user_id = auth.uid() and client_id = v_client)
  ) then
    raise exception 'Access denied';
  end if;

  if v_started is null then
    return 0;
  end if;

  update public.entry_seo_metadata_jobs j
  set status = 'pending', error = null, started_at = null, completed_at = null
  where j.directory_id = p_directory_id
    and j.requested_by = 'bulk'
    and j.status = 'failed'
    and j.created_at >= v_started
    and not exists (
      select 1 from public.entry_seo_metadata_jobs o
      where o.entry_id = j.entry_id and o.status in ('pending', 'processing')
    );
  get diagnostics v_n = row_count;

  if v_n > 0 then
    update public.directories
    set seo_metadata_backfill_status = 'running',
        seo_metadata_backfill_error = null,
        seo_metadata_backfill_completed_at = null,
        seo_metadata_backfill_processed = greatest(coalesce(seo_metadata_backfill_processed, 0) - v_n, 0)
    where id = p_directory_id;
  end if;

  return v_n;
end;
$$;

revoke all on function public.retry_failed_entry_content_jobs(text) from public, anon;
revoke all on function public.retry_failed_entry_seo_metadata_jobs(text) from public, anon;
grant execute on function public.retry_failed_entry_content_jobs(text) to authenticated, service_role;
grant execute on function public.retry_failed_entry_seo_metadata_jobs(text) to authenticated, service_role;

comment on function public.retry_failed_entry_content_jobs(text) is
  'Client-callable (admin or own-client contact). Re-queues the failed bulk entry_content_jobs from the directory''s latest bulk run (skipping entries already re-queued) and marks the run running again. Returns the number re-queued.';
comment on function public.retry_failed_entry_seo_metadata_jobs(text) is
  'Client-callable (admin or own-client contact). Re-queues the failed bulk entry_seo_metadata_jobs from the directory''s latest backfill run and marks the run running again. Returns the number re-queued.';


-- 3) Latest bulk run summary: failures + AI usage ------------------------------
create or replace function public.get_ai_bulk_run_summary(p_directory_id text, p_target text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_client   text;
  v_started  timestamptz;
  v_feature  text;
  v_failed   integer := 0;
  v_error    text;
  u          record;
begin
  if p_target not in ('content', 'seo') then
    raise exception 'p_target must be content or seo';
  end if;

  select client_id,
         case p_target when 'content' then ai_content_generation_started_at else seo_metadata_backfill_started_at end
    into v_client, v_started
  from public.directories where id = p_directory_id;
  if not found then
    raise exception 'Directory not found';
  end if;

  if not (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
    or exists (select 1 from public.contacts where user_id = auth.uid() and client_id = v_client)
  ) then
    raise exception 'Access denied';
  end if;

  if v_started is null then
    return jsonb_build_object('failed', 0, 'first_error', null, 'requests', 0,
      'input_tokens', 0, 'output_tokens', 0, 'total_tokens', 0, 'estimated_cost', null, 'currency', null);
  end if;

  v_feature := case p_target when 'content' then 'content_generation' else 'seo_metadata' end;

  if p_target = 'content' then
    select count(*), (array_agg(error order by created_at) filter (where error is not null))[1]
      into v_failed, v_error
    from public.entry_content_jobs
    where directory_id = p_directory_id and requested_by = 'bulk' and status = 'failed' and created_at >= v_started;
  else
    select count(*), (array_agg(error order by created_at) filter (where error is not null))[1]
      into v_failed, v_error
    from public.entry_seo_metadata_jobs
    where directory_id = p_directory_id and requested_by = 'bulk' and status = 'failed' and created_at >= v_started;
  end if;

  select count(*) as requests,
         coalesce(sum(input_tokens + cached_input_tokens), 0) as input_tokens,
         coalesce(sum(output_tokens), 0) as output_tokens,
         coalesce(sum(total_tokens), 0) as total_tokens,
         sum(estimated_cost) as estimated_cost,
         max(estimated_cost_currency) as currency
    into u
  from public.ai_usage_events
  where client_id = v_client
    and product_instance_id = p_directory_id
    and feature = v_feature
    and batch_job_id is not null
    and created_at >= v_started;

  return jsonb_build_object(
    'failed', v_failed,
    'first_error', left(v_error, 300),
    'requests', u.requests,
    'input_tokens', u.input_tokens,
    'output_tokens', u.output_tokens,
    'total_tokens', u.total_tokens,
    'estimated_cost', u.estimated_cost,
    'currency', u.currency
  );
end;
$$;

revoke all on function public.get_ai_bulk_run_summary(text, text) from public, anon;
grant execute on function public.get_ai_bulk_run_summary(text, text) to authenticated, service_role;

comment on function public.get_ai_bulk_run_summary(text, text) is
  'Client-callable (admin or own-client contact). For the directory''s latest bulk run (p_target content|seo): failed job count, the first failure reason, and Layercake-attributable AI usage (requests, tokens, estimated cost where model prices are known). Reads admin-only job tables behind an access check.';


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if (select count(*) from pg_proc where proname in ('retry_failed_entry_content_jobs', 'retry_failed_entry_seo_metadata_jobs', 'get_ai_bulk_run_summary')) <> 3 then
    raise exception 'VERIFY FAILED: expected 3 new functions';
  end if;
  if has_function_privilege('anon', 'public.get_ai_bulk_run_summary(text, text)', 'execute') then
    raise exception 'VERIFY FAILED: get_ai_bulk_run_summary executable by anon';
  end if;
  if has_function_privilege('authenticated', 'public.claim_pending_entry_content_jobs(integer)', 'execute') then
    raise exception 'VERIFY FAILED: claim function executable by authenticated';
  end if;
  raise notice 'VERIFY PASSED';
end $$;

select 'entry_content_jobs' as tbl, count(*) as rows from public.entry_content_jobs union all
select 'entry_seo_metadata_jobs', count(*) from public.entry_seo_metadata_jobs
order by tbl;
-- Must match the pre-migration counts.

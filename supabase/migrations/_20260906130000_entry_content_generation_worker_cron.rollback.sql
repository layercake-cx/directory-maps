-- ============================================================
-- Rollback: 20260906130000_entry_content_generation_worker_cron
-- Reverses: unschedules the dispatch cron job, drops the claim RPC and the
--           bulk-enqueue RPC.
--
-- Safe to roll back at any time — any jobs already 'processing' when this
-- runs will simply sit unclaimed (not lost; still queryable/re-claimable
-- once the migration is re-applied).
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from cron.job where jobname = 'process-entry-content-dispatch'
  ) then
    raise exception 'ABORT: nothing to roll back — process-entry-content-dispatch cron job does not exist';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

select cron.unschedule(jobid)
from cron.job
where jobname = 'process-entry-content-dispatch';

drop function if exists public.enqueue_directory_entry_content_jobs(text);
drop function if exists public.claim_pending_entry_content_jobs(integer);


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from cron.job where jobname = 'process-entry-content-dispatch'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: process-entry-content-dispatch cron job still exists';
  end if;
  if exists (
    select 1 from pg_proc where proname = 'claim_pending_entry_content_jobs'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: claim_pending_entry_content_jobs still exists';
  end if;
  if exists (
    select 1 from pg_proc where proname = 'enqueue_directory_entry_content_jobs'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: enqueue_directory_entry_content_jobs still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

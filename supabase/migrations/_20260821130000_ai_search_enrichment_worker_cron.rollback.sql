-- ============================================================
-- Rollback: 20260821130000_ai_search_enrichment_worker_cron
-- Reverses: unschedules the dispatch cron job and drops the claim RPC.
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
    select 1 from cron.job where jobname = 'process-listing-enrichment-dispatch'
  ) then
    raise exception 'ABORT: nothing to roll back — process-listing-enrichment-dispatch cron job does not exist';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

select cron.unschedule(jobid)
from cron.job
where jobname = 'process-listing-enrichment-dispatch';

drop function if exists public.claim_pending_listing_enrichment_jobs(integer);


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from cron.job where jobname = 'process-listing-enrichment-dispatch'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: process-listing-enrichment-dispatch cron job still exists';
  end if;
  if exists (
    select 1 from pg_proc where proname = 'claim_pending_listing_enrichment_jobs'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: claim_pending_listing_enrichment_jobs still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

-- ============================================================
-- Rollback: 20260919130000_directory_seo_metadata_backfill_queue
-- Reverses: unschedules the dispatch cron job, drops the trigger, both
--           RPCs and the count function, drops entry_seo_metadata_jobs,
--           drops the six directories.seo_metadata_backfill_* columns.
--
-- Safe to roll back at any time — any jobs already 'processing' when this
-- runs are simply dropped along with the table; nothing outside this
-- feature depends on them. directory_entries.seo_metadata_ai_generated_at
-- (from the previous migration) is NOT touched by this rollback — it's
-- reused by this feature, not owned by it.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'entry_seo_metadata_jobs') then
    raise exception 'ABORT: nothing to roll back — entry_seo_metadata_jobs does not exist';
  end if;
end $$;

-- Data-loss guard — surfaces any in-progress or queued work before it's dropped.
select status, count(*) from public.entry_seo_metadata_jobs group by status;
-- If this shows pending/processing rows, confirm losing that queued work is acceptable.


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

select cron.unschedule(jobid)
from cron.job
where jobname = 'process-entry-seo-metadata-dispatch';

drop function if exists public.enqueue_directory_entry_seo_metadata_jobs(text);
drop function if exists public.count_entries_missing_seo_metadata(text);
drop function if exists public.claim_pending_entry_seo_metadata_jobs(integer);

drop trigger if exists trg_enqueue_entry_seo_metadata_job on public.directory_entries;
drop function if exists public.enqueue_entry_seo_metadata_job();

drop table if exists public.entry_seo_metadata_jobs;

alter table public.directories
  drop column if exists seo_metadata_backfill_status,
  drop column if exists seo_metadata_backfill_started_at,
  drop column if exists seo_metadata_backfill_completed_at,
  drop column if exists seo_metadata_backfill_error,
  drop column if exists seo_metadata_backfill_total,
  drop column if exists seo_metadata_backfill_processed;


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from cron.job where jobname = 'process-entry-seo-metadata-dispatch') then
    raise exception 'ROLLBACK VERIFY FAILED: process-entry-seo-metadata-dispatch cron job still exists';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'entry_seo_metadata_jobs') then
    raise exception 'ROLLBACK VERIFY FAILED: entry_seo_metadata_jobs still exists';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directories' and column_name = 'seo_metadata_backfill_status') then
    raise exception 'ROLLBACK VERIFY FAILED: directories.seo_metadata_backfill_status still exists';
  end if;
  if exists (select 1 from pg_proc where proname = 'enqueue_entry_seo_metadata_job') then
    raise exception 'ROLLBACK VERIFY FAILED: enqueue_entry_seo_metadata_job still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

select 'directories' as tbl, count(*) as rows from public.directories union all
  select 'directory_entries', count(*) from public.directory_entries
order by tbl;

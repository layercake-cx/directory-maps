-- ============================================================
-- Rollback: 20260906120000_create_directory_ai_content_generation
-- Reverses: drops the trg_enqueue_entry_content_job trigger + function,
--           drops directory_entry_versions and entry_content_jobs
--           (including their data), and drops the new directories/
--           directory_entries columns.
--
-- Data-loss warning: this permanently deletes any generation jobs and
-- version history already recorded. If any directory has real version
-- history, back it up (see safety check below) before rolling back.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directories'
      and column_name = 'ai_content_prompt'
  ) then
    raise exception 'ABORT: nothing to roll back — directories.ai_content_prompt does not exist';
  end if;

  -- Data-loss guard — abort if any real version history exists, since
  -- dropping the table destroys it with no recovery path.
  if exists (select 1 from public.directory_entry_versions limit 1) then
    raise exception
      'ABORT: directory_entry_versions has rows. Export/back up its contents before '
      'rolling back — this rollback drops the table and its data. '
      'To proceed anyway, remove this check and re-run.';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop trigger if exists trg_enqueue_entry_content_job on public.directory_entries;
drop function if exists public.enqueue_entry_content_job();

drop table if exists public.directory_entry_versions;
drop table if exists public.entry_content_jobs;

alter table public.directory_entries
  drop column if exists ai_content_generated_at;

alter table public.directories
  drop column if exists ai_content_prompt,
  drop column if exists ai_content_generation_status,
  drop column if exists ai_content_generation_started_at,
  drop column if exists ai_content_generated_at,
  drop column if exists ai_content_generation_error,
  drop column if exists ai_content_generation_total,
  drop column if exists ai_content_generation_processed;


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directories'
      and column_name = 'ai_content_prompt'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: directories.ai_content_prompt still exists';
  end if;
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'entry_content_jobs'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: entry_content_jobs still exists';
  end if;
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'directory_entry_versions'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: directory_entry_versions still exists';
  end if;
  if exists (
    select 1 from pg_trigger where tgname = 'trg_enqueue_entry_content_job'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: trg_enqueue_entry_content_job still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

-- Row counts — core tables must be unchanged
select
  'directories' as tbl, count(*) as rows from public.directories union all
  select 'directory_entries', count(*) from public.directory_entries
order by tbl;

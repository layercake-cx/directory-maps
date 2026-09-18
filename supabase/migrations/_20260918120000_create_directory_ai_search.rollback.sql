-- ============================================================
-- Rollback: 20260918120000_create_directory_ai_search
-- Reverses: drops directory_ai_search_requests (including its data) and
--           drops the two new directories columns.
--
-- Data-loss warning: this permanently deletes the rate-limit request log.
-- That table holds no user-facing data (no query text, no results — see the
-- forward migration's comment), so there is nothing to back up; the only
-- effect of losing it is that the next real search after rollback starts a
-- fresh rate-limit window.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directories'
      and column_name = 'ai_search_prompt'
  ) then
    raise exception 'ABORT: nothing to roll back — directories.ai_search_prompt does not exist';
  end if;

  -- Data-loss guard — abort if any directory has real search instructions
  -- configured, so an accidental rollback doesn't silently discard admin
  -- work without at least surfacing that it's about to.
  if exists (select 1 from public.directories where ai_search_prompt is not null and btrim(ai_search_prompt) <> '') then
    raise exception
      'ABORT: at least one directory has ai_search_prompt set. Export/record its contents before '
      'rolling back — this rollback drops the column and its data. '
      'To proceed anyway, remove this check and re-run.';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop table if exists public.directory_ai_search_requests;

alter table public.directories
  drop column if exists ai_search_prompt,
  drop column if exists ai_search_web_enabled;


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directories'
      and column_name = 'ai_search_prompt'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: directories.ai_search_prompt still exists';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directories'
      and column_name = 'ai_search_web_enabled'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: directories.ai_search_web_enabled still exists';
  end if;
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'directory_ai_search_requests'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: directory_ai_search_requests still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

-- Row counts — core tables must be unchanged
select
  'directories' as tbl, count(*) as rows from public.directories union all
  select 'directory_entries', count(*) from public.directory_entries
order by tbl;

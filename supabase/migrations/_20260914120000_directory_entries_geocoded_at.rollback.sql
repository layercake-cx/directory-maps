-- ============================================================
-- Rollback: 20260914120000_directory_entries_geocoded_at
-- Reverses: adds geocoded_at to directory_entries
-- ============================================================

-- PRE-ROLLBACK CHECK
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_entries' and column_name = 'geocoded_at'
  ) then
    raise exception 'ABORT: column geocoded_at does not exist — nothing to roll back';
  end if;

  -- Safety: refuse if any rows have data in this column
  -- (comment out only if you are certain the data can be discarded)
  if exists (
    select 1 from public.directory_entries
    where geocoded_at is not null
    limit 1
  ) then
    raise exception 'ABORT: geocoded_at has live data — back it up before rolling back. '
      'To override, delete this check and re-run.';
  end if;
end $$;

-- THE ROLLBACK
alter table public.directory_entries
  drop column if exists geocoded_at;

-- POST-ROLLBACK VERIFICATION
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_entries' and column_name = 'geocoded_at'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: column geocoded_at still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED: column removed';
end $$;

-- ============================================================
-- Rollback: 20260829160000_directory_entry_panel_style_fields
-- Reverses: adds panel_image_url/panel_background_color to directory_entries
-- ============================================================

-- PRE-ROLLBACK CHECK
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_entries' and column_name = 'panel_image_url'
  ) then
    raise exception 'ABORT: column panel_image_url does not exist — nothing to roll back';
  end if;

  -- Safety: refuse if any rows have data in these columns
  -- (comment out only if you are certain the data can be discarded)
  if exists (
    select 1 from public.directory_entries
    where panel_image_url is not null
       or panel_background_color is not null
    limit 1
  ) then
    raise exception 'ABORT: one or more of these columns has live data — back it up before rolling back. '
      'To override, delete this check and re-run.';
  end if;
end $$;

-- THE ROLLBACK
alter table public.directory_entries
  drop column if exists panel_image_url,
  drop column if exists panel_background_color;

-- POST-ROLLBACK VERIFICATION
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_entries' and column_name = 'panel_image_url'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: column panel_image_url still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED: both columns removed';
end $$;

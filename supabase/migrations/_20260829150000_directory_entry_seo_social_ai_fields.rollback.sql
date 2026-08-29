-- ============================================================
-- Rollback: 20260829150000_directory_entry_seo_social_ai_fields
-- Reverses: adds og_title/og_description/og_image_url/twitter_card_type/
--           canonical_url/keywords/ai_summary to directory_entries
-- ============================================================

-- PRE-ROLLBACK CHECK
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_entries' and column_name = 'og_title'
  ) then
    raise exception 'ABORT: column og_title does not exist — nothing to roll back';
  end if;

  -- Safety: refuse if any rows have data in these columns
  -- (comment out only if you are certain the data can be discarded)
  if exists (
    select 1 from public.directory_entries
    where og_title is not null
       or og_description is not null
       or og_image_url is not null
       or twitter_card_type is not null
       or canonical_url is not null
       or keywords is not null
       or ai_summary is not null
    limit 1
  ) then
    raise exception 'ABORT: one or more of these columns has live data — back it up before rolling back. '
      'To override, delete this check and re-run.';
  end if;
end $$;

-- THE ROLLBACK
alter table public.directory_entries drop constraint if exists directory_entries_twitter_card_type_check;
alter table public.directory_entries
  drop column if exists og_title,
  drop column if exists og_description,
  drop column if exists og_image_url,
  drop column if exists twitter_card_type,
  drop column if exists canonical_url,
  drop column if exists keywords,
  drop column if exists ai_summary;

-- POST-ROLLBACK VERIFICATION
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_entries' and column_name = 'og_title'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: column og_title still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED: all seven columns removed';
end $$;

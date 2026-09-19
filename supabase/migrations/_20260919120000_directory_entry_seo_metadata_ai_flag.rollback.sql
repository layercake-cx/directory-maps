-- ============================================================
-- Rollback: 20260919120000_directory_entry_seo_metadata_ai_flag
-- Reverses: adding directory_entries.seo_metadata_ai_generated_at
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directory_entries' and column_name = 'seo_metadata_ai_generated_at') then
    raise exception 'ABORT: nothing to roll back — directory_entries.seo_metadata_ai_generated_at does not exist';
  end if;
end $$;

-- Data-loss guard — this column is dropped below, so surface anything set first.
select id, name, seo_metadata_ai_generated_at from public.directory_entries where seo_metadata_ai_generated_at is not null;
-- If this returns rows, confirm the loss of those values is acceptable before proceeding
-- (the metadata text itself is untouched by this rollback — only the "was this
-- backfilled?" flag is lost).


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

alter table public.directory_entries drop column seo_metadata_ai_generated_at;


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directory_entries' and column_name = 'seo_metadata_ai_generated_at') then
    raise exception 'ROLLBACK VERIFY FAILED: directory_entries.seo_metadata_ai_generated_at still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

select 'directory_entries' as tbl, count(*) as rows from public.directory_entries;

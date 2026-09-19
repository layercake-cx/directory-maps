-- ============================================================
-- Rollback: 20260919150000_create_directory_content_pages
-- Reverses: drops public.directory_content_pages entirely.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_content_pages') then
    raise exception 'ABORT: nothing to roll back — directory_content_pages does not exist';
  end if;
end $$;

-- Data-loss guard — every page's title/body is lost when this table is
-- dropped. Export this output first if any rows exist and the content
-- matters.
select id, directory_id, title, slug, is_active, created_at from public.directory_content_pages order by directory_id, position;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop table if exists public.directory_content_pages;


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_content_pages') then
    raise exception 'ROLLBACK VERIFY FAILED: directory_content_pages still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

select 'directories' as tbl, count(*) as rows from public.directories union all
  select 'directory_entries', count(*) from public.directory_entries
order by tbl;

-- ============================================================
-- Rollback: 20260914210000_directory_seo_og_image
-- Reverses: adding directories.seo_og_image_url
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directories' and column_name = 'seo_og_image_url') then
    raise exception 'ABORT: nothing to roll back — directories.seo_og_image_url does not exist';
  end if;
end $$;

-- Data-loss guard — this column is dropped below, so surface anything set first.
select id, name, seo_og_image_url from public.directories where seo_og_image_url is not null;
-- If this returns rows, confirm the loss of those values is acceptable before proceeding.


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

alter table public.directories drop column seo_og_image_url;


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directories' and column_name = 'seo_og_image_url') then
    raise exception 'ROLLBACK VERIFY FAILED: directories.seo_og_image_url still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

select 'directories' as tbl, count(*) as rows from public.directories;

-- ============================================================
-- Rollback: 20260828120000_directory_site_generation_status
-- Reverses: the 4 new directories.site_generation_* columns.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directories' and column_name = 'site_generation_status') then
    raise notice 'directories.site_generation_status already absent — nothing to roll back';
    return;
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

alter table public.directories
  drop column if exists site_generation_status,
  drop column if exists site_generation_started_at,
  drop column if exists site_generated_at,
  drop column if exists site_generation_error;


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directories' and column_name = 'site_generation_status') then
    raise exception 'ROLLBACK VERIFY FAILED: directories.site_generation_status still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

select 'directories' as tbl, count(*) as rows from public.directories;

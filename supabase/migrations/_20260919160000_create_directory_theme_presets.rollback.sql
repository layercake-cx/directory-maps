-- ============================================================
-- Rollback: 20260919160000_create_directory_theme_presets
-- Reverses: drops public.directory_theme_presets entirely.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_theme_presets') then
    raise exception 'ABORT: nothing to roll back — directory_theme_presets does not exist';
  end if;
end $$;

-- Data-loss guard — every saved preset's name/theme_json is lost when this
-- table is dropped. Export this output first if any rows exist and the
-- content matters (a directory that already applied a preset is
-- unaffected — theme_json was copied into it, not referenced).
select id, client_id, name, created_at from public.directory_theme_presets order by client_id, created_at;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop table if exists public.directory_theme_presets;


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_theme_presets') then
    raise exception 'ROLLBACK VERIFY FAILED: directory_theme_presets still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

select 'clients' as tbl, count(*) as rows from public.clients union all
  select 'directories', count(*) from public.directories
order by tbl;

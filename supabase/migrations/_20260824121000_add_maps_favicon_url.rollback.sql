-- ============================================================
-- Rollback: 20260824121000_add_maps_favicon_url
-- Reverses: drops the favicon_url column from maps.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'maps' and column_name = 'favicon_url'
  ) then
    raise exception 'ABORT: nothing to roll back — column maps.favicon_url does not exist';
  end if;

  if exists (select 1 from public.maps where favicon_url is not null limit 1) then
    raise exception
      'ABORT: at least one map has a favicon_url set. Export/record those values '
      'before rolling back — dropping the column is destructive. '
      'To override, remove this check and re-run.';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

alter table public.maps drop column if exists favicon_url;


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'maps' and column_name = 'favicon_url'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: maps.favicon_url still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

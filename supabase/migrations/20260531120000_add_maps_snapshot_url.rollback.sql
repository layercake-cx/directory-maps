-- ============================================================
-- Rollback: 20260531120000_add_maps_snapshot_url
-- Reverses: add columns snapshot_url and snapshot_generated_at to maps
-- ============================================================

-- PRE-ROLLBACK CHECK
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'maps'
      and column_name = 'snapshot_url'
  ) then
    raise exception 'ABORT: column snapshot_url does not exist — nothing to roll back';
  end if;
end $$;

-- THE ROLLBACK
alter table public.maps
  drop column if exists snapshot_url,
  drop column if exists snapshot_generated_at;

-- POST-ROLLBACK VERIFICATION
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'maps'
      and column_name = 'snapshot_url'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: column snapshot_url still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED: snapshot_url and snapshot_generated_at removed';
end $$;
